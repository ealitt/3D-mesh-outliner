import { describe, expect, it } from "vitest";
import { normalizeDirectionInput, presetDirection, stemFromFileName } from "./directions";

describe("directions helpers", () => {
  it("returns preset directions in trimesh-compatible orientation", () => {
    expect(presetDirection("top")).toEqual([0, 0, 1]);
    expect(presetDirection("front")).toEqual([0, -1, 0]);
  });

  it("normalizes custom vectors", () => {
    expect(normalizeDirectionInput([0, 0, 10])).toEqual([0, 0, 1]);
  });

  it("extracts file stems for export naming", () => {
    expect(stemFromFileName("gearbox.3mf")).toBe("gearbox");
  });
});
