from __future__ import annotations

import pytest
from shapely.geometry import Polygon

from mesh2cad.offsetting import apply_offset, apply_scale


def test_positive_offset_increases_area():
    square = Polygon([(0.0, 0.0), (2.0, 0.0), (2.0, 2.0), (0.0, 2.0)])

    offset = apply_offset([square], 0.5, "round")

    assert len(offset) == 1
    assert offset[0].area > square.area


def test_negative_offset_decreases_area():
    square = Polygon([(0.0, 0.0), (4.0, 0.0), (4.0, 4.0), (0.0, 4.0)])

    offset = apply_offset([square], -0.5, "mitre")

    assert len(offset) == 1
    assert offset[0].area < square.area


def test_offset_can_collapse_small_polygons_cleanly():
    square = Polygon([(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)])

    collapsed = apply_offset([square], -1.0, "bevel")

    assert collapsed == []


def test_scale_and_offset_order_is_not_interchangeable():
    square = Polygon([(0.0, 0.0), (10.0, 0.0), (10.0, 10.0), (0.0, 10.0)])

    pre_scale = apply_scale(apply_offset([square], 2.0, "mitre"), 0.5)
    post_scale = apply_offset(apply_scale([square], 0.5), 2.0, "mitre")

    assert pre_scale[0].area != pytest.approx(post_scale[0].area)
