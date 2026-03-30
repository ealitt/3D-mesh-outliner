# mesh2cad Web Studio

Static browser frontend for the `mesh2cad` projection pipeline.

Published site: [https://ealitt.github.io/3D-mesh-outliner/](https://ealitt.github.io/3D-mesh-outliner/)

## What it does

- previews uploaded meshes in a Three.js 3D orbit viewer
- rotates the mesh in X, Y, and Z before processing
- projects the rotated mesh from top-down
- defaults to an outer shadow outline workflow with holes removed
- runs the projection backend in Rust compiled to WebAssembly inside a dedicated worker
- shows the resulting SVG footprint in-browser
- exports SVG and DXF
- supports `stl`, `obj`, `ply`, `glb`, and `3mf` uploads

## Local development

```bash
cd web
bun install
bun run dev
```

Open `http://localhost:5173/` after the server starts.

The frontend compiles the Rust crate in `../mesh2cad-wasm/` with `wasm-pack` before dev/build, then the worker loads the generated Wasm module and processes indexed triangle buffers directly.

You need:

- Bun 1.3.x
- Rust with the `wasm32-unknown-unknown` target
- `wasm-pack`

Quick setup:

```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
```

## Scripts

- `bun run build:wasm` — compile the Rust crate to `src/wasm/pkg`
- `bun run dev` — start the Vite dev server
- `bun run build` — create a production build
- `bun run preview` — preview the production build locally
- `bun run check` — run TypeScript type checking
- `bun run test` — run Vitest
- `bun run validate` — run typecheck, tests, local build, and GitHub Pages-style build

## GitHub Pages

The root repo workflow at `../.github/workflows/deploy.yml` builds this frontend with:

- `VITE_BASE_PATH=/${repository-name}/`
- `VITE_ENABLE_PWA=true`

and deploys `web/dist` to GitHub Pages.

For this repository, the live Pages URL is:

- `https://ealitt.github.io/3D-mesh-outliner/`

Before the workflow can publish, GitHub Pages should be configured to build from `GitHub Actions` in the repository settings.
