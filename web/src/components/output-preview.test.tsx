import { fireEvent, render } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { OutputPreview } from "./output-preview";

const SVG_TEXT = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
  <g data-mesh-id="mesh-1">
    <path class="preview-hit-area" d="M 0 0 L 10 0" fill="none" stroke="rgba(15,23,42,0.001)" stroke-width="12" pointer-events="stroke" />
    <path d="M 0 0 L 10 0" fill="none" stroke="#000" stroke-width="0.2" pointer-events="none" />
  </g>
</svg>`;

const FLIPPED_SVG_TEXT = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-3.5 -3.5 7 7">
  <g transform="matrix(1 0 0 -1 0 0)">
    <g data-mesh-id="mesh-1">
      <path class="preview-hit-area" d="M -3.5 -2.5 L -3.5 -3.5 L -2.5 -3.5 L -2.5 -2.5 Z" fill="none" stroke="rgba(15,23,42,0.001)" stroke-width="12" pointer-events="stroke" />
      <path d="M -3.5 -2.5 L -3.5 -3.5 L -2.5 -3.5 L -2.5 -2.5 Z" fill="none" stroke="#000" stroke-width="0.2" pointer-events="none" />
    </g>
  </g>
</svg>`;

describe("OutputPreview", () => {
  it("emits mesh hover changes from inline svg paths", () => {
    const onHoverMeshChange = vi.fn();
    const onSelectMesh = vi.fn();
    const { container } = render(
      <OutputPreview
        focusRequest={null}
        geometryKey="preview-1"
        hoveredMeshId={null}
        isBusy={false}
        onHoverMeshChange={onHoverMeshChange}
        onSelectMesh={onSelectMesh}
        selectedMeshId={null}
        statusMessage="Ready"
        svgText={SVG_TEXT}
      />,
    );

    const path = container.querySelector(".preview-hit-area");
    const preview = container.querySelector(".preview-svg");

    expect(path).toBeTruthy();
    expect(preview).toBeTruthy();

    fireEvent.pointerMove(path!, { pointerId: 1 });
    expect(onHoverMeshChange).toHaveBeenLastCalledWith("mesh-1");

    fireEvent.pointerMove(preview!, { pointerId: 1 });
    expect(onHoverMeshChange).toHaveBeenLastCalledWith(null);
  });

  it("zooms and pans the 2D preview with viewBox updates", () => {
    const onHoverMeshChange = vi.fn();
    const onSelectMesh = vi.fn();
    const { container } = render(
      <OutputPreview
        focusRequest={null}
        geometryKey="preview-1"
        hoveredMeshId={null}
        isBusy={false}
        onHoverMeshChange={onHoverMeshChange}
        onSelectMesh={onSelectMesh}
        selectedMeshId={null}
        statusMessage="Ready"
        svgText={SVG_TEXT}
      />,
    );

    const preview = container.querySelector(".preview-svg") as HTMLDivElement | null;
    const svg = container.querySelector("svg") as SVGSVGElement | null;

    expect(preview).toBeTruthy();
    expect(svg).toBeTruthy();

    svg!.getBoundingClientRect = () =>
      ({
        bottom: 220,
        height: 200,
        left: 20,
        right: 220,
        top: 20,
        width: 200,
        x: 20,
        y: 20,
        toJSON: () => ({}),
      }) as DOMRect;
    preview!.setPointerCapture = vi.fn();
    preview!.releasePointerCapture = vi.fn();

    expect(readViewBox(svg!)).toEqual({ height: 10, width: 10, x: 0, y: 0 });
    expect(container.querySelector(".preview-reset-button")).toBeNull();

    fireEvent.wheel(preview!, { clientX: 120, clientY: 120, deltaY: -120 });
    const zoomedViewBox = readViewBox(svg!);
    expect(zoomedViewBox.width).toBeLessThan(10);
    expect(zoomedViewBox.height).toBeLessThan(10);
    expect(container.querySelector(".preview-reset-button")).toBeTruthy();

    fireEvent.pointerDown(preview!, { button: 0, clientX: 120, clientY: 120, pointerId: 7 });
    fireEvent.pointerMove(preview!, { clientX: 150, clientY: 165, pointerId: 7 });
    const pannedViewBox = readViewBox(svg!);
    expect(pannedViewBox.x).toBeLessThan(zoomedViewBox.x);
    expect(pannedViewBox.y).toBeLessThan(zoomedViewBox.y);

    fireEvent.pointerUp(preview!, { clientX: 150, clientY: 165, pointerId: 7 });
    expect(onSelectMesh).not.toHaveBeenCalled();
  });

  it("selects a mesh when a stroke is clicked without dragging", () => {
    const onHoverMeshChange = vi.fn();
    const onSelectMesh = vi.fn();
    const { container } = render(
      <OutputPreview
        focusRequest={null}
        geometryKey="preview-1"
        hoveredMeshId={null}
        isBusy={false}
        onHoverMeshChange={onHoverMeshChange}
        onSelectMesh={onSelectMesh}
        selectedMeshId={null}
        statusMessage="Ready"
        svgText={SVG_TEXT}
      />,
    );

    const preview = container.querySelector(".preview-svg") as HTMLDivElement | null;
    const path = container.querySelector(".preview-hit-area");

    expect(preview).toBeTruthy();
    expect(path).toBeTruthy();

    preview!.setPointerCapture = vi.fn();
    preview!.releasePointerCapture = vi.fn();
    const originalElementFromPoint = document.elementFromPoint;
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => path as Element),
    });

    fireEvent.pointerDown(path!, { button: 0, clientX: 100, clientY: 100, pointerId: 8 });
    fireEvent.pointerUp(preview!, { clientX: 100, clientY: 100, pointerId: 8 });

    expect(onSelectMesh).toHaveBeenLastCalledWith(
      "mesh-1",
      expect.objectContaining({
        clickedMeshId: "mesh-1",
        clientX: 100,
        clientY: 100,
      }),
    );
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: originalElementFromPoint,
    });
  });

  it("clears the selection when the preview background is clicked", () => {
    const onHoverMeshChange = vi.fn();
    const onSelectMesh = vi.fn();
    const { container } = render(
      <OutputPreview
        focusRequest={null}
        geometryKey="preview-1"
        hoveredMeshId={null}
        isBusy={false}
        onHoverMeshChange={onHoverMeshChange}
        onSelectMesh={onSelectMesh}
        selectedMeshId={null}
        statusMessage="Ready"
        svgText={SVG_TEXT}
      />,
    );

    const preview = container.querySelector(".preview-svg") as HTMLDivElement | null;

    expect(preview).toBeTruthy();

    preview!.setPointerCapture = vi.fn();
    preview!.releasePointerCapture = vi.fn();

    fireEvent.pointerDown(preview!, { button: 0, clientX: 80, clientY: 80, pointerId: 9 });
    fireEvent.pointerUp(preview!, { clientX: 80, clientY: 80, pointerId: 9 });

    expect(onSelectMesh).toHaveBeenLastCalledWith(
      null,
      expect.objectContaining({
        clickedMeshId: null,
        clientX: 80,
        clientY: 80,
      }),
    );
  });

  it("does not emit hover changes while a selection is active", () => {
    const onHoverMeshChange = vi.fn();
    const onSelectMesh = vi.fn();
    const { container } = render(
      <OutputPreview
        focusRequest={null}
        geometryKey="preview-1"
        hoveredMeshId={null}
        isBusy={false}
        onHoverMeshChange={onHoverMeshChange}
        onSelectMesh={onSelectMesh}
        selectedMeshId="mesh-1"
        statusMessage="Ready"
        svgText={SVG_TEXT}
      />,
    );

    const path = container.querySelector(".preview-hit-area");

    expect(path).toBeTruthy();

    fireEvent.pointerMove(path!, { pointerId: 10 });
    expect(onHoverMeshChange).not.toHaveBeenCalled();
  });

  it("recenters using the selected mesh's live svg bounds", () => {
    const onHoverMeshChange = vi.fn();
    const onSelectMesh = vi.fn();
    const requestAnimationFrameSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback: FrameRequestCallback) => {
        callback(performance.now() + 1000);
        return 1;
      });
    const cancelAnimationFrameSpy = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    const focusRequest = {
      nonce: 1,
      rings: [
        {
          exterior: [
            [1, 1],
            [7, 1],
            [7, 7],
            [1, 7],
          ] as [number, number][],
          holes: [],
        },
      ],
    };

    try {
      const { container, rerender } = render(
        <OutputPreview
          focusRequest={null}
          geometryKey="preview-1"
          hoveredMeshId={null}
          isBusy={false}
          onHoverMeshChange={onHoverMeshChange}
          onSelectMesh={onSelectMesh}
          selectedMeshId="mesh-1"
          statusMessage="Ready"
          svgText={SVG_TEXT}
        />,
      );

      const svg = container.querySelector("svg") as SVGSVGElement | null;
      const group = container.querySelector("[data-mesh-id=\"mesh-1\"]") as SVGGraphicsElement | null;

      expect(svg).toBeTruthy();
      expect(group).toBeTruthy();

      svg!.getBoundingClientRect = () =>
        ({
          bottom: 220,
          height: 200,
          left: 20,
          right: 220,
          top: 20,
          width: 200,
          x: 20,
          y: 20,
          toJSON: () => ({}),
        }) as DOMRect;
      Object.defineProperty(group!, "getBBox", {
        configurable: true,
        value: () => new DOMRect(1, 1, 6, 6),
      });

      rerender(
        <OutputPreview
          focusRequest={focusRequest}
          geometryKey="preview-1"
          hoveredMeshId={null}
          isBusy={false}
          onHoverMeshChange={onHoverMeshChange}
          onSelectMesh={onSelectMesh}
          selectedMeshId="mesh-1"
          statusMessage="Ready"
          svgText={SVG_TEXT}
        />,
      );

      expect(readViewBox(svg!)).toEqual({
        height: 10,
        width: 10,
        x: -1,
        y: -1,
      });
    } finally {
      requestAnimationFrameSpy.mockRestore();
      cancelAnimationFrameSpy.mockRestore();
    }
  });

  it("recenters using the live wrapper transform without mirroring the target quadrant", () => {
    const onHoverMeshChange = vi.fn();
    const onSelectMesh = vi.fn();
    const requestAnimationFrameSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback: FrameRequestCallback) => {
        callback(performance.now() + 1000);
        return 1;
      });
    const cancelAnimationFrameSpy = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    const focusRequest = {
      nonce: 1,
      rings: [
        {
          exterior: [
            [-3.5, -2.5],
            [-3.5, -3.5],
            [-2.5, -3.5],
            [-2.5, -2.5],
          ] as [number, number][],
          holes: [],
        },
      ],
    };

    try {
      const { container, rerender } = render(
        <OutputPreview
          focusRequest={null}
          geometryKey="preview-flipped"
          hoveredMeshId={null}
          isBusy={false}
          onHoverMeshChange={onHoverMeshChange}
          onSelectMesh={onSelectMesh}
          selectedMeshId="mesh-1"
          statusMessage="Ready"
          svgText={FLIPPED_SVG_TEXT}
        />,
      );

      const svg = container.querySelector("svg") as SVGSVGElement | null;
      const wrapper = container.querySelector("svg > g") as SVGGraphicsElement | null;
      const group = container.querySelector("[data-mesh-id=\"mesh-1\"]") as SVGGraphicsElement | null;

      expect(svg).toBeTruthy();
      expect(wrapper).toBeTruthy();
      expect(group).toBeTruthy();

      svg!.getBoundingClientRect = () =>
        ({
          bottom: 220,
          height: 200,
          left: 20,
          right: 220,
          top: 20,
          width: 200,
          x: 20,
          y: 20,
          toJSON: () => ({}),
        }) as DOMRect;
      Object.defineProperty(group!, "getBBox", {
        configurable: true,
        value: () => new DOMRect(-3.5, -3.5, 1, 1),
      });
      Object.defineProperty(wrapper!, "transform", {
        configurable: true,
        value: {
          baseVal: {
            consolidate: () => ({
              matrix: {
                a: 1,
                b: 0,
                c: 0,
                d: -1,
                e: 0,
                f: 0,
              },
            }),
          },
        },
      });

      rerender(
        <OutputPreview
          focusRequest={focusRequest}
          geometryKey="preview-flipped"
          hoveredMeshId={null}
          isBusy={false}
          onHoverMeshChange={onHoverMeshChange}
          onSelectMesh={onSelectMesh}
          selectedMeshId="mesh-1"
          statusMessage="Ready"
          svgText={FLIPPED_SVG_TEXT}
        />,
      );

      const viewBox = readViewBox(svg!);
      expect(viewBox.width).toBeCloseTo(1.36, 6);
      expect(viewBox.height).toBeCloseTo(1.36, 6);
      expect(viewBox.x).toBeCloseTo(-3.68, 6);
      expect(viewBox.y).toBeCloseTo(2.32, 6);
    } finally {
      requestAnimationFrameSpy.mockRestore();
      cancelAnimationFrameSpy.mockRestore();
    }
  });

  it("preserves the current viewBox across geometry changes when the reset key is stable", () => {
    const onHoverMeshChange = vi.fn();
    const onSelectMesh = vi.fn();
    const { container, rerender } = render(
      <OutputPreview
        focusRequest={null}
        geometryKey="preview-1"
        hoveredMeshId={null}
        isBusy={false}
        onHoverMeshChange={onHoverMeshChange}
        onSelectMesh={onSelectMesh}
        selectedMeshId="mesh-1"
        statusMessage="Ready"
        svgText={SVG_TEXT}
        viewportResetKey="mesh-a"
      />,
    );

    const preview = container.querySelector(".preview-svg") as HTMLDivElement | null;
    const svg = container.querySelector("svg") as SVGSVGElement | null;

    expect(preview).toBeTruthy();
    expect(svg).toBeTruthy();

    svg!.getBoundingClientRect = () =>
      ({
        bottom: 220,
        height: 100,
        left: 20,
        right: 220,
        top: 20,
        width: 200,
        x: 20,
        y: 20,
        toJSON: () => ({}),
      }) as DOMRect;

    fireEvent.wheel(preview!, { clientX: 120, clientY: 70, deltaY: -120 });
    const preservedViewBox = readViewBox(svg!);

    rerender(
      <OutputPreview
        focusRequest={null}
        geometryKey="preview-2"
        hoveredMeshId={null}
        isBusy={false}
        onHoverMeshChange={onHoverMeshChange}
        onSelectMesh={onSelectMesh}
        selectedMeshId="mesh-1"
        statusMessage="Ready"
        svgText={FLIPPED_SVG_TEXT}
        viewportResetKey="mesh-a"
      />,
    );

    expect(readViewBox(svg!)).toEqual(preservedViewBox);
  });

  it("zooms out from the current focused viewBox without snapping back to the document aspect", () => {
    const onHoverMeshChange = vi.fn();
    const onSelectMesh = vi.fn();
    const requestAnimationFrameSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback: FrameRequestCallback) => {
        callback(performance.now() + 1000);
        return 1;
      });
    const cancelAnimationFrameSpy = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    const focusRequest = {
      nonce: 1,
      rings: [
        {
          exterior: [
            [4, 4],
            [5, 4],
            [5, 5],
            [4, 5],
          ] as [number, number][],
          holes: [],
        },
      ],
    };

    try {
      const { container, rerender } = render(
        <OutputPreview
          focusRequest={null}
          geometryKey="preview-wide"
          hoveredMeshId={null}
          isBusy={false}
          onHoverMeshChange={onHoverMeshChange}
          onSelectMesh={onSelectMesh}
          selectedMeshId="mesh-1"
          statusMessage="Ready"
          svgText={SVG_TEXT}
          viewportResetKey="mesh-a"
        />,
      );

      const preview = container.querySelector(".preview-svg") as HTMLDivElement | null;
      const svg = container.querySelector("svg") as SVGSVGElement | null;
      const group = container.querySelector("[data-mesh-id=\"mesh-1\"]") as SVGGraphicsElement | null;

      expect(preview).toBeTruthy();
      expect(svg).toBeTruthy();
      expect(group).toBeTruthy();

      svg!.getBoundingClientRect = () =>
        ({
          bottom: 120,
          height: 100,
          left: 20,
          right: 220,
          top: 20,
          width: 200,
          x: 20,
          y: 20,
          toJSON: () => ({}),
        }) as DOMRect;
      Object.defineProperty(group!, "getBBox", {
        configurable: true,
        value: () => new DOMRect(4, 4, 1, 1),
      });

      rerender(
        <OutputPreview
          focusRequest={focusRequest}
          geometryKey="preview-wide"
          hoveredMeshId={null}
          isBusy={false}
          onHoverMeshChange={onHoverMeshChange}
          onSelectMesh={onSelectMesh}
          selectedMeshId="mesh-1"
          statusMessage="Ready"
          svgText={SVG_TEXT}
          viewportResetKey="mesh-a"
        />,
      );

      const focusedViewBox = readViewBox(svg!);
      fireEvent.wheel(preview!, { clientX: 120, clientY: 70, deltaY: 120 });
      const zoomedViewBox = readViewBox(svg!);

      expect(focusedViewBox.width / focusedViewBox.height).toBeCloseTo(2, 6);
      expect(zoomedViewBox.width / zoomedViewBox.height).toBeCloseTo(2, 6);
      expect(zoomedViewBox.width).toBeGreaterThan(focusedViewBox.width);
      expect(zoomedViewBox.x).toBeLessThan(focusedViewBox.x);
      expect(zoomedViewBox.y).toBeLessThan(focusedViewBox.y);
    } finally {
      requestAnimationFrameSpy.mockRestore();
      cancelAnimationFrameSpy.mockRestore();
    }
  });
});

function readViewBox(svg: SVGSVGElement): {
  height: number;
  width: number;
  x: number;
  y: number;
} {
  const rawViewBox = svg.getAttribute("viewBox");
  expect(rawViewBox).toBeTruthy();

  const [x, y, width, height] = rawViewBox!.split(/\s+/u).map(Number);
  return { height, width, x, y };
}
