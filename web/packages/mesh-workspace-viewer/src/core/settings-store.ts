import { mergeViewerSettings, normalizeViewerSettings } from "./defaults";
import type { ViewerPersistenceAdapter, ViewerSettings } from "./types";

export function loadViewerSettings(
  adapter?: ViewerPersistenceAdapter | null,
  fallback?: Partial<ViewerSettings> | null,
): Promise<ViewerSettings> {
  const safeFallback = normalizeViewerSettings(fallback);
  if (!adapter) {
    return Promise.resolve(safeFallback);
  }

  return Promise.resolve(adapter.loadSettings())
    .then((stored) => mergeViewerSettings(safeFallback, stored))
    .catch(() => safeFallback);
}

export function saveViewerSettings(
  adapter: ViewerPersistenceAdapter | null | undefined,
  settings: Partial<ViewerSettings> | null | undefined,
): Promise<ViewerSettings> {
  const normalized = normalizeViewerSettings(settings);
  if (!adapter) {
    return Promise.resolve(normalized);
  }

  return Promise.resolve(adapter.saveSettings(normalized))
    .then(() => normalized)
    .catch(() => normalized);
}

export function createLocalStorageViewerPersistenceAdapter(
  storageKey = "mesh-workspace-viewer.settings",
): ViewerPersistenceAdapter {
  return {
    loadSettings() {
      if (typeof window === "undefined") {
        return null;
      }

      try {
        const raw = window.localStorage.getItem(storageKey);
        if (!raw) {
          return null;
        }

        return JSON.parse(raw) as Partial<ViewerSettings>;
      } catch {
        return null;
      }
    },
    saveSettings(settings) {
      if (typeof window === "undefined") {
        return;
      }

      try {
        window.localStorage.setItem(storageKey, JSON.stringify(normalizeViewerSettings(settings)));
      } catch {
        // Keep the session interactive even if persistence fails.
      }
    },
  };
}
