# `@mesh2cad/mesh-workspace-viewer`

Reusable 3D mesh workspace viewer extracted from the mesh2cad studio so it can continue evolving as a standalone package.

## Includes

- Three.js scene rendering with selectable mesh and cut-plane interaction
- Rotate and move gizmos with object/world alignment support
- Build plate rendering and top-view camera mode
- Right-side tool buttons and footer tool patterns
- Viewer settings button and persistence helpers

## Installation

This repo currently keeps the package in `web/packages/mesh-workspace-viewer/` and aliases it into the host app during in-repo development. When published, install it like a normal package:

```bash
npm install @mesh2cad/mesh-workspace-viewer three preact
```

Peer dependencies:

- `preact`
- `three`

## Quick Start

```tsx
import {
  MeshWorkspaceViewer,
  ViewerSettingsButton,
  useViewerSettingsState,
} from "@mesh2cad/mesh-workspace-viewer";
import "@mesh2cad/mesh-workspace-viewer/styles.css";

export function Example({ mesh }) {
  const { settings, setSettings } = useViewerSettingsState();

  return (
    <>
      <ViewerSettingsButton settings={settings} onSettingsChange={setSettings} />
      <MeshWorkspaceViewer
        cameraMode="perspective"
        mesh={mesh}
        onBrowseRequest={() => {}}
        onPlaneRotationChange={() => {}}
        onPlaneTranslationChange={() => {}}
        onResetOrientation={() => {}}
        onResetPlaneOrientation={() => {}}
        onRotationChange={() => {}}
        onSelectionChange={() => {}}
        onSettingsChange={setSettings}
        onTranslationChange={() => {}}
        rotationDegrees={[0, 0, 0]}
        settings={settings}
        translation={[0, 0, 0]}
      />
    </>
  );
}
```

## Styling

- Import `@mesh2cad/mesh-workspace-viewer/styles.css` once in the host app.
- The package ships CSS variables in `tokens.css` and stable `.mwv-*` class names for theme overrides.
- Tailwind is not required.

## Settings Persistence

- Use `useViewerSettingsState()` for a browser-local default workflow.
- Provide a custom `ViewerPersistenceAdapter` when the host app needs to merge viewer preferences into its own storage model.

## Limitations

- The current extracted host still drives a single active mesh at a time.
- The package is Preact-compatible in-repo so the existing app keeps its current runtime footprint.

## Development

```bash
cd web/packages/mesh-workspace-viewer
bun run check
bun run test
bun run build
```
