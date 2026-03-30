import type { ExportSelection, PreviewOutlineLayer, RingSet2D } from "./types";
import { isMetricUnit, normalizeUnitName } from "./units";

const DXF_UNITS: Record<string, number> = {
  cm: 5,
  foot: 2,
  in: 1,
  m: 6,
  mm: 4,
};

type SvgLayer = {
  className?: string;
  color: string;
  dashArray?: string;
  id: string;
  meshId?: string;
  opacity?: number;
  pointerEvents?: "none";
  rings: RingSet2D[];
  strokeLineCap?: "round";
  strokeLineJoin?: "round";
  strokeWidth?: number;
  vectorEffect?: "non-scaling-stroke";
};

const PREVIEW_HIT_STROKE_WIDTH = 12;
const PREVIEW_BASE_DARKEN_AMOUNT = 0.18;
const PREVIEW_DIMMED_DARKEN_AMOUNT = 0.28;
const PREVIEW_SELECTED_HALO_COLOR = "#2563eb";
const PREVIEW_HOVER_OUTLINE_COLOR = "#0f172a";

export function buildPreviewSvg(options: {
  hoveredProjectionColor?: string | null;
  hoveredProjectionRings?: RingSet2D[] | null;
  offsetRings: RingSet2D[];
  projectionLayers?: PreviewOutlineLayer[];
  projectionRings: RingSet2D[];
  selectedProjectionColor?: string | null;
  selectedProjectionRings?: RingSet2D[] | null;
  strokeWidth: number;
  units: string | null;
}): string | null {
  const {
    hoveredProjectionColor,
    hoveredProjectionRings,
    offsetRings,
    projectionLayers,
    projectionRings,
    selectedProjectionRings,
    strokeWidth,
    units,
  } = options;
  const hasOffset = offsetRings.length > 0;
  const layers: SvgLayer[] = [];

  if (projectionLayers?.length) {
    for (const projectionLayer of projectionLayers) {
      layers.push({
        color: darkenHexColor(
          projectionLayer.color,
          projectionLayer.dimmed ? PREVIEW_DIMMED_DARKEN_AMOUNT : PREVIEW_BASE_DARKEN_AMOUNT,
        ),
        dashArray: hasOffset ? `${fmt(strokeWidth * 9)} ${fmt(strokeWidth * 6)}` : undefined,
        id: projectionLayer.id,
        meshId: projectionLayer.meshId,
        opacity: projectionLayer.dimmed ? 0.9 : 1,
        rings: projectionLayer.rings,
      });
    }
  } else if (projectionRings.length) {
    layers.push({
      color: darkenHexColor("#dc2626", PREVIEW_BASE_DARKEN_AMOUNT),
      dashArray: hasOffset ? `${fmt(strokeWidth * 9)} ${fmt(strokeWidth * 6)}` : undefined,
      id: "projection",
      rings: projectionRings,
    });
  }

  if (hasOffset) {
    layers.push({
      color: "#16a34a",
      id: "offset",
      pointerEvents: "none",
      rings: offsetRings,
    });
  }

  if (hoveredProjectionRings?.length) {
    layers.push({
      className: "preview-hover-outline",
      color: lightenHexColor(hoveredProjectionColor ?? PREVIEW_HOVER_OUTLINE_COLOR, 0.18),
      id: "hovered-projection",
      opacity: 0.76,
      pointerEvents: "none",
      rings: hoveredProjectionRings,
      strokeLineCap: "round",
      strokeLineJoin: "round",
      strokeWidth: Math.max(strokeWidth + 0.03, 0.22),
      vectorEffect: "non-scaling-stroke",
    });
  }

  if (selectedProjectionRings?.length) {
    layers.push({
      className: "preview-selected-halo",
      color: PREVIEW_SELECTED_HALO_COLOR,
      id: "selected-projection-halo",
      opacity: 0.76,
      pointerEvents: "none",
      rings: selectedProjectionRings,
      strokeLineCap: "round",
      strokeLineJoin: "round",
      strokeWidth: Math.max(strokeWidth + 0.08, 0.32),
      vectorEffect: "non-scaling-stroke",
    });
  }

  return buildSvgFromLayers(layers, strokeWidth, units);
}

