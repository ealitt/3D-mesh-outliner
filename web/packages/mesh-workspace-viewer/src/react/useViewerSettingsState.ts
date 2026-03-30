import { useEffect, useState } from "preact/hooks";
import { DEFAULT_VIEWER_SETTINGS, normalizeViewerSettings } from "../core/defaults";
import { loadViewerSettings, saveViewerSettings } from "../core/settings-store";
import type { ViewerPersistenceAdapter, ViewerSettings } from "../core/types";

type SettingsUpdater = ViewerSettings | ((current: ViewerSettings) => ViewerSettings);

export function useViewerSettingsState(options: {
  defaultSettings?: Partial<ViewerSettings>;
  persistenceAdapter?: ViewerPersistenceAdapter | null;
} = {}) {
  const adapter = options.persistenceAdapter ?? null;
  const defaultSettings = normalizeViewerSettings({
    ...DEFAULT_VIEWER_SETTINGS,
    ...(options.defaultSettings ?? {}),
  });
  const [isHydrated, setIsHydrated] = useState(false);
  const [settings, setSettingsState] = useState<ViewerSettings>(defaultSettings);

  useEffect(() => {
    let cancelled = false;

    void loadViewerSettings(adapter, defaultSettings).then((resolved) => {
      if (cancelled) {
        return;
      }

      setSettingsState(resolved);
      setIsHydrated(true);
    });

    return () => {
      cancelled = true;
    };
  }, [adapter, defaultSettings.alignmentSpace, defaultSettings.showBuildPlate]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    void saveViewerSettings(adapter, settings);
  }, [adapter, isHydrated, settings.alignmentSpace, settings.showBuildPlate]);

  function setSettings(nextValue: SettingsUpdater) {
    setSettingsState((current) => {
      const resolved = typeof nextValue === "function"
        ? (nextValue as (current: ViewerSettings) => ViewerSettings)(current)
        : nextValue;

      return normalizeViewerSettings(resolved);
    });
  }

  function updateSettings(patch: Partial<ViewerSettings>) {
    setSettings((current) => normalizeViewerSettings({ ...current, ...patch }));
  }

  function resetSettings() {
    setSettings(defaultSettings);
  }

  return {
    isHydrated,
    resetSettings,
    settings,
    setSettings,
    updateSettings,
  };
}
