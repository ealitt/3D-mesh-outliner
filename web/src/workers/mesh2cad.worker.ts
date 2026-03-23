/// <reference lib="webworker" />

import type { WorkerErrorResponse, WorkerProcessRequest, WorkerResultResponse, WorkerStatusResponse } from "../lib/types";

declare const self: DedicatedWorkerGlobalScope;

const PYODIDE_VERSION = "0.28.3";
const PYODIDE_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

let runtime: any | null = null;
let runtimeReady: Promise<void> | null = null;

self.onmessage = (event: MessageEvent<WorkerProcessRequest>) => {
  void handleProcess(event.data);
};

async function handleProcess(message: WorkerProcessRequest) {
  try {
    await ensureRuntime(message.basePath, message.id);
    postStatus(message.id, "Running projection pipeline in Pyodide...");

    const filePath = `/tmp/${sanitizeFileName(message.fileName)}`;
    runtime.FS.mkdirTree("/tmp");
    runtime.FS.writeFile(filePath, new Uint8Array(message.fileBuffer));
    runtime.globals.set(
      "payload_json",
      JSON.stringify({
        filePath,
        fileType: message.fileType,
        settings: message.settings,
      }),
    );

    const json = await runtime.runPythonAsync(`
import base64
import json

from mesh2cad import ExportSpec, ProcessSpec, ProjectionSpec, run_pipeline

payload = json.loads(payload_json)
settings = payload["settings"]

result = run_pipeline(
    payload["filePath"],
    file_type=payload["fileType"],
    projection=ProjectionSpec(
        direction=tuple(settings["direction"]),
        precise=settings["precise"],
        ignore_sign=settings["ignoreSign"],
    ),
    process=ProcessSpec(
        source_units=settings["sourceUnits"],
        output_units=settings["outputUnits"],
        scale=settings["scale"],
        offset_distance=settings["offsetDistance"],
        offset_stage=settings["offsetStage"],
        keep_mode=settings["keepMode"],
        min_area=settings["minArea"],
        simplify_tolerance=settings["simplifyTolerance"],
        join_style=settings["joinStyle"],
    ),
    export=ExportSpec(
        write_svg=True,
        write_dxf=True,
        svg_stroke_width=settings["svgStrokeWidth"],
        include_hatch=settings["includeHatch"],
    ),
)

json.dumps(
    {
        "svgText": result.svg_text,
        "dxfBase64": (
            base64.b64encode(result.dxf_bytes).decode("ascii")
            if result.dxf_bytes is not None
            else None
        ),
        "area": result.area,
        "bounds": list(result.bounds),
        "bodyCount": result.body_count,
        "warnings": result.warnings,
        "units": result.units,
    }
)
`);

    const response: WorkerResultResponse = {
      id: message.id,
      result: JSON.parse(json),
      type: "result",
    };
    self.postMessage(response);
  } catch (error) {
    const response: WorkerErrorResponse = {
      id: message.id,
      message: error instanceof Error ? error.message : "Pyodide processing failed.",
      type: "error",
    };
    self.postMessage(response);
  }
}

async function ensureRuntime(basePath: string, requestId: number) {
  if (runtime && runtimeReady) {
    await runtimeReady;
    return;
  }

  if (!runtimeReady) {
    runtimeReady = (async () => {
      postStatus(requestId, "Booting Pyodide runtime...");
      const pyodideModule = await import(/* @vite-ignore */ `${PYODIDE_INDEX_URL}pyodide.mjs`);
      runtime = await pyodideModule.loadPyodide({
        indexURL: PYODIDE_INDEX_URL,
      });

      postStatus(requestId, "Loading geometry dependencies...");
      await runtime.loadPackage(["micropip", "numpy", "shapely", "lxml", "networkx"]);
      await runtime.runPythonAsync(`
import micropip
await micropip.install(["trimesh==4.11.4", "ezdxf==1.4.3"])
`);

      postStatus(requestId, "Syncing mesh2cad Python modules...");
      const manifest = await fetchJson<{ files: string[] }>(
        new URL(`${basePath}python/manifest.json`, self.location.origin).toString(),
      );

      runtime.FS.mkdirTree("/workspace/mesh2cad");
      for (const fileName of manifest.files) {
        const code = await fetchText(
          new URL(`${basePath}python/mesh2cad/${fileName}`, self.location.origin).toString(),
        );
        runtime.FS.writeFile(`/workspace/mesh2cad/${fileName}`, code);
      }

      runtime.runPython(`
import sys
if "/workspace" not in sys.path:
    sys.path.insert(0, "/workspace")
`);
    })();
  }

  await runtimeReady;
}

function postStatus(id: number, message: string) {
  const response: WorkerStatusResponse = { id, message, type: "status" };
  self.postMessage(response);
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}`);
  }
  return (await response.json()) as T;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}`);
  }
  return await response.text();
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

export {};