export function buildExportSvg(options: {
  offsetRings: RingSet2D[];
  projectionRings: RingSet2D[];
  selection: ExportSelection;
  strokeWidth: number;
  units: string | null;
}): string | null {
  return buildSvgFromLayers(
    exportLayers(options.selection, options.projectionRings, options.offsetRings),
    options.strokeWidth,
    options.units,
  );
}

export function buildExportDxf(options: {
  offsetRings: RingSet2D[];
  projectionRings: RingSet2D[];
  selection: ExportSelection;
  units: string | null;
}): string {
  return buildDxfFromLayers(
    exportLayers(options.selection, options.projectionRings, options.offsetRings),
    options.units,
  );
}

export function buildSvgFromRings(
  rings: RingSet2D[],
  strokeWidth: number,
  units: string | null,
): string | null {
  return buildSvgFromLayers(
    rings.length
      ? [
        {
          color: "black",
          id: "outline",
          rings,
        },
      ]
      : [],
    strokeWidth,
    units,
  );
}

export function buildDxfFromRings(rings: RingSet2D[], units: string | null): string {
  return buildDxfFromLayers(
    rings.length
      ? [
        {
          color: "black",
          id: "outline",
          rings,
        },
      ]
      : [],
    units,
  );
}

function buildSvgFromLayers(
  layers: SvgLayer[],
  strokeWidth: number,
  units: string | null,
): string | null {
  const activeLayers = layers.filter((layer) => layer.rings.length);
  if (!activeLayers.length) {
    return null;
  }

  const [minX, minY, maxX, maxY] = ringsBounds(activeLayers.flatMap((layer) => layer.rings));
  const width = maxX - minX;
  const height = maxY - minY;
  const unitsAttr = units ? ` data-units="${units}"` : "";

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${fmt(minX)} ${fmt(minY)} ${fmt(width)} ${fmt(height)}"${unitsAttr}>`,
    "  <desc>mesh2cad browser export</desc>",
    `  <g transform="matrix(1 0 0 -1 0 ${fmt(minY + maxY)})">`,
    ...activeLayers.map((layer) => {
      const classAttr = layer.className ? ` class="${layer.className}"` : "";
      const dashAttr = layer.dashArray ? ` stroke-dasharray="${layer.dashArray}"` : "";
      const opacityAttr = layer.opacity !== undefined ? ` stroke-opacity="${fmt(layer.opacity)}"` : "";
      const pointerEventsAttr = layer.pointerEvents ? ` pointer-events="${layer.pointerEvents}"` : "";
      const strokeWidthAttr = ` stroke-width="${fmt(layer.strokeWidth ?? strokeWidth)}"`;
      const strokeLineCapAttr = layer.strokeLineCap ? ` stroke-linecap="${layer.strokeLineCap}"` : "";
      const strokeLineJoinAttr = layer.strokeLineJoin ? ` stroke-linejoin="${layer.strokeLineJoin}"` : "";
      const vectorEffectAttr = layer.vectorEffect ? ` vector-effect="${layer.vectorEffect}"` : "";
      const pathData = layer.rings
        .map((ring) => [ringToPath(ring.exterior), ...ring.holes.map((hole) => ringToPath(hole))]
          .filter(Boolean)
          .join(" "))
        .join(" ");

      if (layer.meshId && !layer.pointerEvents) {
        const hitStrokeWidth = Math.max(PREVIEW_HIT_STROKE_WIDTH, strokeWidth * 18);
        return [
          `    <g data-mesh-id="${layer.meshId}">`,
          `      <path class="preview-hit-area" d="${pathData}" fill="none" stroke="rgba(15,23,42,0.001)" stroke-linecap="round" stroke-linejoin="round" stroke-width="${fmt(hitStrokeWidth)}" vector-effect="non-scaling-stroke" pointer-events="stroke" />`,
          `      <path${classAttr} d="${pathData}" fill="none" stroke="${layer.color}"${strokeWidthAttr}${strokeLineCapAttr}${strokeLineJoinAttr}${dashAttr}${opacityAttr} pointer-events="none" />`,
          "    </g>",
        ].join("\n");
      }

      return `    <path${classAttr} d="${pathData}" fill="none" stroke="${layer.color}"${strokeWidthAttr}${strokeLineCapAttr}${strokeLineJoinAttr}${dashAttr}${opacityAttr}${pointerEventsAttr}${vectorEffectAttr} />`;
    }),
    "  </g>",
    "</svg>",
    "",
  ].join("\n");
}

