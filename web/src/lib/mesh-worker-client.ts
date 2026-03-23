import { BASE_PATH } from "./base-path";
import type {
  PipelineBrowserResult,
  PreparedMesh,
  ProcessSettings,
  WorkerResponse,
} from "./types";

type PendingRequest = {
  onStatus: (message: string) => void;
  reject: (reason?: unknown) => void;
  resolve: (value: PipelineBrowserResult) => void;
};

let nextRequestId = 0;
let workerPromise: Promise<Worker> | null = null;
const pending = new Map<number, PendingRequest>();

export async function processMeshFile(
  mesh: PreparedMesh,
  settings: ProcessSettings,
  onStatus: (message: string) => void,
): Promise<PipelineBrowserResult> {
  const worker = await getWorker();
  const id = nextRequestId++;

  return await new Promise<PipelineBrowserResult>((resolve, reject) => {
    pending.set(id, { onStatus, reject, resolve });

    worker.postMessage({
      basePath: BASE_PATH,
      fileBuffer: mesh.arrayBuffer.slice(0),
      fileName: mesh.fileName,
      fileType: mesh.fileType,
      id,
      settings,
      type: "process",
    });
  });
}

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const WorkerCtor = (await import("../workers/mesh2cad.worker?worker")).default;
      const worker = new WorkerCtor();

      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const message = event.data;
        const request = pending.get(message.id);
        if (!request) {
          return;
        }

        if (message.type === "status") {
          request.onStatus(message.message);
          return;
        }

        pending.delete(message.id);

        if (message.type === "result") {
          request.resolve(message.result);
          return;
        }

        request.reject(new Error(message.message));
      };

      worker.onerror = (event) => {
        const failure = new Error(event.message || "Projection worker crashed.");
        for (const [id, request] of pending.entries()) {
          pending.delete(id);
          request.reject(failure);
        }
      };

      return worker;
    })();
  }

  return workerPromise;
}
