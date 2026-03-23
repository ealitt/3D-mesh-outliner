# mesh2cad

`mesh2cad` is a Python-first utility for turning 3D mesh files into clean 2D projected regions for SVG and DXF workflows.

## What v1 does

- Loads common mesh inputs through `trimesh`
- Projects the mesh orthographically from a chosen direction
- Converts the projection into solid 2D polygons with hole support
- Cleans, filters, scales, and offsets the resulting geometry
- Exports deterministic SVG and DXF output

The v1 scope is intentionally narrow: mesh projection to 2D outline/region generation. It is not a full CAD reconstruction tool.

## Direction convention

Projection direction is expressed as the projection plane normal passed to `trimesh.Trimesh.projected()`.

- `top` = `(0, 0, 1)`
- `bottom` = `(0, 0, -1)`
- `front` = `(0, -1, 0)`
- `back` = `(0, 1, 0)`
- `left` = `(-1, 0, 0)`
- `right` = `(1, 0, 0)`

For open or non-watertight meshes, the sign of the direction matters when `ignore_sign=False`.

## Install

Recommended local setup:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -e '.[dev]'
```

What this does:

- `python3 -m venv .venv` creates a project-local virtual environment
- `source .venv/bin/activate` activates it in your current shell
- `python -m pip install --upgrade pip` makes sure packaging tools are current
- `python -m pip install -e '.[dev]'` installs this project in editable mode plus the optional `dev` dependencies

Why the quotes matter:

- In `zsh`, `.[dev]` is often treated as a glob pattern instead of a Python package extra
- Use `'.[dev]'` or `".[dev]"` so the shell passes it to `pip` unchanged

If you only want runtime dependencies and not test tooling:

```bash
python -m pip install -e .
```

Quick verify:

```bash
python -m pytest
python -m mesh2cad.cli --help
```

If install still fails, the most common causes are:

- not running the command from the repository root
- forgetting to activate the virtual environment first
- leaving off the quotes around `'.[dev]'` in `zsh`
- using an older `pip`/build backend before running the upgrade step

## CLI

```bash
mesh2cad project input.stl \
  --direction 0 0 1 \
  --source-units mm \
  --output-units mm \
  --scale 0.1 \
  --offset 2.0 \
  --offset-stage post_scale \
  --keep largest \
  --svg out.svg \
  --dxf out.dxf
```

Or use a preset:

```bash
mesh2cad project input.stl --view top --scale 0.25 --offset 1.5
```

If neither `--svg` nor `--dxf` is supplied, the CLI writes both beside the input file.

## Web Studio

This repo also includes a static browser frontend in [`web/`](./web) based on the local Bun + Vite + Preact template.

What it does:

- uploads and previews meshes in 3D
- runs the Python projection pipeline in a Pyodide worker
- previews the generated SVG footprint in-browser
- downloads SVG and DXF outputs
- supports `stl`, `obj`, `ply`, `glb`, and `3mf` uploads in the frontend

Run it locally:

```bash
cd web
bun install
bun run dev
```

The frontend build copies the current Python package from `src/mesh2cad/` into the static site before bundling, so the browser worker always runs the same geometry core as the CLI.

GitHub Pages deployment:

- the repo includes [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml)
- pushes to `main` build the frontend in `web/` and deploy `web/dist` to GitHub Pages
- the workflow sets `VITE_BASE_PATH` automatically so project-page deploys work under `/<repo-name>/`

## Library usage

```python
from mesh2cad import ExportSpec, ProcessSpec, ProjectionSpec, run_pipeline

result = run_pipeline(
    "tests/fixtures/cube.stl",
    projection=ProjectionSpec(direction=(0.0, 0.0, 1.0)),
    process=ProcessSpec(source_units="mm", output_units="mm"),
    export=ExportSpec(),
)
```

## Project layout

```text
src/mesh2cad/
  __init__.py
  cleanup.py
  cli.py
  config.py
  export_dxf.py
  export_svg.py
  io_mesh.py
  offsetting.py
  pipeline.py
  projection.py
  types.py
  units.py
tests/
  fixtures/
```