function lightenHexColor(color: string, amount: number): string {
  const normalized = parseHexColor(color);
  if (!normalized) {
    return color;
  }

  return toHexColor({
    b: normalized.b + ((255 - normalized.b) * amount),
    g: normalized.g + ((255 - normalized.g) * amount),
    r: normalized.r + ((255 - normalized.r) * amount),
  });
}

function darkenHexColor(color: string, amount: number): string {
  const normalized = parseHexColor(color);
  if (!normalized) {
    return color;
  }

  return toHexColor({
    b: normalized.b * (1 - amount),
    g: normalized.g * (1 - amount),
    r: normalized.r * (1 - amount),
  });
}

function buildDxfFromLayers(layers: SvgLayer[], units: string | null): string {
  const activeLayers = layers.filter((entry) => entry.rings.length);
  const normalizedUnits = normalizeUnitName(units);
  const insUnits = normalizedUnits ? DXF_UNITS[normalizedUnits] ?? 0 : 4;
  const measurement = normalizedUnits ? (isMetricUnit(normalizedUnits) ? 1 : 0) : 1;
  const layerNames = collectDxfLayerNames(activeLayers);
  const [minX, minY, maxX, maxY] = ringsBounds(activeLayers.flatMap((layer) => layer.rings));
  const sections = [
    "0",
    "SECTION",
    "2",
    "HEADER",
    "9",
    "$ACADVER",
    "1",
    "AC1009",
    "9",
    "$INSUNITS",
    "70",
    String(insUnits),
    "9",
    "$MEASUREMENT",
    "70",
    String(measurement),
    "9",
    "$EXTMIN",
    "10",
    fmt(minX),
    "20",
    fmt(minY),
    "30",
    "0",
    "9",
    "$EXTMAX",
    "10",
    fmt(maxX),
    "20",
    fmt(maxY),
    "30",
    "0",
    ...(normalizedUnits
      ? [
        "999",
        `mesh2cad units=${normalizedUnits}`,
      ]
      : []),
    "0",
    "ENDSEC",
    "0",
    "SECTION",
    "2",
    "TABLES",
    "0",
    "TABLE",
    "2",
    "LTYPE",
    "70",
    "1",
    "0",
    "LTYPE",
    "2",
    "CONTINUOUS",
    "70",
    "64",
    "3",
    "Solid line",
    "72",
    "65",
    "73",
    "0",
    "40",
    "0",
    "0",
    "ENDTAB",
    "0",
    "TABLE",
    "2",
    "LAYER",
    "70",
    String(layerNames.length),
    ...buildDxfLayerTable(layerNames),
    "0",
    "ENDTAB",
    "0",
    "ENDSEC",
    "0",
    "SECTION",
    "2",
    "ENTITIES",
  ];

  for (const layer of activeLayers) {
    const layerName = layer.id.toUpperCase();
    appendRingsAsLines(sections, layer.rings, layerName);
  }

  sections.push("0", "ENDSEC", "0", "EOF");
  return sections.join("\n");
}

function collectDxfLayerNames(layers: SvgLayer[]): string[] {
  const names = new Set<string>(["0"]);
  for (const layer of layers) {
    const layerName = layer.id.toUpperCase();
    names.add(layerName);
    if (layer.rings.some((ring) => ring.holes.length)) {
      names.add(`${layerName}_HOLES`);
    }
  }
  return [...names];
}

