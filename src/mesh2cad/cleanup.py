from __future__ import annotations

from shapely import make_valid
from shapely.geometry import GeometryCollection, MultiPolygon, Polygon
from shapely.ops import unary_union

from .types import KeepMode


def flatten_polygons(geometries: list[object]) -> list[Polygon]:
    polygons: list[Polygon] = []
    for geometry in geometries:
        polygons.extend(_flatten_polygonal_geometry(geometry))
    return sort_polygons(polygons)


def _flatten_polygonal_geometry(geometry: object) -> list[Polygon]:
    if geometry is None:
        return []
    if isinstance(geometry, Polygon):
        return [] if geometry.is_empty else [geometry]
    if isinstance(geometry, MultiPolygon):
        polygons: list[Polygon] = []
        for item in geometry.geoms:
            polygons.extend(_flatten_polygonal_geometry(item))
        return polygons
    if isinstance(geometry, GeometryCollection):
        polygons: list[Polygon] = []
        for item in geometry.geoms:
            polygons.extend(_flatten_polygonal_geometry(item))
        return polygons
    return []


def repair_polygonal_geometry(geometry: object) -> list[Polygon]:
    if geometry is None:
        return []
    candidate = geometry
    if hasattr(candidate, "is_valid") and not candidate.is_valid:
        candidate = make_valid(candidate)
    return flatten_polygons([candidate])


def sort_polygons(polygons: list[Polygon]) -> list[Polygon]:
    def sort_key(polygon: Polygon) -> tuple[float, float, float, float, float]:
        centroid = polygon.centroid
        minx, miny, _, _ = polygon.bounds
        return (
            -float(polygon.area),
            round(float(centroid.x), 12),
            round(float(centroid.y), 12),
            round(float(minx), 12),
            round(float(miny), 12),
        )

    return sorted(
        [polygon for polygon in polygons if not polygon.is_empty and polygon.area > 0.0],
        key=sort_key,
    )


def _drop_holes(polygon: Polygon) -> Polygon:
    return Polygon(polygon.exterior.coords)


def clean_polygons(
    polygons: list[Polygon],
    keep_mode: KeepMode,
    min_area: float,
    simplify_tolerance: float,
) -> list[Polygon]:
    if not polygons:
        return []

    repaired: list[Polygon] = []
    for polygon in polygons:
        repaired.extend(repair_polygonal_geometry(polygon))
    if not repaired:
        return []

    merged = unary_union(repaired)
    candidates = repair_polygonal_geometry(merged)
    if not candidates:
        return []

    if keep_mode == "largest":
        selected = sort_polygons(candidates)[:1]
    elif keep_mode == "outer_only":
        selected = [_drop_holes(polygon) for polygon in candidates]
    else:
        selected = sort_polygons(candidates)

    if min_area > 0.0:
        selected = [polygon for polygon in selected if polygon.area >= min_area]

    if simplify_tolerance > 0.0:
        simplified: list[Polygon] = []
        for polygon in selected:
            simplified.extend(
                repair_polygonal_geometry(
                    polygon.simplify(simplify_tolerance, preserve_topology=True)
                )
            )
        selected = simplified
        if keep_mode == "largest":
            selected = sort_polygons(selected)[:1]
        elif keep_mode == "outer_only":
            selected = [_drop_holes(polygon) for polygon in selected]

    return sort_polygons(selected)
