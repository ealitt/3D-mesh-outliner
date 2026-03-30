from __future__ import annotations

from shapely import make_valid, set_precision
from shapely.errors import GEOSException
from shapely.geometry import GeometryCollection, MultiPolygon, Polygon
from shapely.ops import unary_union

from .types import KeepMode

_PRECISION_FACTORS = (0.0, 1e-9, 1e-8, 1e-7, 1e-6)


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


def stabilize_polygonal_geometry(geometry: object, precision_factor: float = 0.0) -> object:
    if geometry is None:
        return None

    candidate = _sanitize_polygonal_geometry(geometry)
    if candidate is None:
        return None
    if precision_factor > 0.0:
        candidate = set_precision(
            candidate,
            grid_size=_precision_grid_size(candidate, precision_factor),
        )
    if hasattr(candidate, "is_valid") and not candidate.is_valid:
        candidate = make_valid(candidate)
    return candidate


def repair_polygonal_geometry(geometry: object) -> list[Polygon]:
    if geometry is None:
        return []

    for precision_factor in _PRECISION_FACTORS:
        try:
            candidate = stabilize_polygonal_geometry(geometry, precision_factor)
            return flatten_polygons([candidate])
        except GEOSException:
            continue
    return []


def merge_polygonal_geometries(geometries: list[object]) -> object:
    usable = [geometry for geometry in geometries if geometry is not None]
    if not usable:
        return GeometryCollection()

    for precision_factor in _PRECISION_FACTORS:
        try:
            stabilized = [
                stabilize_polygonal_geometry(geometry, precision_factor)
                for geometry in usable
            ]
            return unary_union(stabilized)
        except GEOSException:
            continue

    # Fall back to an empty collection rather than surfacing a GEOS crash into the UI.
    return GeometryCollection()


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

    if keep_mode == "largest":
        selected = sort_polygons(repaired)[:1]
    elif keep_mode == "outer_only":
        selected = _select_outer_shells(repaired)
    else:
        selected = sort_polygons(repaired)

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
            selected = _select_outer_shells(selected)

    return sort_polygons(selected)


def _select_outer_shells(polygons: list[Polygon]) -> list[Polygon]:
    selected: list[Polygon] = []
    for polygon in sort_polygons(polygons):
        shell = _drop_holes(polygon)
        if any(shell.equals(existing) or shell.within(existing) for existing in selected):
            continue
        selected.append(shell)
    return sort_polygons(selected)


def _precision_grid_size(geometry: object, precision_factor: float) -> float:
    bounds = getattr(geometry, "bounds", None)
    if bounds is None or len(bounds) != 4:
        return precision_factor

    minx, miny, maxx, maxy = (float(value) for value in bounds)
    span = max(maxx - minx, maxy - miny, 1.0)
    return span * precision_factor


def _sanitize_polygonal_geometry(geometry: object) -> object:
    if geometry is None:
        return None
    if isinstance(geometry, Polygon):
        return _sanitize_polygon(geometry)
    if isinstance(geometry, MultiPolygon):
        polygons = [
            polygon
            for item in geometry.geoms
            for polygon in _flatten_polygonal_geometry(_sanitize_polygon(item))
        ]
        return MultiPolygon(polygons) if polygons else None
    if isinstance(geometry, GeometryCollection):
        polygons = [
            polygon
            for item in geometry.geoms
            for polygon in _flatten_polygonal_geometry(_sanitize_polygonal_geometry(item))
        ]
        return GeometryCollection(polygons) if polygons else None
    return geometry


def _sanitize_polygon(polygon: Polygon) -> Polygon | None:
    shell = _sanitize_ring_coords(polygon.exterior.coords)
    if shell is None:
        return None

    holes = [
        ring
        for interior in polygon.interiors
        if (ring := _sanitize_ring_coords(interior.coords)) is not None
    ]
    return Polygon(shell=shell, holes=holes)


def _sanitize_ring_coords(coords: object) -> list[tuple[float, float]] | None:
    cleaned: list[tuple[float, float]] = []
    for x, y, *_ in coords:
        point = (float(x), float(y))
        if not cleaned or point != cleaned[-1]:
            cleaned.append(point)

    if len(cleaned) >= 2 and cleaned[0] == cleaned[-1]:
        cleaned.pop()
    if len(cleaned) < 3:
        return None

    deduped: list[tuple[float, float]] = []
    for point in cleaned:
        if point not in deduped:
            deduped.append(point)
    if len(deduped) < 3:
        return None

    return [*cleaned, cleaned[0]]
