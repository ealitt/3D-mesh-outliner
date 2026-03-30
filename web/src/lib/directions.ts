import type { JoinStyle, KeepMode, OffsetStage, ViewPresetName } from "./types";

export const VIEW_PRESETS: Record<Exclude<ViewPresetName, "custom">, [number, number, number]> =
  {
    top: [0, 0, 1],
    bottom: [0, 0, -1],
    front: [0, -1, 0],
    back: [0, 1, 0],
    left: [-1, 0, 0],
    right: [1, 0, 0],
  };

export const VIEW_LABELS: Record<ViewPresetName, string> = {
  top: "Top",
  bottom: "Bottom",
  front: "Front",
  back: "Back",
  left: "Left",
  right: "Right",
  custom: "Custom",
};

export const KEEP_MODE_OPTIONS: Array<{ description: string; value: KeepMode }> = [
  { value: "outer_only", description: "Cast a top-down shadow and keep only the outer outline" },
  { value: "largest", description: "Keep the dominant projected body" },
  { value: "all", description: "Keep every projected body above the area filter" },
];

export const OFFSET_STAGE_OPTIONS: Array<{ description: string; value: OffsetStage }> = [
  { value: "post_scale", description: "Scale first, then apply manufacturing offset" },
  { value: "pre_scale", description: "Offset first in source units, then scale down" },
];

export const JOIN_STYLE_OPTIONS: Array<{ description: string; value: JoinStyle }> = [
  { value: "round", description: "Smooth corners for padding-like offsets" },
  { value: "mitre", description: "Sharp corners for CAD-like outlines" },
  { value: "bevel", description: "Chamfer corners for safer inward shrinkage" },
];

export const UNIT_OPTIONS = [
  { value: null, label: "Auto / assume millimeters (mm)" },
  { value: "mm", label: "Millimeters (mm)" },
  { value: "cm", label: "Centimeters (cm)" },
  { value: "m", label: "Meters (m)" },
  { value: "in", label: "Inches (in)" },
  { value: "foot", label: "Feet" },
];

export const OUTPUT_UNIT_OPTIONS = UNIT_OPTIONS.filter((option) => option.value !== null);

export const MESH_ACCEPT =
  ".stl,.obj,.ply,.glb,.3mf,model/stl,model/obj,model/ply,model/gltf-binary";

export function presetDirection(viewPreset: Exclude<ViewPresetName, "custom">): [
  number,
  number,
  number,
] {
  return [...VIEW_PRESETS[viewPreset]] as [number, number, number];
}

export function normalizeDirectionInput(input: [number, number, number]): [
  number,
  number,
  number,
] {
  const [x, y, z] = input.map((value) => Number(value)) as [number, number, number];
  const magnitude = Math.hypot(x, y, z);
  if (!Number.isFinite(magnitude) || magnitude === 0) {
    throw new Error("Direction must contain a non-zero X, Y, Z vector.");
  }
  return [x / magnitude, y / magnitude, z / magnitude];
}

export function stemFromFileName(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  return lastDot > 0 ? fileName.slice(0, lastDot) : fileName;
}
