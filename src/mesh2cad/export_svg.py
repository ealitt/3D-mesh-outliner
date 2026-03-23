from __future__ import annotations

from .config import DEFAULT_SVG_BOUNDS
from .types import ExportSpec, RingSet


def export_svg(
    ringsets: list[RingSet],
    spec: ExportSpec,
    units: str | None = None,
) -> str:
    minx, miny, maxx, maxy = _ringsets_bounds(ringsets)
    width = maxx - minx
    height = maxy - miny
    viewbox = f"{_fmt(minx)} {_fmt(miny)} {_fmt(width)} {_fmt(height)}"
    transform = f"matrix(1 0 0 -1 0 {_fmt(miny + maxy)})"
    units_attr = f' data-units="{units}"' if units else ""

    path_elements = []
    for ringset in ringsets:
        path_elements.append(
            f'    <path d="{_path_d(ringset)}" fill="none" '
            f'fill-rule="evenodd" stroke="black" '
            f'stroke-width="{_fmt(spec.svg_stroke_width)}" />'
        )

    body = "\n".join(path_elements)
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}"'
        f'{units_attr}>\n'
        f"  <desc>mesh2cad export</desc>\n"
        f'  <g transform="{transform}">\n'
        f"{body}\n"
        "  </g>\n"
        "</svg>\n"
    )


def _path_d(ringset: RingSet) -> str:
    commands = [_ring_to_path_commands(ringset.exterior)]
    commands.extend(_ring_to_path_commands(hole) for hole in ringset.holes)
    return " ".join(command for command in commands if command)


def _ring_to_path_commands(points):
    if len(points) < 3:
        return ""
    move = f"M {_fmt(points[0][0])} {_fmt(points[0][1])}"
    lines = " ".join(f"L {_fmt(x)} {_fmt(y)}" for x, y in points[1:])
    return " ".join(part for part in [move, lines, "Z"] if part)


def _ringsets_bounds(ringsets: list[RingSet]) -> tuple[float, float, float, float]:
    if not ringsets:
        return DEFAULT_SVG_BOUNDS

    xs: list[float] = []
    ys: list[float] = []
    for ringset in ringsets:
        for x, y in ringset.exterior:
            xs.append(x)
            ys.append(y)
        for hole in ringset.holes:
            for x, y in hole:
                xs.append(x)
                ys.append(y)

    if not xs or not ys:
        return DEFAULT_SVG_BOUNDS

    minx = min(xs)
    miny = min(ys)
    maxx = max(xs)
    maxy = max(ys)
    width = max(maxx - minx, 1.0)
    height = max(maxy - miny, 1.0)
    return minx, miny, minx + width, miny + height


def _fmt(value: float) -> str:
    text = f"{value:.12g}"
    return "0" if text == "-0" else text
