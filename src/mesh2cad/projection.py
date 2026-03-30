from __future__ import annotations

import math
from collections.abc import Sequence

import networkx as nx
import numpy as np
import trimesh
from shapely import node as node_linework
from shapely.geometry import GeometryCollection, LineString, MultiLineString, MultiPolygon, Polygon
from shapely.ops import polygonize
from trimesh.path.entities import Line

from .cleanup import repair_polygonal_geometry, sort_polygons
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
    if not spec.precise:
        path = _project_mesh_fallback(mesh, direction, spec)
        if path_is_empty(path):
            warnings.append("Projection produced no outline entities.")
        return path, warnings

    project_kwargs = {
        "origin": spec.origin,
        "precise": spec.precise,
        "ignore_sign": spec.ignore_sign,
        "apad": spec.apad,
        "rpad": spec.rpad,
        "tol_dot": spec.tol_dot,
    }
    kwargs = {key: value for key, value in project_kwargs.items() if value is not None}
    path: trimesh.path.Path2D
    try:
        path = mesh.projected(normal=direction, **kwargs)
    except Exception as exc:
        warnings.append(
            "Trimesh projection failed; used the internal boundary fallback "
            f"({type(exc).__name__}: {exc})."
        )
        path = _project_mesh_fallback(mesh, direction, spec)
    if path_is_empty(path):
        warnings.append("Projection produced no outline entities.")
        return path, warnings

    if spec.apad is None and spec.rpad is None and len(path.entities) > 1:
        retry_apad = max(float(mesh.scale or 0.0), 1.0) * PROJECTION_RETRY_APAD_FACTOR
        retry_kwargs = dict(kwargs)
        retry_kwargs["precise"] = False
        retry_kwargs["apad"] = retry_apad
        try:
            retried = mesh.projected(normal=direction, **retry_kwargs)
            if not path_is_empty(retried) and len(retried.entities) < len(path.entities):
                warnings.append(
                    f"Projection was fragmented; retried with apad={retry_apad:.6g}."
                )
                return retried, warnings
        except Exception as exc:
            fallback = _project_mesh_fallback(
                mesh,
                direction,
                ProjectionSpec(
                    direction=direction,
                    origin=spec.origin,
                    precise=False,
                    ignore_sign=spec.ignore_sign,
                    apad=retry_apad,
                    rpad=spec.rpad,
                    tol_dot=spec.tol_dot,
                ),
            )
            if not path_is_empty(fallback) and len(fallback.entities) < len(path.entities):
                warnings.append(
                    "Projection fragmentation retry fell back to the internal boundary path "
                    f"({type(exc).__name__}: {exc})."
                )
                return fallback, warnings

    return path, warnings


def project_mesh_polygons(
    mesh: trimesh.Trimesh,
    spec: ProjectionSpec,
) -> tuple[list[Polygon], list[str]]:
    warnings: list[str] = []
    direction = normalize_direction(spec.direction)

    if not spec.precise:
        polygons = _project_mesh_polygons_fallback(mesh, direction, spec)
        if not polygons:
            warnings.append("Projection produced no outline entities.")
        return polygons, warnings

    path, warnings = project_mesh(mesh, spec)
    polygons = path_to_polygons(path)
    return polygons, warnings


def _project_mesh_fallback(
    mesh: trimesh.Trimesh,
    direction: tuple[float, float, float],
    spec: ProjectionSpec,
) -> trimesh.path.Path2D:
    polygons = _project_mesh_polygons_fallback(mesh, direction, spec)
    if not polygons:
        return _empty_path()

    return _polygons_to_path(polygons)


def _project_mesh_polygons_fallback(
    mesh: trimesh.Trimesh,
    direction: tuple[float, float, float],
    spec: ProjectionSpec,
) -> list[Polygon]:
    polygons = sort_polygons(
        [
            repaired
            for polygon in _project_boundary_polygons(mesh, direction, spec)
            for repaired in repair_polygonal_geometry(polygon)
        ]
    )
    if not polygons:
        return []

    polygons = _merge_coverage_polygons(polygons)
    if not polygons:
        return []

    padded = _apply_projection_padding(polygons, mesh, spec)
    polygons = (
        sort_polygons(padded)
        if isinstance(padded, list)
        else repair_polygonal_geometry(padded)
    )
    return sort_polygons(polygons)


