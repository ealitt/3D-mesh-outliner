from __future__ import annotations

import math
from collections.abc import Sequence

import trimesh
from shapely.geometry import GeometryCollection, MultiPolygon, Polygon

from .config import PROJECTION_RETRY_APAD_FACTOR, VIEW_PRESETS
from .types import ProjectionSpec


def normalize_direction(vec: Sequence[float]) -> tuple[float, float, float]:
    if len(vec) != 3:
        raise ValueError("Direction vectors must contain exactly 3 values.")

    direction = tuple(float(value) for value in vec)
    length = math.sqrt(sum(component * component for component in direction))
    if math.isclose(length, 0.0):
        raise ValueError("Direction vectors may not be the zero vector.")

    return tuple(component / length for component in direction)


def direction_from_view(view: str) -> tuple[float, float, float]:
    key = view.strip().lower()
    if key not in VIEW_PRESETS:
        valid = ", ".join(sorted(VIEW_PRESETS))
        raise ValueError(f"Unknown view preset '{view}'. Expected one of: {valid}")
    return VIEW_PRESETS[key]


def direction_from_azimuth_elevation(
    azimuth_degrees: float,
    elevation_degrees: float,
) -> tuple[float, float, float]:
    azimuth = math.radians(azimuth_degrees)
    elevation = math.radians(elevation_degrees)
    direction = (
        math.cos(elevation) * math.cos(azimuth),
        math.cos(elevation) * math.sin(azimuth),
        math.sin(elevation),
    )
    return normalize_direction(direction)


def path_is_empty(path: trimesh.path.Path2D) -> bool:
    vertices = getattr(path, "vertices", None)
    return (
        len(path.entities) == 0
        or vertices is None
        or getattr(vertices, "ndim", 0) != 2
        or vertices.size == 0
    )


def project_mesh(
    mesh: trimesh.Trimesh,
    spec: ProjectionSpec,
) -> tuple[trimesh.path.Path2D, list[str]]:
    warnings: list[str] = []
    direction = normalize_direction(spec.direction)
    project_kwargs = {
        "origin": spec.origin,
        "precise": spec.precise,
        "ignore_sign": spec.ignore_sign,
        "apad": spec.apad,
        "rpad": spec.rpad,
        "tol_dot": spec.tol_dot,
    }
    kwargs = {key: value for key, value in project_kwargs.items() if value is not None}
    path = mesh.projected(normal=direction, **kwargs)
    if path_is_empty(path):
        warnings.append("Projection produced no outline entities.")
        return path, warnings

    if spec.apad is None and spec.rpad is None and len(path.entities) > 1:
        retry_apad = max(float(mesh.scale or 0.0), 1.0) * PROJECTION_RETRY_APAD_FACTOR
        retry_kwargs = dict(kwargs)
        retry_kwargs["apad"] = retry_apad
        retried = mesh.projected(normal=direction, **retry_kwargs)
        if not path_is_empty(retried) and len(retried.entities) < len(path.entities):
            warnings.append(
                f"Projection was fragmented; retried with apad={retry_apad:.6g}."
            )
            return retried, warnings

    return path, warnings


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


def path_to_polygons(path2d: trimesh.path.Path2D) -> list[Polygon]:
    if path_is_empty(path2d):
        return []

    try:
        polygonal = list(path2d.polygons_full)
    except Exception as exc:
        raise ValueError(f"Failed to convert projected path to polygons: {exc}") from exc

    polygons: list[Polygon] = []
    for geometry in polygonal:
        polygons.extend(_flatten_polygonal_geometry(geometry))
    return polygons
