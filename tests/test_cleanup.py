from __future__ import annotations

from pathlib import Path

import pytest
from shapely.errors import GEOSException
from shapely.geometry import Polygon

import mesh2cad.cleanup as cleanup_module
from mesh2cad.cleanup import clean_polygons, repair_polygonal_geometry
from mesh2cad.io_mesh import load_mesh
from mesh2cad.projection import _edges_to_polygons_safe, path_to_polygons, project_mesh
from mesh2cad.types import ProjectionSpec

FIXTURES = Path(__file__).parent / "fixtures"


def test_largest_keeps_one_body():
    mesh = load_mesh(FIXTURES / "multi_body.obj").mesh
    path2d, _ = project_mesh(mesh, ProjectionSpec(direction=(0.0, 0.0, 1.0)))
    polygons = path_to_polygons(path2d)

    cleaned = clean_polygons(polygons, keep_mode="largest", min_area=0.0, simplify_tolerance=0.0)

    assert len(cleaned) == 1
    assert cleaned[0].area == pytest.approx(2.0)


def test_outer_only_removes_holes():
    mesh = load_mesh(FIXTURES / "plate_with_hole.stl").mesh
    path2d, _ = project_mesh(mesh, ProjectionSpec(direction=(0.0, 0.0, 1.0)))
    polygons = path_to_polygons(path2d)

    cleaned = clean_polygons(
        polygons,
        keep_mode="outer_only",
        min_area=0.0,
        simplify_tolerance=0.0,
    )

    assert len(cleaned) == 1
    assert len(cleaned[0].interiors) == 0
    assert cleaned[0].area == pytest.approx(12.0)


def test_invalid_geometry_gets_repaired():
    bowtie = Polygon([(0.0, 0.0), (2.0, 2.0), (0.0, 2.0), (2.0, 0.0)])

    cleaned = clean_polygons(
        [bowtie],
        keep_mode="all",
        min_area=0.0,
        simplify_tolerance=0.0,
    )

    assert len(cleaned) == 2
    assert all(polygon.is_valid for polygon in cleaned)


def test_outer_only_cleanup_avoids_unary_union(monkeypatch):
    square = Polygon([(0.0, 0.0), (4.0, 0.0), (4.0, 4.0), (0.0, 4.0)])
    call_count = {"count": 0}

    def flaky_union(geometries):
        call_count["count"] += 1
        raise GEOSException("TopologyException: simulated test failure")

    monkeypatch.setattr(cleanup_module, "unary_union", flaky_union)

    cleaned = clean_polygons([square], keep_mode="outer_only", min_area=0.0, simplify_tolerance=0.0)

    assert call_count["count"] == 0
    assert len(cleaned) == 1
    assert cleaned[0].area == pytest.approx(square.area)


def test_repair_polygonal_geometry_sanitizes_duplicate_vertices():
    degenerate = Polygon(
        [
            (0.0, 0.0),
            (2.0, 0.0),
            (2.0, 0.0),
            (2.0, 2.0),
            (0.0, 2.0),
            (0.0, 0.0),
        ]
    )

    repaired = repair_polygonal_geometry(degenerate)

    assert len(repaired) == 1
    assert repaired[0].is_valid
    assert repaired[0].area == pytest.approx(4.0)


def test_edges_to_polygons_safe_ignores_zero_length_projected_edges():
    vertices = [
        [0.0, 0.0],
        [2.0, 0.0],
        [2.0, 2.0],
        [0.0, 2.0],
        [2.0, 0.0],
    ]
    edges = [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 0],
        [1, 4],
    ]

    polygons = _edges_to_polygons_safe(vertices=vertices, edges=edges)

    assert len(polygons) == 1
    assert polygons[0].is_valid
    assert polygons[0].area == pytest.approx(4.0)
