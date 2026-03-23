import { render, screen } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import App from "./app";

describe("App", () => {
  it("renders the mesh studio shell", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", {
        name: /Mesh to CAD outline studio/i,
      }),
    ).toBeTruthy();

    expect(screen.getByText(/Supports STL, OBJ, PLY, GLB, and 3MF/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Generate projection/i })).toBeTruthy();
  });
});
