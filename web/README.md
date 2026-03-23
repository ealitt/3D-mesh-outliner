# mesh2cad Web Studio

Static browser frontend for the `mesh2cad` projection pipeline.

## What it does

- previews uploaded meshes in a 3D orbit viewer
- runs the Python projection pipeline inside a Pyodide worker
- shows the resulting SVG footprint in-browser
- exports SVG and DXF
- supports `stl`, `obj`, `ply`, `glb`, and `3mf` uploads

## Local development

```bash
bun install
bun run dev
```

The frontend syncs the current Python package from `../src/mesh2cad/` into `public/python/` before dev/build so the browser worker stays in lockstep with the repo's Python core.

## Scripts

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
