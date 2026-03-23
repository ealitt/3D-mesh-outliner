from __future__ import annotations

import trimesh

_UNIT_ALIASES = {
    "ft": "foot",
    "yd": "yard",
    "metre": "meter",
    "metres": "meters",
    "millimetre": "millimeter",
    "millimetres": "millimeters",
    "centimetre": "centimeter",
    "centimetres": "centimeters",
    "um": "micron",
    "μm": "micron",
    "µm": "micron",
}

_METRIC_UNITS = {
    "angstrom",
    "angstroms",
    "cm",
    "centimeter",
    "centimeters",
    "decameter",
    "decameters",
    "decimeter",
    "decimeters",
    "gigameter",
    "gigameters",
    "hectometer",
    "hectometers",
    "kilometer",
    "kilometers",
    "m",
    "meter",
    "meters",
    "micron",
    "microns",
    "millimeter",
    "millimeters",
    "mm",
    "nanometer",
    "nanometers",
}


def normalize_unit_name(unit: str | None) -> str | None:
    if unit is None:
        return None

    cleaned = _UNIT_ALIASES.get(unit.strip().lower(), unit.strip().lower())
    if cleaned not in trimesh.units.keys():
        valid = ", ".join(sorted(trimesh.units.keys()))
        raise ValueError(f"Unsupported unit '{unit}'. Expected one of: {valid}")
    return cleaned


def is_metric_unit(unit: str | None) -> bool:
    normalized = normalize_unit_name(unit)
    return normalized in _METRIC_UNITS if normalized else False


def conversion_factor(current: str, desired: str) -> float:
    return float(
        trimesh.units.unit_conversion(
            normalize_unit_name(current),
            normalize_unit_name(desired),
        )
    )


def normalize_mesh_units(
    mesh: trimesh.Trimesh,
    source_units: str | None,
    output_units: str,
) -> tuple[trimesh.Trimesh, str | None, list[str]]:
    warnings: list[str] = []
    normalized_output = normalize_unit_name(output_units)
    normalized_source = normalize_unit_name(source_units)

    normalized_embedded = normalize_unit_name(mesh.units) if mesh.units else None
    converted = mesh.copy()

    if normalized_embedded and normalized_source and normalized_embedded != normalized_source:
        warnings.append(
            "Mesh metadata units take precedence over source_units because the input already "
            f"declares '{normalized_embedded}'."
        )

    if normalized_embedded:
        converted.units = normalized_embedded
        if normalized_embedded != normalized_output:
            converted.convert_units(normalized_output)
        else:
            converted.units = normalized_output
        return converted, normalized_output, warnings

    if normalized_source:
        converted.units = normalized_source
        if normalized_source != normalized_output:
            converted.convert_units(normalized_output)
        else:
            converted.units = normalized_output
        warnings.append(
            f"Mesh units were missing; assumed '{normalized_source}' from source_units."
        )
        return converted, normalized_output, warnings

    warnings.append(
        "Mesh units were missing; geometry was left unchanged and output units remain unknown."
    )
    return converted, None, warnings
