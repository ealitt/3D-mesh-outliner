from __future__ import annotations

from shapely.geometry import Polygon

from mesh2cad.export_svg import export_svg
from mesh2cad.pipeline import shapely_to_rings
from mesh2cad.types import ExportSpec


def test_svg_contains_expected_path_count():
    polygons = [
        Polygon([(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)]),
        Polygon([(2.0, 0.0), (3.0, 0.0), (3.0, 1.0), (2.0, 1.0)]),
    ]

    svg = export_svg(shapely_to_rings(polygons), ExportSpec(write_dxf=False))

    assert svg.count("<path ") == 2


def test_svg_viewbox_matches_geometry_bounds():
    polygon = Polygon([(1.0, 2.0), (5.0, 2.0), (5.0, 6.0), (1.0, 6.0)])

    svg = export_svg(shapely_to_rings([polygon]), ExportSpec(write_dxf=False))

    assert 'viewBox="1 2 4 4"' in svg
