import { describe, expect, it } from "vitest";
import { Group, Scene } from "three";
import { applyTransformAlignmentMode, boundsFromRings, syncTransformControls, type ViewerRuntime } from "../core/viewer-runtime";

describe("viewer-runtime", () => {
  it("keeps the selected transform object attached while alignment changes", () => {
    const selectedObject = new Group();
    const helper = new Group();
    const transformControls = {
      attach(object: Group) {
        this.object = object;
      },
      detach() {
        this.object = null;
      },
      enabled: false,
      mode: "rotate",
      object: null as Group | null,
      setMode(mode: "rotate" | "translate") {
        this.mode = mode;
      },
      setSpace(space: "local" | "world") {
        this.space = space;
      },
      space: "local" as "local" | "world",
    };

    const runtime = {
      scene: new Scene(),
      transformControls,
      transformHelper: helper,
    } as unknown as ViewerRuntime;

    syncTransformControls(runtime, "mesh", selectedObject, "rotate", "local");
    expect(transformControls.object).toBe(selectedObject);

    applyTransformAlignmentMode(runtime, "world");
    expect(transformControls.object).toBe(selectedObject);
    expect(transformControls.space).toBe("world");
  });

  it("computes bounds from ring sets", () => {
    expect(boundsFromRings([
      {
        exterior: [[1, 2], [3, 2], [3, 5]],
        holes: [],
      },
    ])).toEqual({
      maxX: 3,
      maxY: 5,
      minX: 1,
      minY: 2,
    });
  });
});
