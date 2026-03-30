/// <reference lib="webworker" />

import type {
  WorkerErrorResponse,
  WorkerOffsetRequest,
  WorkerProcessRequest,
  WorkerRegisterRequest,
  WorkerReadyResponse,
  WorkerRequest,
  WorkerResultResponse,
  WorkerStatusResponse,
  WorkerUnionRequest,
} from "../lib/types";

declare const self: DedicatedWorkerGlobalScope;

type WasmModule = {
  default: (input?: RequestInfo | URL | Response | BufferSource | WebAssembly.Module) => Promise<unknown>;
  offset_rings: (
    rings: unknown,
    options: unknown,
  ) => unknown;
  union_rings: (
    rings: unknown,
    units: unknown,
  ) => unknown;
  process_mesh: (
    positions: Float64Array,
    indices: Uint32Array,
    options: unknown,
  ) => unknown;
};

type CachedMesh = {
  indices: Uint32Array;
  positions: Float64Array;
};

let runtime: WasmModule | null = null;
let runtimeReady: Promise<void> | null = null;
const meshCache = new Map<string, CachedMesh>();

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  switch (event.data.type) {
    case "warmup":
      void handleWarmup(event.data.id);
      return;
    case "register":
      void handleRegister(event.data);
      return;
    case "process":
      void handleProcess(event.data);
      return;
    case "offset":
      void handleOffset(event.data);
      return;
    case "union":
      void handleUnion(event.data);
      return;
  }
};

async function handleWarmup(id: number) {
  try {
    await ensureRuntime(id);
    self.postMessage({ id, type: "ready" } satisfies WorkerReadyResponse);
  } catch (error) {
    self.postMessage({
      id,
      message: error instanceof Error ? error.message : "Wasm backend warmup failed.",
      type: "error",
    } satisfies WorkerErrorResponse);
  }
}

async function handleRegister(message: WorkerRegisterRequest) {
  try {
    await ensureRuntime(message.id);
    postStatus(message.id, "Caching triangle buffers in the Wasm worker...");
    meshCache.set(message.meshId, {
      indices: new Uint32Array(message.indicesBuffer),
      positions: new Float64Array(message.positionsBuffer),
    });
    self.postMessage({ id: message.id, type: "ready" } satisfies WorkerReadyResponse);
  } catch (error) {
    self.postMessage({
      id: message.id,
      message: error instanceof Error ? error.message : "Wasm mesh registration failed.",
      type: "error",
    } satisfies WorkerErrorResponse);
  }
}

async function handleProcess(message: WorkerProcessRequest) {
  try {
    await ensureRuntime(message.id);
    const mesh = meshCache.get(message.meshId);
    if (!mesh) {
      throw new Error("Cached Wasm mesh was not found. Re-upload the file and try again.");
    }

    postStatus(message.id, "Running the Rust/Wasm silhouette pipeline...");
    const started = performance.now();
    const result = runtime!.process_mesh(mesh.positions, mesh.indices, {
      direction: message.settings.direction,
      joinStyle: message.settings.joinStyle,
      keepMode: message.settings.keepMode,
      minArea: message.settings.minArea,
      offsetDistance: 0,
      offsetStage: message.settings.offsetStage,
      outputUnits: message.settings.outputUnits,
      planeBasisU: message.planeState?.basisUWorld ?? null,
      planeBasisV: message.planeState?.basisVWorld ?? null,
      planeNormal: message.planeState?.normalWorld ?? null,
      planeOrigin: message.planeState?.originWorld ?? message.settings.planeOrigin ?? null,
      planeRotationDegrees: message.settings.planeRotationDegrees,
      planeTranslation: message.settings.planeTranslation,
      projectionMode: message.settings.projectionMode,
      rotationDegrees: message.settings.rotationDegrees,
      rotationOrigin: message.settings.rotationOrigin,
      scale: message.settings.scale,
      simplifyTolerance: message.settings.simplifyTolerance,
      snapGrid: message.settings.snapGrid,
      sourceUnits: message.settings.sourceUnits,
      translation: message.settings.translation,
      unionBatchSize: message.settings.unionBatchSize,
    }) as WorkerResultResponse["result"];

    const pipelineMs = performance.now() - started;
    const response: WorkerResultResponse = {
      id: message.id,
      result: {
        ...result,
        timings: {
          pipelineMs: Number(pipelineMs.toFixed(3)),
        },
      },
      type: "result",
    };
    self.postMessage(response);
  } catch (error) {
    self.postMessage({
      id: message.id,
      message: error instanceof Error ? error.message : "Wasm processing failed.",
      type: "error",
    } satisfies WorkerErrorResponse);
  }
}

async function handleOffset(message: WorkerOffsetRequest) {
  try {
    await ensureRuntime(message.id);
    postStatus(message.id, "Offsetting the projected outline...");
    const started = performance.now();
    const result = runtime!.offset_rings(message.rings, {
      joinStyle: message.joinStyle,
      offsetDistance: message.offsetDistance,
      units: message.units,
    }) as WorkerResultResponse["result"];

    const pipelineMs = performance.now() - started;
    self.postMessage({
      id: message.id,
      result: {
        ...result,
        timings: {
          pipelineMs: Number(pipelineMs.toFixed(3)),
        },
      },
      type: "result",
    } satisfies WorkerResultResponse);
  } catch (error) {
    self.postMessage({
      id: message.id,
      message: error instanceof Error ? error.message : "Wasm offsetting failed.",
      type: "error",
    } satisfies WorkerErrorResponse);
  }
}

async function handleUnion(message: WorkerUnionRequest) {
  try {
    await ensureRuntime(message.id);
    postStatus(message.id, "Joining visible outlines...");
    const started = performance.now();
    const result = runtime!.union_rings(message.rings, message.units) as WorkerResultResponse["result"];
    const pipelineMs = performance.now() - started;

    self.postMessage({
      id: message.id,
      result: {
        ...result,
        timings: {
          pipelineMs: Number(pipelineMs.toFixed(3)),
        },
      },
      type: "result",
    } satisfies WorkerResultResponse);
  } catch (error) {
    self.postMessage({
      id: message.id,
      message: error instanceof Error ? error.message : "Wasm outline union failed.",
      type: "error",
    } satisfies WorkerErrorResponse);
  }
}

async function ensureRuntime(requestId: number) {
  if (runtime && runtimeReady) {
    await runtimeReady;
    return;
  }

  if (!runtimeReady) {
    runtimeReady = (async () => {
      postStatus(requestId, "Loading the Rust/Wasm backend...");
      const module = (await import("../wasm/pkg/mesh2cad_wasm.js")) as WasmModule;
      await module.default();
      runtime = module;
    })();
  }

  await runtimeReady;
}

function postStatus(id: number, message: string) {
  self.postMessage({
    id,
    message,
    type: "status",
  } satisfies WorkerStatusResponse);
}
