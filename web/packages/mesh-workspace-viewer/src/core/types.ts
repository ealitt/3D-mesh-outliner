import type { ComponentChildren, JSX } from "preact";
import type { Object3D } from "three";

export type CameraMode = "perspective" | "top";
export type SceneSelectionTarget = "mesh" | "plane" | null;
export type TransformAlignmentMode = "local" | "world";
export type TransformToolMode = "rotate" | "translate";

export interface ViewerMeshInput {
  centroid: [number, number, number];
  extents: [number, number, number];
  fileName?: string;
  id: string;
  object3d: Object3D;
}

export interface PlaneState {
  basisUWorld: [number, number, number];
  basisVWorld: [number, number, number];
  normalWorld: [number, number, number];
  originWorld: [number, number, number];
  revision: number;
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

export interface FocusOutlineRequest {
  nonce: number;
  rings: RingSet2D[];
}

export interface ViewerSettings {
  alignmentSpace: TransformAlignmentMode;
  showBuildPlate: boolean;
}

export interface MeshWorkspaceViewerCopy {
  alignmentObjectShort: string;
  alignmentToObjectTitle: string;
  alignmentToWorldTitle: string;
  alignmentWorldShort: string;
  browseFiles: string;
  cameraPerspective: string;
  dropToPlateButton: string;
  dropToPlateTitle: string;
  emptyFormats: string;
  emptyTitle: string;
  fitCameraButton: string;
  fitCameraTitle: string;
  hideFacesButton: string;
  layFlatButton: string;
  layFlatMode: string;
  layFlatTitle: string;
  moveButton: string;
  moveMode: string;
  moveTitle: string;
  noSelection: string;
  planeSelected: string;
  preparingCopy: string;
  preparingTitle: string;
  resetOrientationButton: string;
  resetOrientationTitle: string;
  resetPlaneButton: string;
  resetPlaneTitle: string;
  rotateButton: string;
  rotateMode: string;
  rotateTitle: string;
  viewerErrorFallback: string;
  viewerErrorTitle: string;
  meshSelected: string;
}

export interface ViewerSettingsButtonCopy {
  alignmentLabel: string;
  buildPlateCopy: string;
  buildPlateLabel: string;
  objectOption: string;
  transformAlignmentLabel: string;
  worldOption: string;
}

export interface ViewerPersistenceAdapter {
  loadSettings(): Promise<Partial<ViewerSettings> | null> | Partial<ViewerSettings> | null;
  saveSettings(settings: ViewerSettings): Promise<void> | void;
}

export interface MeshWorkspaceViewerProps {
  cameraMode: CameraMode;
  className?: string;
  focusOutlineRequest?: FocusOutlineRequest | null;
  highlightedProjectionRings?: RingSet2D[] | null;
  isPreparing?: boolean;
  mesh: ViewerMeshInput | null;
  offsetRings?: RingSet2D[] | null;
  onBrowseRequest: () => void;
  onPlaneRotationChange: (rotationDegrees: [number, number, number]) => void;
  onPlaneTranslationChange: (translation: [number, number, number]) => void;
  onResetOrientation: () => void;
  onResetPlaneOrientation: () => void;
  onRotationChange: (rotationDegrees: [number, number, number]) => void;
  onSelectionChange: (target: SceneSelectionTarget) => void;
  onSettingsChange?: (settings: ViewerSettings) => void;
  onTranslationChange: (translation: [number, number, number]) => void;
  planeAnchorLocal?: [number, number, number] | null;
  planeCutEnabled?: boolean;
  planeState?: PlaneState | null;
  projectionLayers?: PreviewOutlineLayer[];
  rotationDegrees: [number, number, number];
  copy?: Partial<MeshWorkspaceViewerCopy>;
  settings?: Partial<ViewerSettings>;
  style?: JSX.CSSProperties;
  translation: [number, number, number];
}

export interface ViewerSettingsButtonProps {
  buttonAriaLabel?: string;
  buttonClassName?: string;
  buttonTitle?: string;
  children?: ComponentChildren;
  className?: string;
  note?: string;
  popoverKicker?: string;
  popoverTitle?: string;
  copy?: Partial<ViewerSettingsButtonCopy>;
  settings: Partial<ViewerSettings>;
  onSettingsChange?: (settings: ViewerSettings) => void;
  showBuildPlateControl?: boolean;
}