function buildDxfLayerTable(layerNames: string[]): string[] {
  return layerNames.flatMap((layerName, index) => [
    "0",
    "LAYER",
    "2",
    layerName,
    "70",
    "0",
    "62",
    String(layerColorNumber(layerName, index)),
    "6",
    "CONTINUOUS",
  ]);
}

function layerColorNumber(layerName: string, index: number): number {
  if (layerName === "PROJECTION" || layerName === "OUTLINE") {
    return 1;
  }
  if (layerName.startsWith("OFFSET")) {
    return 3;
  }
  if (layerName.endsWith("_HOLES")) {
    return 8;
  }
  return ((index % 6) + 1);
}

function appendRingsAsLines(sections: string[], rings: RingSet2D[], layerName: string) {
  for (const ring of rings) {
    appendLineLoop(sections, ring.exterior, layerName);
    for (const hole of ring.holes) {
      appendLineLoop(sections, hole, `${layerName}_HOLES`);
    }
  }
}

function appendLineLoop(sections: string[], points: [number, number][], layerName: string) {
  if (points.length < 3) {
    return;
  }

  for (let index = 0; index < points.length; index += 1) {
    const [x0, y0] = points[index];
    const [x1, y1] = points[(index + 1) % points.length];
    if (Math.abs(x0 - x1) <= 1e-9 && Math.abs(y0 - y1) <= 1e-9) {
      continue;
    }
    sections.push(
      "0",
      "LINE",
      "8",
      layerName,
      "10",
      fmt(x0),
      "20",
      fmt(y0),
      "30",
      "0",
      "11",
      fmt(x1),
      "21",
      fmt(y1),
      "31",
      "0",
    );
  }
}

function exportLayers(
  selection: ExportSelection,
  projectionRings: RingSet2D[],
  offsetRings: RingSet2D[],
): SvgLayer[] {
  const layers: SvgLayer[] = [];

  if (selection === "projection" || selection === "both") {
    layers.push({
      color: "#dc2626",
      id: "projection",
      rings: projectionRings,
    });
  }

  if (selection === "offset" || selection === "both") {
    layers.push({
      color: "#16a34a",
      id: "offset",
      rings: offsetRings,
    });
  }

  return layers;
}

function ringToPath(points: [number, number][]): string {
  if (points.length < 3) {
    return "";
  }
  const [first, ...rest] = points;
  return `M ${fmt(first[0])} ${fmt(first[1])} ${rest.map(([x, y]) => `L ${fmt(x)} ${fmt(y)}`).join(" ")} Z`;
}

function ringsBounds(rings: RingSet2D[]): [number, number, number, number] {
  if (!rings.length) {
    return [0, 0, 1, 1];
  }

  const points = rings.flatMap((ring) => [
    ...ring.exterior,
    ...ring.holes.flatMap((hole) => hole),
  ]);
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  const width = Math.max(maxX - minX, 1);
  const height = Math.max(maxY - minY, 1);
  return [minX, minY, minX + width, minY + height];
}

function parseHexColor(color: string): { b: number; g: number; r: number } | null {
  const normalized = color.trim().toLowerCase();
  if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/u.test(normalized)) {
    return null;
  }

  const expanded = normalized.length === 4
    ? `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`
    : normalized;

  return {
    b: Number.parseInt(expanded.slice(5, 7), 16),
    g: Number.parseInt(expanded.slice(3, 5), 16),
    r: Number.parseInt(expanded.slice(1, 3), 16),
  };
}

function toHexColor(rgb: { b: number; g: number; r: number }): string {
  return `#${[rgb.r, rgb.g, rgb.b]
    .map((channel) =>
      Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, "0"))
    .join("")}`;
}

function fmt(value: number): string {
  const text = value.toFixed(6).replace(/\.?0+$/, "");
  return text === "-0" ? "0" : text;
}