def _project_boundary_polygons(
    mesh: trimesh.Trimesh,
    direction: tuple[float, float, float],
    spec: ProjectionSpec,
) -> list[Polygon]:
    normal = np.asarray(direction, dtype=np.float64)
    side = _selected_faces(mesh, normal, spec)
    faces = mesh.faces[side]
    if len(faces) == 0:
        return []

    to_2d = trimesh.geometry.plane_transform(origin=spec.origin, normal=normal)
    vertices_2d = trimesh.transform_points(mesh.vertices, to_2d)[:, :2]
    polygons: list[Polygon] = []
    adjacency_check = side[mesh.face_adjacency].all(axis=1)
    adjacency = mesh.face_adjacency[adjacency_check]
    face_groups = trimesh.graph.connected_components(adjacency, nodes=np.nonzero(side)[0])
    edges = mesh.edges_sorted.reshape((-1, 6))

    for face_group in face_groups:
        edge = edges[face_group].reshape((-1, 2))
        boundary = edge[trimesh.grouping.group_rows(edge, require_count=1)]
        polygons.extend(_edges_to_polygons_safe(boundary, vertices_2d))

    return sort_polygons(polygons)


def _apply_projection_padding(
    geometry: object | list[Polygon],
    mesh: trimesh.Trimesh,
    spec: ProjectionSpec,
) -> object:
    padding = 0.0
    if spec.apad is not None:
        padding += float(spec.apad)
    if spec.rpad is not None:
        scale = float(mesh.scale or 0.0)
        if scale <= 0.0:
            scale = max(float(np.ptp(mesh.vertices[:, axis])) for axis in range(3))
        padding += float(spec.rpad) * max(scale, 1.0)

    if math.isclose(padding, 0.0, abs_tol=1e-12):
        return geometry

    polygons = geometry if isinstance(geometry, list) else repair_polygonal_geometry(geometry)
    if not polygons:
        return geometry

    buffered_polygons: list[Polygon] = []
    for polygon in polygons:
        try:
            buffered = polygon.buffer(padding).buffer(-padding)
        except Exception:
            continue
        buffered_polygons.extend(repair_polygonal_geometry(buffered))
    if buffered_polygons:
        return sort_polygons(buffered_polygons)
    return geometry


def _polygons_to_path(polygons: list[Polygon]) -> trimesh.path.Path2D:
    vertices: list[tuple[float, float]] = []
    entities: list[Line] = []

    for polygon in sort_polygons(polygons):
        _append_ring(vertices, entities, list(polygon.exterior.coords)[:-1])
        for interior in polygon.interiors:
            _append_ring(vertices, entities, list(interior.coords)[:-1])

    if not entities:
        return _empty_path()

    return trimesh.path.Path2D(
        entities=entities,
        vertices=np.asarray(vertices, dtype=np.float64),
        process=True,
    )


def _merge_coverage_polygons(polygons: list[Polygon]) -> list[Polygon]:
    if len(polygons) <= 1:
        return sort_polygons(polygons)

    lines = _coverage_boundary_lines(polygons)
    if not lines:
        return sort_polygons(polygons)

    merged = []
    for polygon in _polygonize_lines(lines):
        merged.extend(repair_polygonal_geometry(polygon))

    if not merged:
        return sort_polygons(polygons)

    selected: list[Polygon] = []
    for polygon in sort_polygons(merged):
        if any(polygon.within(existing) for existing in selected):
            continue
        if any(
            Polygon(interior.coords).equals(polygon)
            for existing in selected
            for interior in existing.interiors
        ):
            continue
        selected.append(polygon)
    return sort_polygons(selected)


def _coverage_boundary_lines(polygons: list[Polygon]) -> list[LineString]:
    points = [
        (float(x), float(y))
        for polygon in polygons
        for ring in [polygon.exterior, *polygon.interiors]
        for x, y, *_ in ring.coords
    ]
    if not points:
        return []

    bounds = [coordinate for polygon in polygons for coordinate in polygon.bounds]
    span = max(max(bounds[2::4], default=1.0) - min(bounds[0::4], default=0.0), max(bounds[3::4], default=1.0) - min(bounds[1::4], default=0.0), 1.0)
    tolerance = span * 1e-9
    edge_counts: dict[tuple[tuple[float, float], tuple[float, float]], int] = {}
    edge_segments: dict[tuple[tuple[float, float], tuple[float, float]], tuple[tuple[float, float], tuple[float, float]]] = {}

    for polygon in polygons:
        for ring in [polygon.exterior, *polygon.interiors]:
            coords = [(float(x), float(y)) for x, y, *_ in ring.coords]
            for start, end in zip(coords, coords[1:]):
                for split_start, split_end in _split_segment(start, end, points, tolerance):
                    key = _normalized_segment_key(split_start, split_end)
                    edge_counts[key] = edge_counts.get(key, 0) + 1
                    edge_segments[key] = (split_start, split_end)

    return [
        LineString(edge_segments[key])
        for key, count in edge_counts.items()
        if count % 2 == 1
    ]


