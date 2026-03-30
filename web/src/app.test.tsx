import { fireEvent, render, screen } from "@testing-library/preact";
import { beforeEach, describe, expect, it } from "vitest";
import App from "./app";

describe("App", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders the mesh studio shell", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", {
        name: /Mesh to CAD outline studio/i,
      }),
    ).toBeTruthy();

    expect(screen.getByText(/Drop mesh or browse/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Create Projection/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Export SVG/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Create Projection/i }).getAttribute("title")).toMatch(/\(p\)/i);
    expect(screen.getByText(/Projection \+ offset/i)).toBeTruthy();
    expect(screen.getByText(/Mesh \+ plane pose/i)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Meshes" })).toBeTruthy();
    expect(screen.getByLabelText(/2D stroke size/i)).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Top view/i })).toBeTruthy();
  });

  it("shows a whole-screen drop target when files are dragged over the window", () => {
    render(<App />);

    fireEvent.dragEnter(window, {
      dataTransfer: {
        types: ["Files"],
      },
    });

    expect(screen.getByText(/Release anywhere on the page/i)).toBeTruthy();
  });

  it("switches the shell to Japanese from studio settings", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /open studio settings/i }));
    fireEvent.change(screen.getByLabelText(/language/i), {
      currentTarget: { value: "ja" },
      target: { value: "ja" },
    });

    expect(
      screen.getByRole("heading", {
        name: "Mesh to CAD アウトラインスタジオ",
      }),
    ).toBeTruthy();
    expect(screen.getByRole("tab", { name: /3D 表示/i })).toBeTruthy();
    expect(screen.getByText(/ライブ投影/i)).toBeTruthy();
  });
});
