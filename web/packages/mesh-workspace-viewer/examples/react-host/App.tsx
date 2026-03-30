import {
  MeshWorkspaceViewer,
  ViewerSettingsButton,
  useViewerSettingsState,
} from "@mesh2cad/mesh-workspace-viewer";
import "@mesh2cad/mesh-workspace-viewer/styles.css";

export function App(props: {
  mesh: Parameters<typeof MeshWorkspaceViewer>[0]["mesh"];
}) {
  const { settings, setSettings } = useViewerSettingsState();

  return (
    <div>
      <ViewerSettingsButton settings={settings} onSettingsChange={setSettings} />
      <div style={{ height: "32rem", marginTop: "1rem" }}>
        <MeshWorkspaceViewer
          cameraMode="perspective"
          mesh={props.mesh}
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
      </div>
    </div>
  );
}
