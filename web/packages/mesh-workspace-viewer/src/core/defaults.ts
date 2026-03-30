import type { ViewerSettings } from "./types";

export const DEFAULT_VIEWER_SETTINGS: ViewerSettings = {
  alignmentSpace: "local",
  showBuildPlate: true,
};

export function normalizeViewerSettings(
  value?: Partial<ViewerSettings> | null,
): ViewerSettings {
  return {
    alignmentSpace: value?.alignmentSpace === "world" ? "world" : DEFAULT_VIEWER_SETTINGS.alignmentSpace,
    showBuildPlate:
      typeof value?.showBuildPlate === "boolean"
        ? value.showBuildPlate
        : DEFAULT_VIEWER_SETTINGS.showBuildPlate,
  };
}

export function mergeViewerSettings(
  base: Partial<ViewerSettings> | null | undefined,
  patch: Partial<ViewerSettings> | null | undefined,
): ViewerSettings {
  return normalizeViewerSettings({
    ...normalizeViewerSettings(base),
    ...(patch ?? {}),
  });
}
