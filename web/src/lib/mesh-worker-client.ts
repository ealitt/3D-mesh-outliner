import type {
  PlaneState,
  PipelineBrowserResult,
  PreparedMesh,
  PreparedMeshBody,
  ProcessSettings,
  RingSet2D,
  WorkerResponse,
} from "./types";

type WorkerMeshSource = Pick<PreparedMesh, "id" | "indices" | "positions"> | PreparedMeshBody;

type PendingRequest = {
  onStatus: (message: string) => void;
  reject: (reason?: unknown) => void;
  resolve: (value: PipelineBrowserResult) => void;
};

type PendingWarmup = {
  onStatus: (message: string) => void;
  reject: (reason?: unknown) => void;
  resolve: () => void;
};

let nextRequestId = 0;
let workerPromise: Promise<Worker> | null = null;
const pending = new Map<number, PendingRequest>();
const pendingWarmups = new Map<number, PendingWarmup>();
const registeredMeshes = new Set<string>();
let warmupPromise: Promise<void> | null = null;

export async function processMeshFile(
  mesh: WorkerMeshSource,
  settings: ProcessSettings,
  planeState: PlaneState | null,
  onStatus: (message: string) => void,
): Promise<PipelineBrowserResult> {
  const worker = await getWorker();
  await ensureMeshRegistered(worker, mesh, onStatus);
  const id = nextRequestId++;

  return await new Promise<PipelineBrowserResult>((resolve, reject) => {
    pending.set(id, { onStatus, reject, resolve });
    worker.postMessage({
      id,
      meshId: mesh.id,
      planeState,
      settings,
      type: "process",
    });
  });
}

export async function unionProjectedRings(
  rings: RingSet2D[],
  units: string | null,
  onStatus: (message: string) => void,
): Promise<PipelineBrowserResult> {
  const worker = await getWorker();
  const id = nextRequestId++;

  return await new Promise<PipelineBrowserResult>((resolve, reject) => {
    pending.set(id, { onStatus, reject, resolve });
    worker.postMessage({
      id,
      rings,
      type: "union",
      units,
    });
  });
}

export async function offsetProjectedRings(
  rings: RingSet2D[],
  options: {
    joinStyle: ProcessSettings["joinStyle"];
    offsetDistance: number;
    units: string | null;
  },
  onStatus: (message: string) => void,
): Promise<PipelineBrowserResult> {
  const worker = await getWorker();
  const id = nextRequestId++;

  return await new Promise<PipelineBrowserResult>((resolve, reject) => {
    pending.set(id, { onStatus, reject, resolve });
    worker.postMessage({
      id,
      joinStyle: options.joinStyle,
      offsetDistance: options.offsetDistance,
      rings,
      type: "offset",
      units: options.units,
    });
  });
}

export async function warmMeshWorker(onStatus?: (message: string) => void): Promise<void> {
  if (!warmupPromise) {
    warmupPromise = (async () => {
      const worker = await getWorker();
      const id = nextRequestId++;

      await new Promise<void>((resolve, reject) => {
        pendingWarmups.set(id, {
          onStatus: onStatus ?? (() => {}),
          reject,
          resolve,
        });
        worker.postMessage({
          id,
          type: "warmup",
        });
      });
    })().catch((error) => {
      warmupPromise = null;
      throw error;
    });
  }

  return await warmupPromise;
}

async function ensureMeshRegistered(
  worker: Worker,
  mesh: WorkerMeshSource,
  onStatus: (message: string) => void,
) {
  if (registeredMeshes.has(mesh.id)) {
    return;
  }

  const id = nextRequestId++;
  const positions = mesh.positions.slice();
  const indices = mesh.indices.slice();
  await new Promise<void>((resolve, reject) => {
    pendingWarmups.set(id, { onStatus, reject, resolve });
    worker.postMessage(
      {
        id,
        indicesBuffer: indices.buffer,
        meshId: mesh.id,
        positionsBuffer: positions.buffer,
        type: "register",
      },
      [indices.buffer, positions.buffer],
    );
  });
  registeredMeshes.add(mesh.id);
}

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const WorkerCtor = (await import("../workers/mesh2cad.worker?worker")).default;
      const worker = new WorkerCtor();

      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const message = event.data;
        const warmup = pendingWarmups.get(message.id);
        if (warmup) {
          if (message.type === "status") {
            warmup.onStatus(message.message);
            return;
          }

          pendingWarmups.delete(message.id);
          if (message.type === "ready") {
            warmup.resolve();
            return;
          }

          warmup.reject(
            new Error(message.type === "error" ? message.message : "Wasm worker warmup failed."),
          );
          return;
        }

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

        request.reject(
          new Error(message.type === "error" ? message.message : "Unexpected worker response."),
        );
      };

      worker.onerror = (event) => {
        const failure = new Error(event.message || "Wasm projection worker crashed.");
        for (const [id, request] of pendingWarmups.entries()) {
          pendingWarmups.delete(id);
          request.reject(failure);
        }
        warmupPromise = null;
        for (const [id, request] of pending.entries()) {
          pending.delete(id);
          request.reject(failure);
        }
        registeredMeshes.clear();
        worker.terminate();
        workerPromise = null;
      };

      return worker;
    })();
  }

  return workerPromise;
}
