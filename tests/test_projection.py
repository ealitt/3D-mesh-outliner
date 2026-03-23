from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest
import trimesh

from mesh2cad.io_mesh import load_mesh
from mesh2cad.projection import path_to_polygons, project_mesh
from mesh2cad.types import ProjectionSpec

FIXTURES = Path(__file__).parent / "fixtures"


def test_cube_top_projection_is_a_square():
    loaded = load_mesh(FIXTURES / "cube.stl")
    path2d, warnings = project_mesh(loaded.mesh, ProjectionSpec(direction=(0.0, 0.0, 1.0)))
    polygons = path_to_polygons(path2d)

    assert warnings == []
    assert len(polygons) == 1
    assert polygons[0].area == pytest.approx(1.0)
    assert polygons[0].bounds == pytest.approx((-0.5, -0.5, 0.5, 0.5))


def test_rotated_cube_projection_has_expected_bounds():
    mesh = trimesh.creation.box(extents=(1.0, 1.0, 1.0))
    rotation = trimesh.transformations.rotation_matrix(np.deg2rad(45.0), [0.0, 0.0, 1.0])
    mesh.apply_transform(rotation)

    path2d, _ = project_mesh(mesh, ProjectionSpec(direction=(0.0, 0.0, 1.0)))
    polygons = path_to_polygons(path2d)

    assert len(polygons) == 1
    minx, miny, maxx, maxy = polygons[0].bounds
    assert maxx - minx == pytest.approx(np.sqrt(2.0), rel=1e-6)
    assert maxy - miny == pytest.approx(np.sqrt(2.0), rel=1e-6)


def test_direction_sign_changes_result_when_ignore_sign_is_false():
    vertices = np.array(
        [
            [0.0, 0.0, 0.0],
            [1.0, 0.0, 0.0],
            [1.0, 1.0, 0.0],
            [0.0, 1.0, 0.0],
        ]
    )
    faces = np.array([[0, 1, 2], [0, 2, 3]])
    mesh = trimesh.Trimesh(vertices=vertices, faces=faces, process=False)

    positive_path, positive_warnings = project_mesh(
        mesh,
        ProjectionSpec(direction=(0.0, 0.0, 1.0), ignore_sign=False),
    )
    negative_path, negative_warnings = project_mesh(
        mesh,
        ProjectionSpec(direction=(0.0, 0.0, -1.0), ignore_sign=False),
    )

    assert len(path_to_polygons(positive_path)) == 1
    assert positive_warnings == []
    assert len(path_to_polygons(negative_path)) == 0
    assert negative_warnings == ["Projection produced no outline entities."]


def test_load_mesh_accepts_bytes():
    fixture_bytes = Path(FIXTURES / "cube.stl").read_bytes()
    loaded = load_mesh(fixture_bytes, file_type="stl")

    assert loaded.source_format == "stl"
    assert len(loaded.mesh.faces) > 0


def test_load_mesh_supports_3mf(tmp_path):
    mesh = trimesh.creation.box(extents=(1.0, 2.0, 3.0))
    path = tmp_path / "fixture.3mf"
    mesh.export(path)

    loaded = load_mesh(path)
    path2d, warnings = project_mesh(loaded.mesh, ProjectionSpec(direction=(0.0, 0.0, 1.0)))
    polygons = path_to_polygons(path2d)

    assert warnings == []
    assert len(polygons) == 1
    assert polygons[0].bounds == pytest.approx((-0.5, -1.0, 0.5, 1.0))
