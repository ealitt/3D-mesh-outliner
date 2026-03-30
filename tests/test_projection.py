from __future__ import annotations

from pathlib import Path
import builtins

import numpy as np
import pytest
import trimesh

from mesh2cad.io_mesh import load_mesh
import mesh2cad.projection as projection_module
from mesh2cad.projection import path_to_polygons, project_mesh, project_mesh_polygons
from mesh2cad.pipeline import run_pipeline, run_pipeline_loaded
from mesh2cad.types import ExportSpec, ProcessSpec, ProjectionSpec
from mesh2cad.transforms import apply_mesh_rotation, apply_mesh_translation

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


def test_mesh_rotation_changes_top_projection_bounds():
    mesh = trimesh.creation.box(extents=(1.0, 2.0, 3.0))
    rotated = apply_mesh_rotation(mesh, (90.0, 0.0, 0.0))

    path2d, _ = project_mesh(rotated, ProjectionSpec(direction=(0.0, 0.0, 1.0)))
    polygons = path_to_polygons(path2d)

    assert len(polygons) == 1
    assert polygons[0].bounds == pytest.approx((-0.5, -1.5, 0.5, 1.5))


def test_mesh_translation_offsets_top_projection_bounds():
    mesh = trimesh.creation.box(extents=(1.0, 2.0, 3.0))
    translated = apply_mesh_translation(mesh, (4.0, -3.0, 5.0))

    path2d, _ = project_mesh(translated, ProjectionSpec(direction=(0.0, 0.0, 1.0)))
    polygons = path_to_polygons(path2d)

    assert len(polygons) == 1
    assert polygons[0].bounds == pytest.approx((3.5, -4.0, 4.5, -2.0))


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


def test_multi_body_3mf_is_loaded_as_one_projectable_input(tmp_path):
    left = trimesh.creation.box(extents=(1.0, 1.0, 1.0))
    right = trimesh.creation.box(extents=(1.0, 1.0, 1.0))
    right.apply_translation((2.0, 0.0, 0.0))

    scene = trimesh.Scene()
    scene.add_geometry(left, geom_name="left")
    scene.add_geometry(right, geom_name="right")

    path = tmp_path / "multi-body.3mf"
    scene.export(path)

    loaded = load_mesh(path)
    path2d, warnings = project_mesh(loaded.mesh, ProjectionSpec(direction=(0.0, 0.0, 1.0)))
    polygons = path_to_polygons(path2d)

    assert any("Merged 2 mesh bodies" in warning for warning in loaded.warnings)
    assert warnings == []
    assert len(polygons) == 2
    assert sum(polygon.area for polygon in polygons) == pytest.approx(2.0)


def test_projection_falls_back_when_trimesh_projection_requires_rtree(monkeypatch):
    mesh = trimesh.creation.box(extents=(1.0, 2.0, 3.0))

    def missing_rtree(self, normal, **kwargs):
        raise ModuleNotFoundError("No module named 'rtree'")

    monkeypatch.setattr(trimesh.Trimesh, "projected", missing_rtree)

    path2d, warnings = project_mesh(mesh, ProjectionSpec(direction=(0.0, 0.0, 1.0)))
    polygons = path_to_polygons(path2d)

    assert len(polygons) == 1
    assert polygons[0].bounds == pytest.approx((-0.5, -1.0, 0.5, 1.0))
    assert any("internal boundary fallback" in warning for warning in warnings)
    assert any("rtree" in warning for warning in warnings)


def test_projection_fallback_preserves_holes(monkeypatch):
    mesh = load_mesh(FIXTURES / "plate_with_hole.stl").mesh

    def force_fallback(self, normal, **kwargs):
        raise ValueError("forced fallback")

    monkeypatch.setattr(trimesh.Trimesh, "projected", force_fallback)

    path2d, warnings = project_mesh(mesh, ProjectionSpec(direction=(0.0, 0.0, 1.0)))
    polygons = path_to_polygons(path2d)

    assert len(polygons) == 1
    assert len(polygons[0].interiors) == 1
    assert polygons[0].area == pytest.approx(11.0)
    assert any("internal boundary fallback" in warning for warning in warnings)


