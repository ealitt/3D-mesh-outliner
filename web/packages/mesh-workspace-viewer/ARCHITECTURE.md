# Architecture

## Module Boundaries

- `src/react/`
  React-style integration surface for the host app: the main viewer, settings button, and settings hook.
- `src/core/`
  Typed runtime contracts, settings persistence helpers, mesh analysis, and Three.js viewer runtime internals.
- `src/styles/`
  Package-owned theme tokens and shipped baseline styles.

## Runtime Ownership

- `MeshWorkspaceViewer` owns transient viewer interaction state such as active selection target, active transform tool, lay-flat mode, and the live Three.js runtime.
- The host app owns mesh transforms and plane transforms through callbacks.
- Viewer preferences flow through `ViewerSettings` and remain stable across the viewer and the settings button.

## State Ownership

- Selection is viewer-owned and reported outward with `onSelectionChange`.
- Rotation and translation stay controlled by the host app.
- Viewer settings can be externally controlled or managed with `useViewerSettingsState`.

## Viewer Lifecycle

1. The component lazily imports Three.js and creates the runtime once.
2. Mesh changes clone the provided `Object3D` into the package scene graph.
3. Incremental effects update transforms, projection overlays, and clipping without broad remounts.
4. Cleanup disposes the renderer, controls, helpers, and generated geometries.

## Public vs Private

- Public exports live in `src/index.ts`.
- `src/core/viewer-runtime.ts` is private implementation detail and is intentionally not exported from the package root.
