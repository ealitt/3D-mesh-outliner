import { describe, expect, it } from "vitest";
import { createLocalStorageViewerPersistenceAdapter, loadViewerSettings, saveViewerSettings } from "../core/settings-store";

describe("settings-store", () => {
  it("round-trips viewer settings through the local storage adapter", async () => {
    const adapter = createLocalStorageViewerPersistenceAdapter("mesh-workspace-viewer.test");
    window.localStorage.removeItem("mesh-workspace-viewer.test");

    await saveViewerSettings(adapter, {
      alignmentSpace: "world",
      showBuildPlate: false,
    });

    await expect(loadViewerSettings(adapter)).resolves.toEqual({
      alignmentSpace: "world",
      showBuildPlate: false,
    });
  });

  it("falls back safely when storage is empty", async () => {
    const adapter = createLocalStorageViewerPersistenceAdapter("mesh-workspace-viewer.empty");
    window.localStorage.removeItem("mesh-workspace-viewer.empty");

    await expect(loadViewerSettings(adapter)).resolves.toEqual({
      alignmentSpace: "local",
      showBuildPlate: true,
    });
  });
});
