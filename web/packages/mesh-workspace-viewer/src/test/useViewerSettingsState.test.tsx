import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import type { ViewerPersistenceAdapter, ViewerSettings } from "../core/types";
import { useViewerSettingsState } from "../react/useViewerSettingsState";

describe("useViewerSettingsState", () => {
  it("hydrates and persists settings across remounts", async () => {
    let stored: Partial<ViewerSettings> | null = {
      alignmentSpace: "world",
      showBuildPlate: true,
    };

    const adapter: ViewerPersistenceAdapter = {
      loadSettings() {
        return stored;
      },
      saveSettings(settings) {
        stored = settings;
      },
    };

    function Harness() {
      const { settings, updateSettings } = useViewerSettingsState({ persistenceAdapter: adapter });

      return (
        <button
          onClick={() =>
            updateSettings({
              alignmentSpace: settings.alignmentSpace === "local" ? "world" : "local",
            })}
          type="button"
        >
          {settings.alignmentSpace}
        </button>
      );
    }

    const firstRender = render(<Harness />);
    await waitFor(() => expect(screen.getByRole("button", { name: "world" })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "world" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "local" })).toBeTruthy());

    firstRender.unmount();
    render(<Harness />);

    await waitFor(() => expect(screen.getByRole("button", { name: "local" })).toBeTruthy());
  });
});
