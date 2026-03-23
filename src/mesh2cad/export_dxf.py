from __future__ import annotations

from io import StringIO

import ezdxf
import ezdxf.units

from .types import ExportSpec, RingSet
from .units import is_metric_unit, normalize_unit_name

_DXF_UNITS = {
    "mm": ezdxf.units.MM,
    "millimeter": ezdxf.units.MM,
    "millimeters": ezdxf.units.MM,
    "cm": ezdxf.units.CM,
    "centimeter": ezdxf.units.CM,
    "centimeters": ezdxf.units.CM,
    "m": ezdxf.units.M,
    "meter": ezdxf.units.M,
    "meters": ezdxf.units.M,
    "in": ezdxf.units.IN,
    "inch": ezdxf.units.IN,
    "inches": ezdxf.units.IN,
    "foot": ezdxf.units.FT,
    "feet": ezdxf.units.FT,
    "yard": ezdxf.units.YD,
    "yards": ezdxf.units.YD,
}


def export_dxf(
    ringsets: list[RingSet],
    spec: ExportSpec,
    units: str | None = None,
) -> bytes:
    unit_enum = _DXF_UNITS.get(normalize_unit_name(units)) if units else None
    document = ezdxf.new(dxfversion="R2013", units=unit_enum or 0)
    if unit_enum is None:
        document.header["$INSUNITS"] = 0
        if units is not None:
            document.header["$MEASUREMENT"] = 1 if is_metric_unit(units) else 0

    _ensure_layer(document, spec.dxf_layer_outline)
    _ensure_layer(document, spec.dxf_layer_holes)
    if spec.include_hatch:
        _ensure_layer(document, spec.dxf_layer_hatch)

    modelspace = document.modelspace()
    for ringset in ringsets:
        modelspace.add_lwpolyline(
            _polyline_points(ringset.exterior),
            format="xy",
            close=True,
            dxfattribs={"layer": spec.dxf_layer_outline},
        )
        for hole in ringset.holes:
            modelspace.add_lwpolyline(
                _polyline_points(hole),
                format="xy",
                close=True,
                dxfattribs={"layer": spec.dxf_layer_holes},
            )
        if spec.include_hatch:
            hatch = modelspace.add_hatch(
                color=7,
                dxfattribs={"layer": spec.dxf_layer_hatch},
            )
            hatch.paths.add_polyline_path(_polyline_points(ringset.exterior), flags=1)
            for hole in ringset.holes:
                hatch.paths.add_polyline_path(_polyline_points(hole), flags=0)

    stream = StringIO()
    document.write(stream)
    return stream.getvalue().encode("utf-8")


def _polyline_points(points):
    if not points:
        return []
    if len(points) > 1 and points[0] == points[-1]:
        return points[:-1]
    return points


def _ensure_layer(document: ezdxf.document.Drawing, name: str) -> None:
    if name not in document.layers:
        document.layers.add(name)
