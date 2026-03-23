from __future__ import annotations

from io import StringIO
from pathlib import Path

import ezdxf

from mesh2cad.export_dxf import export_dxf
from mesh2cad.io_mesh import load_mesh
from mesh2cad.pipeline import shapely_to_rings
from mesh2cad.projection import path_to_polygons, project_mesh
from mesh2cad.types import ExportSpec, ProjectionSpec

FIXTURES = Path(__file__).parent / "fixtures"


def test_dxf_parses_in_ezdxf():
    mesh = load_mesh(FIXTURES / "cube.stl").mesh
    path2d, _ = project_mesh(mesh, ProjectionSpec(direction=(0.0, 0.0, 1.0)))
    ringsets = shapely_to_rings(path_to_polygons(path2d))

    payload = export_dxf(ringsets, ExportSpec(write_svg=False), units="mm")
    document = ezdxf.read(StringIO(payload.decode("utf-8")))

    assert len(document.modelspace().query("LWPOLYLINE")) == 1


def test_dxf_contains_outline_hole_and_hatch_entities():
    mesh = load_mesh(FIXTURES / "plate_with_hole.stl").mesh
    path2d, _ = project_mesh(mesh, ProjectionSpec(direction=(0.0, 0.0, 1.0)))
    ringsets = shapely_to_rings(path_to_polygons(path2d))

    payload = export_dxf(
        ringsets,
        ExportSpec(write_svg=False, include_hatch=True),
        units="mm",
    )
    document = ezdxf.read(StringIO(payload.decode("utf-8")))
    modelspace = document.modelspace()

    assert len(modelspace.query("LWPOLYLINE")) == 2
    assert len(modelspace.query("HATCH")) == 1
