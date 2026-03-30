import { describe, expect, it } from "vitest";
import { computeDefaultRotationDegrees, detectMeshFileType, prepareMeshFile } from "./model-loader";

const ASCII_STL = `
solid square
  facet normal 0 0 1
    outer loop
      vertex 0 0 0
      vertex 1 0 0
      vertex 1 1 0
    endloop
  endfacet
  facet normal 0 0 1
    outer loop
      vertex 0 0 0
      vertex 1 1 0
      vertex 0 1 0
    endloop
  endfacet
endsolid square
`;

describe("model-loader", () => {
  it("detects supported mesh file extensions", () => {
    expect(detectMeshFileType("part.stl")).toBe("stl");
    expect(detectMeshFileType("part.3mf")).toBe("3mf");
    expect(detectMeshFileType("part.txt")).toBeNull();
  });

  it("prepares an STL mesh for the Three.js viewer without Python", async () => {
    const file = new File([ASCII_STL], "fixture.stl", { type: "model/stl" });

    const prepared = await prepareMeshFile(file);

    expect(prepared.defaultRotationDegrees).toEqual([0, 0, 0]);
    expect(prepared.fileType).toBe("stl");
    expect(prepared.positions.length).toBeGreaterThan(0);
    expect(prepared.indices.length).toBeGreaterThan(0);
    expect(prepared.bodies).toHaveLength(1);
    expect(prepared.bodies[0]?.positions.length).toBeGreaterThan(0);
    expect(prepared.centroid[0]).toBeCloseTo(0.5, 5);
    expect(prepared.centroid[1]).toBeCloseTo(0.5, 5);
    expect(prepared.centroid[2]).toBeCloseTo(0, 5);
    expect(prepared.meshCount).toBe(1);
    expect(prepared.triangleCount).toBeGreaterThan(0);
    expect(prepared.extents[0]).toBeCloseTo(1, 5);
    expect(prepared.extents[1]).toBeCloseTo(1, 5);
  });

  it("chooses a lay-flat default orientation for tall side-loaded parts", async () => {
    const THREE = await import("three");
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(20, 10, 40));
    mesh.rotation.z = Math.PI / 2;
    mesh.updateMatrixWorld(true);

    const rotation = await computeDefaultRotationDegrees(mesh);

    expect(Math.max(...rotation.map((value) => Math.abs(value)))).toBeGreaterThanOrEqual(89);
  });
});
