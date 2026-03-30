import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { ViewerSettingsButton } from "../react/ViewerSettingsButton";

describe("ViewerSettingsButton", () => {
  it("opens and closes the viewer settings popover", () => {
    render(
      <ViewerSettingsButton
        onSettingsChange={() => {}}
        settings={{ alignmentSpace: "local", showBuildPlate: true }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /open viewer settings/i }));
    expect(screen.getByRole("heading", { name: /settings/i })).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("heading", { name: /settings/i })).toBeNull();
  });

  it("emits normalized settings updates", () => {
    const onSettingsChange = vi.fn();

    render(
      <ViewerSettingsButton
        onSettingsChange={onSettingsChange}
        settings={{ alignmentSpace: "local", showBuildPlate: true }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /open viewer settings/i }));
    fireEvent.change(screen.getByLabelText(/transform alignment/i), {
      currentTarget: { value: "world" },
      target: { value: "world" },
    });

    expect(onSettingsChange).toHaveBeenCalledWith({
      alignmentSpace: "world",
      showBuildPlate: true,
    });
  });
});
