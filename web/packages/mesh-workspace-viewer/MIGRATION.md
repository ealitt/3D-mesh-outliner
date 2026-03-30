# Migration

## Old to New Imports

- `./components/model-viewer` -> `@mesh2cad/mesh-workspace-viewer`
- app-local transform alignment persistence -> `useViewerSettingsState` plus a `ViewerPersistenceAdapter`
- app-local settings cog shell -> `ViewerSettingsButton`

## Host Integration Steps

1. Import the package stylesheet once.
2. Replace direct viewer imports with `MeshWorkspaceViewer`.
3. Move viewer-specific settings into `ViewerSettings`.
4. Keep app-specific settings in the host and pass any extra controls into `ViewerSettingsButton`.

## Behavior Notes

- Mesh transform and plane transform callbacks stay controlled by the host app.
- Selection, deselection, gizmo mode switching, click-away clearing, and keyboard shortcuts remain package-owned behavior.

## Footguns

- Do not deep-import internal runtime files.
- Keep the host app from mutating the `Object3D` instance after handing it to the package.
- If the host app persists viewer settings in a shared storage blob, merge writes instead of replacing the whole object.
