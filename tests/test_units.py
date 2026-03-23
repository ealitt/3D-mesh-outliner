from __future__ import annotations

import pytest
import trimesh

from mesh2cad.units import normalize_mesh_units


def test_converts_source_units_correctly():
    mesh = trimesh.creation.box(extents=(25.4, 25.4, 25.4))
    mesh.units = "mm"

    converted, effective_units, warnings = normalize_mesh_units(
        mesh,
        source_units=None,
        output_units="in",
    )

    assert warnings == []
    assert effective_units == "in"
    assert converted.extents.tolist() == pytest.approx([1.0, 1.0, 1.0])


def test_warns_when_units_are_missing():
    mesh = trimesh.creation.box(extents=(1.0, 1.0, 1.0))

    converted, effective_units, warnings = normalize_mesh_units(
        mesh,
        source_units=None,
        output_units="mm",
    )

    assert converted.extents.tolist() == pytest.approx([1.0, 1.0, 1.0])
    assert effective_units is None
    assert warnings == [
        "Mesh units were missing; geometry was left unchanged and output units remain unknown."
    ]
