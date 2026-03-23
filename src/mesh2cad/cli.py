from __future__ import annotations

from pathlib import Path

import typer

from .pipeline import run_pipeline
from .projection import direction_from_view, normalize_direction
from .types import ExportSpec, ProcessSpec, ProjectionSpec

app = typer.Typer(help="Project mesh silhouettes into SVG and DXF output.")


@app.callback()
def cli() -> None:
    """mesh2cad command line interface."""


@app.command()
def project(
    input_path: Path = typer.Argument(..., exists=True, dir_okay=False, readable=True),
    direction: tuple[float, float, float] | None = typer.Option(
        None,
        "--direction",
        help="Projection normal as three values: X Y Z.",
        metavar="X Y Z",
    ),
    view: str | None = typer.Option(
        None,
        "--view",
        help="Preset view: top, bottom, front, back, left, right.",
    ),
    source_units: str | None = typer.Option(None, "--source-units"),
    output_units: str = typer.Option("mm", "--output-units"),
    scale: float = typer.Option(1.0, "--scale", min=0.0),
    offset: float = typer.Option(0.0, "--offset"),
    offset_stage: str = typer.Option("post_scale", "--offset-stage"),
    keep: str = typer.Option("largest", "--keep"),
    min_area: float = typer.Option(0.0, "--min-area", min=0.0),
    simplify: float = typer.Option(0.0, "--simplify", min=0.0),
    join_style: str = typer.Option("round", "--join-style"),
    precise: bool = typer.Option(True, "--precise/--fast"),
    ignore_sign: bool = typer.Option(False, "--ignore-sign/--respect-sign"),
    apad: float | None = typer.Option(None, "--apad"),
    rpad: float | None = typer.Option(None, "--rpad"),
    tol_dot: float | None = typer.Option(None, "--tol-dot"),
    svg: Path | None = typer.Option(None, "--svg", dir_okay=False),
    dxf: Path | None = typer.Option(None, "--dxf", dir_okay=False),
    include_hatch: bool = typer.Option(False, "--include-hatch"),
    svg_stroke_width: float = typer.Option(0.1, "--svg-stroke-width", min=0.0),
) -> None:
    if direction is not None and view is not None:
        raise typer.BadParameter("Choose either --direction or --view, not both.")

    resolved_direction = (
        normalize_direction(direction)
        if direction is not None
        else direction_from_view(view or "top")
    )

    if svg is None and dxf is None:
        svg = input_path.with_suffix(".svg")
        dxf = input_path.with_suffix(".dxf")

    result = run_pipeline(
        input_path,
        projection=ProjectionSpec(
            direction=resolved_direction,
            precise=precise,
            ignore_sign=ignore_sign,
            apad=apad,
            rpad=rpad,
            tol_dot=tol_dot,
        ),
        process=ProcessSpec(
            source_units=source_units,
            output_units=output_units,
            scale=scale,
            offset_distance=offset,
            offset_stage=offset_stage,  # type: ignore[arg-type]
            keep_mode=keep,  # type: ignore[arg-type]
            min_area=min_area,
            simplify_tolerance=simplify,
            join_style=join_style,  # type: ignore[arg-type]
        ),
        export=ExportSpec(
            write_svg=svg is not None,
            write_dxf=dxf is not None,
            svg_stroke_width=svg_stroke_width,
            include_hatch=include_hatch,
        ),
    )

    if svg is not None and result.svg_text is not None:
        svg.parent.mkdir(parents=True, exist_ok=True)
        svg.write_text(result.svg_text, encoding="utf-8")
        typer.echo(f"SVG: {svg}")

    if dxf is not None and result.dxf_bytes is not None:
        dxf.parent.mkdir(parents=True, exist_ok=True)
        dxf.write_bytes(result.dxf_bytes)
        typer.echo(f"DXF: {dxf}")

    bounds_text = ", ".join(f"{value:.6g}" for value in result.bounds)
    typer.echo(f"Projected area: {result.area:.6g}")
    typer.echo(f"Bounding box: ({bounds_text})")
    typer.echo(f"Body count: {result.body_count}")
    for warning in result.warnings:
        typer.echo(f"Warning: {warning}")


def main() -> None:
    app()


if __name__ == "__main__":
    main()
