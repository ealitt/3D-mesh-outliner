import { describe, expect, it } from "vitest";
import { collectFlatFaceCandidates } from "../core/mesh-analysis";

describe("mesh-analysis", () => {
  it("finds the major planar faces on a box", async () => {
    const THREE = await import("three");
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(10, 20, 30));
    const group = new THREE.Group();
    group.add(mesh);

    const candidates = collectFlatFaceCandidates(THREE, group);
    const normals = new Set(candidates.map((candidate) => candidate.normal.map((value) => value.toFixed(0)).join(",")));

    expect(candidates.length).toBeGreaterThanOrEqual(6);
    expect(normals.has("1,0,0")).toBe(true);
    expect(normals.has("-1,0,0")).toBe(true);
    expect(normals.has("0,1,0")).toBe(true);
    expect(normals.has("0,-1,0")).toBe(true);
    expect(normals.has("0,0,1")).toBe(true);
    expect(normals.has("0,0,-1")).toBe(true);
  });
});
