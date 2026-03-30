# mesh2cad

`mesh2cad` is a mesh-to-2D outline utility for turning 3D mesh files into clean projected SVG and DXF output.

Live web studio: [https://ealitt.github.io/3D-mesh-outliner/](https://ealitt.github.io/3D-mesh-outliner/)

## What v1 does

- Loads common mesh inputs through `trimesh`
- Projects the mesh orthographically from a chosen direction
- Converts the projection into solid 2D polygons with hole support
- Cleans, filters, scales, and offsets the resulting geometry
- Exports deterministic SVG and DXF output
- Defaults to an outer silhouette workflow suitable for foam cutouts, packaging inserts, and shadow outlines

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

- uploads and previews meshes in a Three.js 3D viewer
- rotates the mesh around X, Y, and Z before processing
- always projects from top-down after applying that rotation
- defaults to an outer shadow outline with no interior cutouts
- runs the projection backend in Rust compiled to WebAssembly inside a dedicated worker
- previews the generated SVG footprint in-browser
- downloads SVG and DXF outputs
- supports `stl`, `obj`, `ply`, `glb`, and `3mf` uploads in the frontend

Run it locally:

```bash
cd web
bun install
bun run dev
```

Then open `http://localhost:5173/`.

Notes:

- `bun run dev` is the right command for local frontend development
- the web build now compiles `mesh2cad-wasm/` with `wasm-pack` before Vite starts
- local frontend development requires Rust with the `wasm32-unknown-unknown` target and `wasm-pack`
- the app now shows a loader/status banner while the mesh preview or Wasm runtime is still warming up
- uploads can be done by drag-and-drop or by using the file picker

If you do not already have the Wasm toolchain:

```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
```

The frontend parses meshes in JS/Three.js, sends indexed triangle buffers to the worker, and runs the silhouette/offset pipeline inside the Rust/Wasm backend.

GitHub Pages deployment:

- the repo includes [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml)
- pushes to `main` build the frontend in `web/` and deploy `web/dist` to GitHub Pages
- the workflow sets `VITE_BASE_PATH` automatically so project-page deploys work under `/<repo-name>/`
- the published project page is `https://ealitt.github.io/3D-mesh-outliner/`
- in the GitHub repo settings, Pages should use `GitHub Actions` as the build source

Manual release sanity check:

```bash
cd web
bun run validate
```

That command type-checks the app, runs the Vitest suite, produces the normal production build, and also verifies a GitHub Pages-style build with a repository base path.

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
