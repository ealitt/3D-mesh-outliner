import { describe, expect, it } from "vitest";
import { buildExportDxf, buildExportSvg, buildPreviewSvg, buildSvgFromRings } from "./vector-export";

const RINGS = [
  {
    exterior: [
      [0, 0],
      [4, 0],
      [4, 2],
      [0, 2],
    ] as [number, number][],
    holes: [],
  },
];

const OFFSET_RINGS = [
  {
    exterior: [
      [-1, -1],
      [5, -1],
      [5, 3],
      [-1, 3],
    ] as [number, number][],
    holes: [],
  },
];

describe("vector-export", () => {
  it("builds svg from rings", () => {
    const svg = buildSvgFromRings(RINGS, 0.2, "mm");

    expect(svg).toContain("<svg");
    expect(svg).toContain("stroke-width=\"0.2\"");
    expect(svg).toContain("data-units=\"mm\"");
  });

  it("builds preview svg with dashed projection and solid offset", () => {
    const svg = buildPreviewSvg({
      offsetRings: OFFSET_RINGS,
      projectionRings: RINGS,
      strokeWidth: 0.2,
      units: "mm",
    });

    expect(svg).toContain("stroke=\"#b41f1f\"");
    expect(svg).toContain("stroke=\"#16a34a\"");
    expect(svg).toContain("stroke-dasharray=");
  });

  it("builds preview svg from per-layer projection colors with hover and selected overlays", () => {
    const svg = buildPreviewSvg({
      hoveredProjectionColor: "#2563eb",
      hoveredProjectionRings: RINGS,
      offsetRings: [],
      projectionLayers: [
        {
          color: "#2563eb",
          dimmed: true,
          id: "mesh-1",
          meshId: "mesh-1",
          rings: RINGS,
        },
      ],
      projectionRings: [],
      selectedProjectionColor: "#2563eb",
      selectedProjectionRings: RINGS,
      strokeWidth: 0.2,
      units: "mm",
    });

    expect(svg).toContain("stroke=\"#1b47a9\"");
    expect(svg).toContain("stroke-opacity=\"0.9\"");
    expect(svg).toContain("data-mesh-id=\"mesh-1\"");
    expect(svg).toContain("class=\"preview-hit-area\"");
    expect(svg).toContain("pointer-events=\"stroke\"");
    expect(svg).toContain("vector-effect=\"non-scaling-stroke\"");
    expect(svg).toContain("class=\"preview-hover-outline\"");
    expect(svg).toContain("class=\"preview-selected-halo\"");
    expect(svg).toContain("stroke=\"#2563eb\"");
    expect(svg).toContain("stroke=\"#4c7fef\"");
    expect(svg).toContain("pointer-events=\"none\"");
    expect(svg).not.toContain("class=\"preview-selected-outline\"");
  });

  it("builds layered solid svg export", () => {
    const svg = buildExportSvg({
      offsetRings: OFFSET_RINGS,
      projectionRings: RINGS,
      selection: "both",
      strokeWidth: 0.2,
      units: "mm",
    });

    expect(svg).toContain("stroke=\"#dc2626\"");
    expect(svg).toContain("stroke=\"#16a34a\"");
    expect(svg).not.toContain("stroke-dasharray");
  });

  it("builds dxf export from selected layers", () => {
    const dxf = buildExportDxf({
      offsetRings: OFFSET_RINGS,
      projectionRings: RINGS,
      selection: "both",
      units: "mm",
    });

    expect(dxf).toContain("AC1009");
    expect(dxf).toContain("TABLES");
    expect(dxf).toContain("LAYER");
    expect(dxf).toContain("LINE");
    expect(dxf).toContain("PROJECTION");
    expect(dxf).toContain("OFFSET");
    expect(dxf).toContain("$INSUNITS");
    expect(dxf).toContain("$MEASUREMENT");
    expect(dxf).toContain("mesh2cad units=mm");
    expect(dxf).not.toContain("LWPOLYLINE");
    expect(dxf).toContain("EOF");
  });
});
