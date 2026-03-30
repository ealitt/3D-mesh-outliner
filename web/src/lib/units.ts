const UNIT_TO_MM: Record<string, number> = {
  cm: 10,
  foot: 304.8,
  in: 25.4,
  m: 1000,
  mm: 1,
};

export function normalizeUnitName(unit: string | null | undefined): string | null {
  if (!unit) {
    return null;
  }

  const cleaned = unit.trim().toLowerCase();
  if (cleaned in UNIT_TO_MM) {
    return cleaned;
  }
  return null;
}

export function conversionFactor(sourceUnit: string | null | undefined, targetUnit: string | null | undefined): number {
  const source = normalizeUnitName(sourceUnit);
  const target = normalizeUnitName(targetUnit);
  if (!source || !target) {
    return 1;
  }
  return UNIT_TO_MM[source] / UNIT_TO_MM[target];
}

export function hasKnownUnitConversion(sourceUnit: string | null | undefined, targetUnit: string | null | undefined): boolean {
  return Boolean(normalizeUnitName(sourceUnit) && normalizeUnitName(targetUnit));
}

export function isMetricUnit(unit: string | null | undefined): boolean {
  const normalized = normalizeUnitName(unit);
  return normalized === "mm" || normalized === "cm" || normalized === "m";
}
