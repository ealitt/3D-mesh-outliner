from __future__ import annotations

from shapely.geometry import Polygon
from shapely.geometry.polygon import orient

from .cleanup import clean_polygons, sort_polygons
from .config import DEFAULT_EMPTY_BOUNDS, NUMERIC_SNAP_EPSILON
from .io_mesh import load_mesh
from .offsetting import apply_offset, apply_scale
from .projection import project_mesh_polygons
from .transforms import apply_mesh_pose
from .types import (
    ExportSpec,
    LoadedMesh,
    MeshInput,
    PipelineResult,
    ProcessSpec,
    ProjectionSpec,
    RingSet,
)
from .units import normalize_mesh_units


def run_pipeline(
    mesh_input: MeshInput,
    projection: ProjectionSpec,
    process: ProcessSpec,
    export: ExportSpec,
    file_type: str | None = None,
) -> PipelineResult:
    loaded = load_mesh(mesh_input, file_type=file_type)
    return run_pipeline_loaded(loaded, projection=projection, process=process, export=export)


def run_pipeline_loaded(
    loaded: LoadedMesh,
    projection: ProjectionSpec,
    process: ProcessSpec,
    export: ExportSpec,
) -> PipelineResult:
    warnings: list[str] = list(loaded.warnings)

    mesh, effective_units, unit_warnings = normalize_mesh_units(
        loaded.mesh,  # type: ignore[arg-type]
        source_units=process.source_units,
        output_units=process.output_units,
    )
    warnings.extend(unit_warnings)
    mesh = apply_mesh_pose(mesh, process.rotation_degrees, process.translation)

    polygons, projection_warnings = project_mesh_polygons(mesh, projection)
    warnings.extend(projection_warnings)
    if not polygons:
        warnings.append("Projection produced no closed 2D regions.")

    cleaned = clean_polygons(
        polygons,
        keep_mode=process.keep_mode,
        min_area=process.min_area,
        simplify_tolerance=process.simplify_tolerance,
    )
    if polygons and not cleaned:
        warnings.append("Cleanup removed all projected regions.")

    processed = cleaned
    if process.offset_stage == "pre_scale":
        processed = apply_offset(processed, process.offset_distance, process.join_style)
        if cleaned and not processed and process.offset_distance != 0.0:
            warnings.append("Offset collapsed the projected region to empty geometry.")
        processed = apply_scale(processed, process.scale)
    else:
        processed = apply_scale(processed, process.scale)
        processed = apply_offset(processed, process.offset_distance, process.join_style)
        if cleaned and not processed and process.offset_distance != 0.0:
            warnings.append("Offset collapsed the projected region to empty geometry.")

    ringsets = shapely_to_rings(processed)
    area = sum(float(polygon.area) for polygon in processed)
    bounds = polygon_bounds(processed)

    svg_text = None
    if export.write_svg:
        from .export_svg import export_svg

        svg_text = export_svg(ringsets, export, units=effective_units)

    dxf_bytes = None
    if export.write_dxf:
        from .export_dxf import export_dxf

        dxf_bytes = export_dxf(ringsets, export, units=effective_units)

    return PipelineResult(
        svg_text=svg_text,
        dxf_bytes=dxf_bytes,
        area=area,
        bounds=bounds,
        warnings=_dedupe_preserve_order(warnings),
        body_count=len(ringsets),
        units=effective_units,
        rings=ringsets,
    )


def shapely_to_rings(polygons: list[Polygon]) -> list[RingSet]:
    ringsets: list[RingSet] = []
    for polygon in sort_polygons(polygons):
        oriented = orient(polygon, sign=1.0)
        exterior = _normalize_ring(oriented.exterior.coords)
        holes = [_normalize_ring(interior.coords) for interior in oriented.interiors]
        holes = [hole for hole in holes if len(hole) >= 3]
        holes.sort(key=_ring_sort_key)
        if len(exterior) >= 3:
            ringsets.append(RingSet(exterior=exterior, holes=holes))
    return ringsets


def polygon_bounds(polygons: list[Polygon]) -> tuple[float, float, float, float]:
    if not polygons:
        return DEFAULT_EMPTY_BOUNDS

    minx = min(float(polygon.bounds[0]) for polygon in polygons)
    miny = min(float(polygon.bounds[1]) for polygon in polygons)
    maxx = max(float(polygon.bounds[2]) for polygon in polygons)
    maxy = max(float(polygon.bounds[3]) for polygon in polygons)
    return minx, miny, maxx, maxy


def _normalize_ring(coords) -> list[tuple[float, float]]:
    points = [(float(x), float(y)) for x, y, *_ in coords]
    if len(points) > 1 and points[0] == points[-1]:
        points = points[:-1]
    return [(_snap(x), _snap(y)) for x, y in points]


def _ring_sort_key(ring: list[tuple[float, float]]) -> tuple[float, float, float]:
    centroid_x = sum(point[0] for point in ring) / len(ring)
    centroid_y = sum(point[1] for point in ring) / len(ring)
    area = 0.0
    for index, (x0, y0) in enumerate(ring):
        x1, y1 = ring[(index + 1) % len(ring)]
        area += (x0 * y1) - (x1 * y0)
    return (-abs(area), round(centroid_x, 12), round(centroid_y, 12))


def _snap(value: float) -> float:
    return 0.0 if abs(value) < NUMERIC_SNAP_EPSILON else value


def _dedupe_preserve_order(items: list[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for item in items:
        if item not in seen:
            seen.add(item)
            ordered.append(item)
    return ordered
