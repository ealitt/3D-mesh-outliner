import type { Object3D } from "three";

export type MeshFileType = "3mf" | "glb" | "obj" | "ply" | "stl";
export type JoinStyle = "bevel" | "mitre" | "round";
export type KeepMode = "all" | "largest" | "outer_only";
export type OffsetStage = "post_scale" | "pre_scale";
export type ExportSelection = "both" | "offset" | "projection";
export type ProjectionMode = "plane_cut" | "silhouette";
export type SceneSelectionTarget = "mesh" | "plane" | null;
export type TransformAlignmentMode = "local" | "world";
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
  bodies: PreparedMeshBody[];
  centroid: [number, number, number];
  defaultRotationDegrees: [number, number, number];
  extents: [number, number, number];
  fileName: string;
  fileType: MeshFileType;
  id: string;
  indices: Uint32Array;
  meshCount: number;
  object3d: Object3D;
  positions: Float64Array;
  triangleCount: number;
}

export interface PreparedMeshBody {
  id: string;
  indices: Uint32Array;
  name: string;
  positions: Float64Array;
  triangleCount: number;
}

export interface ProcessSettings {
  direction: [number, number, number];
  joinStyle: JoinStyle;
  keepMode: KeepMode;
  minArea: number;
  offsetDistance: number;
  offsetStage: OffsetStage;
  outputUnits: string;
  planeOrigin?: [number, number, number] | null;
  planeRotationDegrees: [number, number, number];
  planeTranslation: [number, number, number];
  projectionMode: ProjectionMode;
  rotationDegrees: [number, number, number];
  rotationOrigin: [number, number, number];
  scale: number;
  snapGrid: number | null;
  simplifyTolerance: number;
  sourceUnits: string | null;
  svgStrokeWidth: number;
  translation: [number, number, number];
  unionBatchSize: number;
}

export interface PlaneState {
  basisUWorld: [number, number, number];
  basisVWorld: [number, number, number];
  normalWorld: [number, number, number];
  originWorld: [number, number, number];
  revision: number;
}

export interface PipelineBrowserResult {
  area: number;
  bodyCount: number;
  bounds: [number, number, number, number];
  rings: RingSet2D[];
  timings?: Record<string, number>;
  units: string | null;
  warnings: string[];
}

export interface RingSet2D {
  exterior: [number, number][];
  holes: [number, number][][];
}

export interface PreviewOutlineLayer {
  color: string;
  dimmed?: boolean;
  id: string;
  meshId?: string;
  rings: RingSet2D[];
}

export interface PreviewSelectionDetails {
  clickedMeshId: string | null;
  clientX: number;
  clientY: number;
}

export interface FocusOutlineRequest {
  nonce: number;
  rings: RingSet2D[];
}

export interface WorkerProcessRequest {
  id: number;
  meshId: string;
  planeState: PlaneState | null;
  settings: ProcessSettings;
  type: "process";
}

export interface WorkerOffsetRequest {
  id: number;
  joinStyle: JoinStyle;
  offsetDistance: number;
  rings: RingSet2D[];
  type: "offset";
  units: string | null;
}

export interface WorkerUnionRequest {
  id: number;
  rings: RingSet2D[];
  type: "union";
  units: string | null;
}

export interface WorkerWarmupRequest {
  id: number;
  type: "warmup";
}

export interface WorkerRegisterRequest {
  id: number;
  indicesBuffer: ArrayBuffer;
  meshId: string;
  positionsBuffer: ArrayBuffer;
  type: "register";
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

export interface WorkerReadyResponse {
  id: number;
  type: "ready";
}

export type WorkerResponse =
  | WorkerErrorResponse
  | WorkerReadyResponse
  | WorkerResultResponse
  | WorkerStatusResponse;

export type WorkerRequest =
  | WorkerOffsetRequest
  | WorkerProcessRequest
  | WorkerRegisterRequest
  | WorkerUnionRequest
  | WorkerWarmupRequest;
