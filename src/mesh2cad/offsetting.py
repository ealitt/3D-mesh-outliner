from __future__ import annotations

from shapely import BufferJoinStyle
from shapely.errors import GEOSException
from shapely.affinity import scale as affine_scale

from .cleanup import (
    merge_polygonal_geometries,
    repair_polygonal_geometry,
    sort_polygons,
    stabilize_polygonal_geometry,
)
from .types import JoinStyle

_JOIN_STYLE_MAP = {
    "round": BufferJoinStyle.round,
    "mitre": BufferJoinStyle.mitre,
    "bevel": BufferJoinStyle.bevel,
}
_PRECISION_FACTORS = (0.0, 1e-9, 1e-8, 1e-7, 1e-6)


def apply_scale(polygons, scale: float):
    if scale <= 0.0:
        raise ValueError("Scale must be greater than zero.")
    if scale == 1.0:
        return sort_polygons(list(polygons))

    scaled = []
    for polygon in polygons:
        scaled.extend(
            repair_polygonal_geometry(
                affine_scale(polygon, xfact=scale, yfact=scale, origin=(0.0, 0.0))
            )
        )
    return sort_polygons(scaled)


def apply_offset(polygons, distance: float, join_style: JoinStyle):
    if not polygons:
        return []
    if distance == 0.0:
        return sort_polygons(list(polygons))

    merged = merge_polygonal_geometries(list(polygons))
    if getattr(merged, "is_empty", False):
        return []

    for precision_factor in _PRECISION_FACTORS:
        try:
            candidate = stabilize_polygonal_geometry(merged, precision_factor)
            buffered = candidate.buffer(
                distance,
                join_style=_JOIN_STYLE_MAP[join_style],
            )
            return sort_polygons(repair_polygonal_geometry(buffered))
        except GEOSException:
            continue

    return []