def test_non_precise_projection_uses_internal_boundary_path_without_calling_trimesh(monkeypatch):
    mesh = trimesh.creation.box(extents=(1.0, 2.0, 3.0))

    def projected_should_not_run(self, normal, **kwargs):
        raise AssertionError("trimesh.projected should be bypassed when precise=False")

    monkeypatch.setattr(trimesh.Trimesh, "projected", projected_should_not_run)

    path2d, warnings = project_mesh(
        mesh,
        ProjectionSpec(direction=(0.0, 0.0, 1.0), precise=False),
    )
    polygons = path_to_polygons(path2d)

    assert warnings == []
    assert len(polygons) == 1
    assert polygons[0].bounds == pytest.approx((-0.5, -1.0, 0.5, 1.0))


def test_path_to_polygons_falls_back_when_polygons_full_requires_rtree(monkeypatch):
    mesh = load_mesh(FIXTURES / "plate_with_hole.stl").mesh
    path2d, warnings = project_mesh(
        mesh,
        ProjectionSpec(direction=(0.0, 0.0, 1.0), precise=False),
    )

    def raise_missing_rtree(_self):
        raise ModuleNotFoundError("No module named 'rtree'")

    monkeypatch.setattr(type(path2d), "polygons_full", property(raise_missing_rtree))

    polygons = path_to_polygons(path2d)

    assert warnings == []
    assert len(polygons) == 1
    assert len(polygons[0].interiors) == 1
    assert polygons[0].area == pytest.approx(11.0)


def test_run_pipeline_precise_false_bypasses_path_conversion(monkeypatch):
    fixture = FIXTURES / "cube.stl"

    def should_not_run(_polygons):
        raise AssertionError("_polygons_to_path should not be used in the fast browser path")

    monkeypatch.setattr("mesh2cad.projection._polygons_to_path", should_not_run)

    result = run_pipeline(
        fixture,
        projection=ProjectionSpec(direction=(0.0, 0.0, 1.0), precise=False),
        process=ProcessSpec(),
        export=ExportSpec(write_svg=False, write_dxf=False),
    )

    assert result.area == pytest.approx(1.0)


def test_project_mesh_polygons_precise_false_never_calls_path_to_polygons(monkeypatch):
    mesh = trimesh.creation.box(extents=(1.0, 2.0, 3.0))

    def should_not_run(_path):
        raise AssertionError("path_to_polygons should be bypassed when precise=False")

    monkeypatch.setattr(projection_module, "path_to_polygons", should_not_run)

    polygons, warnings = project_mesh_polygons(
        mesh,
        ProjectionSpec(direction=(0.0, 0.0, 1.0), precise=False),
    )

    assert warnings == []
    assert len(polygons) == 1
    assert polygons[0].bounds == pytest.approx((-0.5, -1.0, 0.5, 1.0))


def test_run_pipeline_loaded_skips_ezdxf_when_dxf_export_is_disabled(monkeypatch):
    loaded = load_mesh(FIXTURES / "cube.stl")
    original_import = builtins.__import__

    def guarded_import(name, globals=None, locals=None, fromlist=(), level=0):
        if name == "ezdxf" or name.startswith("ezdxf."):
            raise AssertionError("ezdxf should not be imported when write_dxf=False")
        return original_import(name, globals, locals, fromlist, level)

    monkeypatch.setattr(builtins, "__import__", guarded_import)

    result = run_pipeline_loaded(
        loaded,
        projection=ProjectionSpec(direction=(0.0, 0.0, 1.0), precise=False),
        process=ProcessSpec(),
        export=ExportSpec(write_svg=False, write_dxf=False),
    )

    assert result.area == pytest.approx(1.0)
