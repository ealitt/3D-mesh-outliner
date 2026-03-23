import type { Object3D } from "three";

export type MeshFileType = "3mf" | "glb" | "obj" | "ply" | "stl";
export type JoinStyle = "bevel" | "mitre" | "round";
export type KeepMode = "all" | "largest" | "outer_only";
export type OffsetStage = "post_scale" | "pre_scale";
export type ViewPresetName =
  | "back"
  | "bottom"
  | "custom"
  | "front"
  | "left"
  | "right"
  | "top";

export interface PreparedMesh {
  arrayBuffer: ArrayBuffer;
  extents: [number, number, number];
  fileName: string;
  fileType: MeshFileType;
  meshCount: number;
  object3d: Object3D;
  triangleCount: number;
}

export interface ProcessSettings {
  direction: [number, number, number];
  ignoreSign: boolean;
  includeHatch: boolean;
  joinStyle: JoinStyle;
  keepMode: KeepMode;
  minArea: number;
  offsetDistance: number;
  offsetStage: OffsetStage;
  outputUnits: string;
  precise: boolean;
  scale: number;
  simplifyTolerance: number;
  sourceUnits: string | null;
  svgStrokeWidth: number;
  viewPreset: ViewPresetName;
}

export interface PipelineBrowserResult {
  area: number;
  bodyCount: number;
  bounds: [number, number, number, number];
  dxfBase64: string | null;
  svgText: string | null;
  units: string | null;
  warnings: string[];
}

export interface WorkerProcessRequest {
  basePath: string;
  fileBuffer: ArrayBuffer;
  fileName: string;
  fileType: MeshFileType;
  id: number;
  settings: ProcessSettings;
  type: "process";
}

export interface WorkerStatusResponse {
  id: number;
  message: string;
  type: "status";
}

export interface WorkerResultResponse {
  id: number;
  result: PipelineBrowserResult;
  type: "result";
}

export interface WorkerErrorResponse {
  id: number;
  message: string;
  type: "error";
}

export type WorkerResponse =
  | WorkerErrorResponse
  | WorkerResultResponse
  | WorkerStatusResponse;