def _split_segment(
    start: tuple[float, float],
    end: tuple[float, float],
    points: list[tuple[float, float]],
    tolerance: float,
) -> list[tuple[tuple[float, float], tuple[float, float]]]:
    sx, sy = start
    ex, ey = end
    dx = ex - sx
    dy = ey - sy

    split_points: list[tuple[float, tuple[float, float]]] = []
    for point in points:
        if point == start or point == end:
            continue
        if not _point_on_segment(point, start, end, tolerance):
            continue
        if abs(dx) >= abs(dy) and abs(dx) > tolerance:
            parameter = (point[0] - sx) / dx
        elif abs(dy) > tolerance:
            parameter = (point[1] - sy) / dy
        else:
            continue
        split_points.append((parameter, point))

    ordered = [start] + [point for _, point in sorted(set(split_points))] + [end]
    return list(zip(ordered, ordered[1:]))


def _point_on_segment(
    point: tuple[float, float],
    start: tuple[float, float],
    end: tuple[float, float],
    tolerance: float,
) -> bool:
    px, py = point
    sx, sy = start
    ex, ey = end
    cross = (ex - sx) * (py - sy) - (ey - sy) * (px - sx)
    if abs(cross) > tolerance:
        return False
    dot = (px - sx) * (px - ex) + (py - sy) * (py - ey)
    return dot <= tolerance


def _normalized_segment_key(
    start: tuple[float, float],
    end: tuple[float, float],
) -> tuple[tuple[float, float], tuple[float, float]]:
    return (start, end) if start <= end else (end, start)


def _quantized_segment_key(
    start: tuple[float, float],
    end: tuple[float, float],
    tolerance: float,
) -> tuple[tuple[int, int], tuple[int, int]]:
    quantized_start = _quantized_point(start, tolerance)
    quantized_end = _quantized_point(end, tolerance)
    return (
        (quantized_start, quantized_end)
        if quantized_start <= quantized_end
        else (quantized_end, quantized_start)
    )


def _quantized_point(point: tuple[float, float], tolerance: float) -> tuple[int, int]:
    step = tolerance if tolerance > 0.0 else 1e-9
    return (
        int(round(point[0] / step)),
        int(round(point[1] / step)),
    )


def _points_close(
    left: tuple[float, float],
    right: tuple[float, float],
    tolerance: float,
) -> bool:
    return (
        math.isclose(left[0], right[0], abs_tol=tolerance)
        and math.isclose(left[1], right[1], abs_tol=tolerance)
    )


def _append_ring(
    vertices: list[tuple[float, float]],
    entities: list[Line],
    ring: list[tuple[float, float]],
) -> None:
    if len(ring) < 3:
        return

    start = len(vertices)
    vertices.extend((float(x), float(y)) for x, y in ring)
    entities.append(Line(points=list(range(start, start + len(ring))), closed=True))


def _empty_path() -> trimesh.path.Path2D:
    return trimesh.path.Path2D(
        entities=[],
        vertices=np.empty((0, 2), dtype=np.float64),
        process=False,
    )


def _selected_faces(
    mesh: trimesh.Trimesh,
    normal: np.ndarray,
    spec: ProjectionSpec,
) -> np.ndarray:
    tol_dot = float(spec.tol_dot if spec.tol_dot is not None else 1e-10)
    dot_face = np.dot(normal, mesh.face_normals.T)
    if spec.ignore_sign:
        front = dot_face > tol_dot
        back = dot_face < -tol_dot
        counts = np.array([front.sum(), back.sum()], dtype=np.int64)
        if counts.min() == 0:
            return [front, back][int(counts.argmax())]
        return [front, back][int(counts.argmin())]
    return dot_face > tol_dot


