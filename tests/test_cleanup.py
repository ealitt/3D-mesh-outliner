from __future__ import annotations

from pathlib import Path

import pytest
from shapely.geometry import Polygon

from mesh2cad.cleanup import clean_polygons
from mesh2cad.io_mesh import load_mesh
from mesh2cad.projection import path_to_polygons, project_mesh
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
