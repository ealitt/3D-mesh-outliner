export function formatNumber(value: number, digits = 3): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  const fixed = value.toFixed(digits);
  return fixed.replace(/\.?0+$/, "");
}

export function formatBounds(bounds: [number, number, number, number]): string {
  return bounds.map((value) => formatNumber(value, 3)).join(" · ");
}

export function formatExtents(extents: [number, number, number]): string {
  return extents.map((value) => formatNumber(value, 2)).join(" × ");
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${formatNumber(bytes / 1024, 1)} KB`;
  }
  return `${formatNumber(bytes / (1024 * 1024), 1)} MB`;
}