def _edges_to_polygons_safe(
    edges: np.ndarray,
    vertices: np.ndarray,
) -> list[Polygon]:
    lines = _boundary_lines_from_edges(edges, vertices)
    if not lines:
        return []

    polygons: list[Polygon] = []
    for polygon in _polygonize_lines(lines):
        polygons.extend(repair_polygonal_geometry(polygon))

    if len(polygons) <= 1:
        return sort_polygons(polygons)

    roots, contains = _enclosure_tree_without_index(polygons)
    if len(roots) == 0:
        return sort_polygons(polygons)

    result: list[Polygon] = []
    for root in roots:
        hole_ids = list(contains[root].keys()) if root in contains else []
        polygon = Polygon(
            shell=polygons[root].exterior.coords,
            holes=[polygons[index].exterior.coords for index in hole_ids],
        )
        result.extend(repair_polygonal_geometry(polygon))
    return sort_polygons(result)


def _boundary_lines_from_edges(
    edges: np.ndarray,
    vertices: np.ndarray,
) -> list[LineString]:
    if len(edges) == 0:
        return []

    coords = np.asarray(vertices, dtype=np.float64)
    if coords.size == 0:
        return []

    span = max(
        float(np.ptp(coords[:, 0])) if coords.shape[0] else 0.0,
        float(np.ptp(coords[:, 1])) if coords.shape[0] else 0.0,
        1.0,
    )
    tolerance = span * 1e-9
    seen: set[tuple[tuple[int, int], tuple[int, int]]] = set()
    lines: list[LineString] = []

    for start_index, end_index in np.asarray(edges, dtype=np.int64):
        start = (float(coords[start_index][0]), float(coords[start_index][1]))
        end = (float(coords[end_index][0]), float(coords[end_index][1]))
        if _points_close(start, end, tolerance):
            continue
        key = _quantized_segment_key(start, end, tolerance)
        if key in seen:
            continue
        seen.add(key)
        lines.append(LineString([start, end]))

    return lines


def _polygonize_lines(lines: list[LineString]) -> list[Polygon]:
    if not lines:
        return []

    linework = MultiLineString(lines)
    try:
        linework = node_linework(linework)
    except Exception:
        pass
    return list(polygonize(linework))


def _enclosure_tree_without_index(
    polygons: list[Polygon],
) -> tuple[np.ndarray, nx.DiGraph]:
    contains = nx.DiGraph()
    contains.add_nodes_from(range(len(polygons)))

    if len(polygons) <= 1:
        return np.arange(len(polygons), dtype=np.int64), contains

    for index, polygon in enumerate(polygons):
        for other_index in range(index + 1, len(polygons)):
            other = polygons[other_index]
            if polygon.contains(other):
                contains.add_edge(index, other_index)
            elif other.contains(polygon):
                contains.add_edge(other_index, index)

    degree = dict(contains.in_degree())
    indexes = np.array(list(degree.keys()), dtype=np.int64)
    degrees = np.array(list(degree.values()), dtype=np.int64)
    roots = indexes[(degrees % 2) == 0]

    if len(degrees) > 0 and degrees.max() > 1:
        edges: list[tuple[int, int]] = []
        roots = roots[np.argsort([degree[root] for root in roots])]
        for root in roots:
            children = indexes[degrees == degree[root] + 1]
            edges.extend(contains.subgraph(np.append(children, root)).edges())
        contains = nx.from_edgelist(edges, nx.DiGraph())
        contains.add_nodes_from(roots)

    return roots, contains


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

    fallback = _path_to_polygons_without_index(path2d)
    if fallback:
        return fallback

    try:
        polygonal = list(path2d.polygons_full)
        polygons: list[Polygon] = []
        for geometry in polygonal:
            polygons.extend(_flatten_polygonal_geometry(geometry))
        return sort_polygons(polygons)
    except Exception as exc:
        raise ValueError(f"Failed to convert projected path to polygons: {exc}") from exc


def _path_to_polygons_without_index(path2d: trimesh.path.Path2D) -> list[Polygon]:
    try:
        discrete_paths = list(path2d.discrete)
    except Exception:
        return []

    rings: list[Polygon] = []
    for discrete in discrete_paths:
        if len(discrete) < 3:
            continue
        rings.extend(repair_polygonal_geometry(Polygon(discrete)))

    if len(rings) <= 1:
        return sort_polygons(rings)

    roots, contains = _enclosure_tree_without_index(rings)
    if len(roots) == 0:
        return sort_polygons(rings)

    polygons: list[Polygon] = []
    for root in roots:
        hole_ids = list(contains[root].keys()) if root in contains else []
        polygon = Polygon(
            shell=rings[root].exterior.coords,
            holes=[rings[index].exterior.coords for index in hole_ids],
        )
        polygons.extend(repair_polygonal_geometry(polygon))

    return sort_polygons(polygons)
