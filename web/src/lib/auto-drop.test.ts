import { describe, expect, it } from "vitest";
import { dropMeshToBuildplate, getLowestTransformedMeshZ } from "./auto-drop";

const BOX_MESH = {
  centroid: [5, 10, 15] as [number, number, number],
  positions: new Float64Array([
    0, 0, 10,
    10, 0, 10,
    0, 20, 10,
    10, 20, 10,
    0, 0, 20,
    10, 0, 20,
    0, 20, 20,
    10, 20, 20,
  ]),
};

describe("auto-drop", () => {
  it("grounds a translated mesh without changing x/y", () => {
    const grounded = dropMeshToBuildplate(BOX_MESH, {
      rotationDegrees: [0, 0, 0],
      translation: [12, -4, 7],
    });

    expect(grounded.appliedOffset).toBeCloseTo(-17, 6);
    expect(grounded.translation).toEqual([12, -4, -10]);
    expect(getLowestTransformedMeshZ(BOX_MESH, {
      rotationDegrees: [0, 0, 0],
      translation: grounded.translation,
    })).toBeCloseTo(0, 6);
  });

  it("grounds the mesh after rotation around its centroid", () => {
    const grounded = dropMeshToBuildplate(BOX_MESH, {
      rotationDegrees: [90, 0, 0],
      translation: [3, 2, 0],
    });

    expect(grounded.translation[0]).toBeCloseTo(3, 6);
    expect(grounded.translation[1]).toBeCloseTo(2, 6);
    expect(getLowestTransformedMeshZ(BOX_MESH, {
      rotationDegrees: [90, 0, 0],
      translation: grounded.translation,
    })).toBeCloseTo(0, 6);
  });
});
