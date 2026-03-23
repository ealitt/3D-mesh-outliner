from __future__ import annotations

from shapely import BufferJoinStyle
from shapely.affinity import scale as affine_scale
from shapely.ops import unary_union

from .cleanup import repair_polygonal_geometry, sort_polygons
from .types import JoinStyle

_JOIN_STYLE_MAP = {
    "round": BufferJoinStyle.round,
    "mitre": BufferJoinStyle.mitre,
    "bevel": BufferJoinStyle.bevel,
}


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

    buffered = unary_union(polygons).buffer(distance, join_style=_JOIN_STYLE_MAP[join_style])
    return sort_polygons(repair_polygonal_geometry(buffered))
