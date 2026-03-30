import type {
  MeshWorkspaceViewerCopy,
  ViewerSettingsButtonCopy,
} from "@mesh2cad/mesh-workspace-viewer";
import { formatNumber } from "./format";
import type { JoinStyle, ProjectionMode, SceneSelectionTarget } from "./types";

export type UiLanguage = "en" | "ja";

export const DEFAULT_UI_LANGUAGE: UiLanguage = "en";

export type OutputPreviewCopy = {
  generatedSvgAriaLabel: string;
  placeholderCopy: string;
  placeholderTitle: string;
  resetView: string;
};

export type ReloadPromptCopy = {
  dismiss: string;
  offlineReadyCopy: string;
  offlineReadyTitle: string;
  reload: string;
  updateCopy: string;
  updateTitle: string;
};

type ExportCountLabelArgs = {
  hasJoinedProjection: boolean;
  projectionEnabled: boolean;
  visibleLayerCount: number;
  visibleOutlineCount: number;
};

type ProjectionActionLabelArgs = {
  isPlaneCutMode: boolean;
  isProcessing: boolean;
  projectionEnabled: boolean;
};

type LoaderHeadingArgs = {
  hasError: boolean;
  isBusy: boolean;
};

type Translation = {
  appTitle: string;
  dropMeshOverlayCopy: string;
  dropMeshOverlayTitle: string;
  exportKicker: string;
  fitTitles: {
    noMeshLoaded: string;
    preview2d: string;
    preview2dTitle: string;
    preview3d: string;
    preview3dTitle: string;
    previewTop: string;
    previewTopTitle: string;
  };
  languageLabel: string;
  languageOptions: Array<{ label: string; value: UiLanguage }>;
  languageTitle: string;
  loaderHeading: (args: LoaderHeadingArgs) => string;
  meshPanelEmpty: string;
  outputPreviewCopy: OutputPreviewCopy;
  projectionActionButtonLabel: (args: ProjectionActionLabelArgs) => string;
  projectionActionButtonTitle: (isPlaneCutMode: boolean) => string;
  reloadPromptCopy: ReloadPromptCopy;
  renameMeshAriaLabel: (name: string) => string;
  renameMeshTitle: (name: string) => string;
  selectedObjectChipLabel: (target: SceneSelectionTarget, hasMesh: boolean) => string;
  selectedObjectChipTitle: (
    target: SceneSelectionTarget,
    isPlaneCutMode: boolean,
    hasMesh: boolean,
  ) => string;
  settingsNote: string;
  settingsResetButton: string;
  status: {
    idleLoadMesh: string;
    idleUploadMesh: string;
    joinedOutlineReady: (timingSuffix: string) => string;
    joiningVisibleOutlines: string;
    meshReadyOnPlate: string;
    offsetFailed: string;
    offsetOutlineReady: (timingSuffix: string) => string;
    offsettingOutline: string;
    outlineUnionFailed: string;
    parsingMesh: string;
    projectionFailed: string;
    projectionReady: (mode: ProjectionMode, outlineCount: number, timingSuffix: string) => string;
    projectionStart: (mode: ProjectionMode, action: "create" | "update") => string;
    wasmFailed: string;
    wasmReady: string;
  };
  studioSettingsAriaLabel: string;
  studioSettingsKicker: string;
  studioSettingsTitle: string;
  support: {
    exportCountLabel: (args: ExportCountLabelArgs) => string;
    joinStyleLabel: (value: JoinStyle) => string;
    projectionModeLabel: (mode: ProjectionMode) => string;
    selectedTargetLabel: (target: Exclude<SceneSelectionTarget, null>) => string;
    timingSuffix: (pipelineMs: number | null | undefined) => string;
    unitLabel: (value: string | null) => string;
    workerMessage: (message: string) => string;
  };
  ui: {
    browseFiles: string;
    buildPlateCopy: string;
    buildPlateLabel: string;
    exportBoth: string;
    exportBothTitle: string;
    exportDxf: string;
    exportDxfTitle: string;
    exportOffset: string;
    exportOffsetTitle: string;
    exportProjection: string;
    exportProjectionTitle: string;
    exportSvg: string;
    exportSvgTitle: string;
    joinOutlinesLabel: string;
    joinOutlinesTitle: string;
    liveProjectionLabel: string;
    liveProjectionTitle: string;
    meshMetricsBoundingBox: string;
    meshMetricsFile: string;
    meshMetricsMeshes: string;
    meshUnitsLabel: string;
    meshUnitsSelectTitle: string;
    meshUnitsTitle: string;
    meshesKicker: string;
    meshesTitle: string;
    offsetFieldLabel: (units: string) => string;
    offsetFieldTitle: (units: string) => string;
    offsetJoinLabel: string;
    offsetJoinSelectTitle: string;
    offsetJoinTitle: string;
    outlineKicker: string;
    outlinePanelTitle: string;
    outputUnitsLabel: string;
    outputUnitsSelectTitle: string;
    outputUnitsTitle: string;
    planeCutButton: string;
    planeCutTitle: string;
    randomizeColorsLabel: string;
    randomizeColorsTitle: string;
    resetPlaneButton: string;
    resetPlaneOffsetButton: string;
    resetPlaneOffsetTitle: string;
    resetPlaneTitle: string;
    resetPositionButton: string;
    resetPositionTitle: string;
    resetRotationButton: string;
    resetRotationTitle: string;
    selectionHint: (hasMesh: boolean, isPlaneCutMode: boolean) => string;
    settingsAlignmentLabel: string;
    settingsAlignmentObject: string;
    settingsAlignmentWorld: string;
    shadowOutlineButton: string;
    shadowOutlineTitle: string;
    showInnerOutlinesLabel: string;
    showInnerOutlinesTitle: string;
    sourceUnitsLabel: string;
    sourceUnitsTitle: string;
    strokeInputAriaLabel: string;
    strokeLabel: string;
    strokeTitle: string;
    transformAxisHeader: string;
    transformCutPlane: string;
    transformKicker: string;
    transformMesh: string;
    transformMoveHeader: (units: string) => string;
    transformMoveTitle: (axis: "X" | "Y" | "Z", target: SceneSelectionTarget, units: string) => string;
    transformPanelTitle: string;
    transformRotateHeader: string;
    transformRotateTitle: (axis: "X" | "Y" | "Z") => string;
    viewerCopy: MeshWorkspaceViewerCopy;
    viewerSettingsCopy: ViewerSettingsButtonCopy;
  };
};

export function resolveUiLanguage(value: unknown): UiLanguage {
  return value === "ja" ? "ja" : DEFAULT_UI_LANGUAGE;
}

export function getTranslation(language: UiLanguage): Translation {
  return language === "ja" ? JA_TRANSLATION : EN_TRANSLATION;
}

const EN_LANGUAGE_OPTIONS = [
  { label: "English", value: "en" as const },
  { label: "日本語", value: "ja" as const },
];

const JA_LANGUAGE_OPTIONS = [
  { label: "English", value: "en" as const },
  { label: "日本語", value: "ja" as const },
];

function buildEnglishTimingSuffix(pipelineMs: number | null | undefined): string {
  if (pipelineMs === undefined || pipelineMs === null || !Number.isFinite(pipelineMs)) {
    return "";
  }
  return ` in ${formatNumber(Number(pipelineMs), pipelineMs >= 100 ? 0 : 1)} ms`;
}

function buildJapaneseTimingSuffix(pipelineMs: number | null | undefined): string {
  if (pipelineMs === undefined || pipelineMs === null || !Number.isFinite(pipelineMs)) {
    return "";
  }
  return `（${formatNumber(Number(pipelineMs), pipelineMs >= 100 ? 0 : 1)} ms）`;
}

function englishUnitLabel(value: string | null): string {
  switch (value) {
    case null:
      return "Auto / assume millimeters (mm)";
    case "mm":
      return "Millimeters (mm)";
    case "cm":
      return "Centimeters (cm)";
    case "m":
      return "Meters (m)";
    case "in":
      return "Inches (in)";
    case "foot":
      return "Feet";
    default:
      return value;
  }
}

function japaneseUnitLabel(value: string | null): string {
  switch (value) {
    case null:
      return "自動 / ミリメートル (mm) とみなす";
    case "mm":
      return "ミリメートル (mm)";
    case "cm":
      return "センチメートル (cm)";
    case "m":
      return "メートル (m)";
    case "in":
      return "インチ (in)";
    case "foot":
      return "フィート";
    default:
      return value;
  }
}

function englishJoinStyleLabel(value: JoinStyle): string {
  return value;
}

function japaneseJoinStyleLabel(value: JoinStyle): string {
  switch (value) {
    case "round":
      return "丸め";
    case "mitre":
      return "留め";
    case "bevel":
      return "面取り";
    default:
      return value;
  }
}

function translateWorkerMessageEnglish(message: string): string {
  return message;
}

function translateWorkerMessageJapanese(message: string): string {
  switch (message) {
    case "Loading the Rust/Wasm backend...":
      return "Rust/Wasm バックエンドを読み込んでいます...";
    case "Caching triangle buffers in the Wasm worker...":
      return "Wasm ワーカーに三角形バッファをキャッシュしています...";
    case "Running the Rust/Wasm silhouette pipeline...":
      return "Rust/Wasm シルエット処理を実行しています...";
    case "Offsetting the projected outline...":
      return "投影アウトラインをオフセットしています...";
    case "Joining visible outlines...":
      return "表示中のアウトラインを結合しています...";
    case "Wasm backend warmup failed.":
      return "Wasm バックエンドのウォームアップに失敗しました。";
    case "Wasm mesh registration failed.":
      return "Wasm へのメッシュ登録に失敗しました。";
    case "Wasm processing failed.":
      return "Wasm 処理に失敗しました。";
    case "Wasm offsetting failed.":
      return "Wasm オフセット処理に失敗しました。";
    case "Wasm outline union failed.":
      return "Wasm アウトライン結合に失敗しました。";
    case "Wasm worker warmup failed.":
      return "Wasm ワーカーのウォームアップに失敗しました。";
    case "Unexpected worker response.":
      return "予期しないワーカーレスポンスが返されました。";
    case "Wasm projection worker crashed.":
      return "Wasm 投影ワーカーがクラッシュしました。";
    case "Cached Wasm mesh was not found. Re-upload the file and try again.":
      return "Wasm にキャッシュされたメッシュが見つかりません。ファイルを再アップロードしてもう一度お試しください。";
    default:
      return message;
  }
}

const EN_TRANSLATION: Translation = {
  appTitle: "Mesh to CAD outline studio",
  dropMeshOverlayCopy: "Release anywhere on the page.",
  dropMeshOverlayTitle: "Drop mesh to load",
  exportKicker: "Export",
  fitTitles: {
    noMeshLoaded: "No mesh loaded",
    preview2d: "2D preview",
    preview2dTitle: "2D projection preview",
    preview3d: "3D view",
    preview3dTitle: "Perspective build-plate view",
    previewTop: "Top view",
    previewTopTitle: "Top-down orthographic inspection",
  },
  languageLabel: "Language",
  languageOptions: EN_LANGUAGE_OPTIONS,
  languageTitle: "Choose the studio interface language.",
  loaderHeading: ({ hasError, isBusy }) => (isBusy ? "Working" : hasError ? "Needs attention" : "Ready"),
  meshPanelEmpty: "Projected meshes will appear here after projection.",
  outputPreviewCopy: {
    generatedSvgAriaLabel: "Generated SVG projection preview",
    placeholderCopy: "The generated SVG footprint will appear here once you run the projection.",
    placeholderTitle: "2D output preview",
    resetView: "Reset view",
  },
  projectionActionButtonLabel: ({ isPlaneCutMode, isProcessing, projectionEnabled }) => {
    if (isProcessing) {
      return "Updating...";
    }
    if (projectionEnabled) {
      return isPlaneCutMode ? "Refresh Plane Cut" : "Refresh Projection";
    }
    return isPlaneCutMode ? "Create Plane Cut" : "Create Projection";
  },
  projectionActionButtonTitle: (isPlaneCutMode) =>
    isPlaneCutMode ? "Run the plane cut outline (p)" : "Run the top-down outline projection (p)",
  reloadPromptCopy: {
    dismiss: "Dismiss",
    offlineReadyCopy: "This app is cached and can work offline.",
    offlineReadyTitle: "App ready offline",
    reload: "Reload",
    updateCopy: "A newer version has been cached. Reload when you're ready.",
    updateTitle: "Update available",
  },
  renameMeshAriaLabel: (name) => `Rename ${name}`,
  renameMeshTitle: (name) => `Rename ${name}`,
  selectedObjectChipLabel: (target, hasMesh) =>
    target === "mesh" ? "Mesh" : target === "plane" ? "Plane" : hasMesh ? "Select object" : "No mesh",
  selectedObjectChipTitle: (target, isPlaneCutMode, hasMesh) => {
    if (target === "mesh") {
      return "Mesh selected in the 3D view.";
    }
    if (target === "plane") {
      return "Cut plane selected in the 3D view.";
    }
    if (isPlaneCutMode) {
      return "Select the mesh or the cut plane in the 3D view.";
    }
    return hasMesh
      ? "Select the mesh in the 3D view to edit its transform."
      : "Select the mesh in the 3D view to edit its transform.";
  },
  settingsNote: "Saved automatically in this browser.",
  settingsResetButton: "Reset saved defaults",
  status: {
    idleLoadMesh: "Load a mesh to start the 3D preview.",
    idleUploadMesh: "Upload a supported mesh to begin.",
    joinedOutlineReady: (timingSuffix) => `Joined outline ready${timingSuffix}.`,
    joiningVisibleOutlines: "Joining visible outlines...",
    meshReadyOnPlate: "Mesh ready on the build plate.",
    offsetFailed: "Offset failed.",
    offsetOutlineReady: (timingSuffix) => `Offset outline ready${timingSuffix}.`,
    offsettingOutline: "Offsetting the 2D outline...",
    outlineUnionFailed: "Outline union failed.",
    parsingMesh: "Parsing uploaded mesh for the live 3D viewer...",
    projectionFailed: "Projection failed.",
    projectionReady: (mode, outlineCount, timingSuffix) => {
      if (outlineCount > 1) {
        return `${mode === "plane_cut" ? "Plane cut" : "Projection"} ready for ${outlineCount} outlines.`;
      }
      return `${mode === "plane_cut" ? "Plane cut" : "Projection"} ready${timingSuffix}.`;
    },
    projectionStart: (mode, action) => {
      if (mode === "plane_cut") {
        return action === "create" ? "Creating the plane cut..." : "Updating the plane cut...";
      }
      return action === "create" ? "Creating the top-down outline..." : "Updating the top-down outline...";
    },
    wasmFailed: "The Rust/Wasm backend failed to preload. It will retry when needed.",
    wasmReady: "Rust/Wasm backend is ready. Load a mesh to begin.",
  },
  studioSettingsAriaLabel: "Open studio settings",
  studioSettingsKicker: "Studio",
  studioSettingsTitle: "Settings",
  support: {
    exportCountLabel: ({ hasJoinedProjection, projectionEnabled, visibleLayerCount, visibleOutlineCount }) => {
      if (!projectionEnabled || !visibleLayerCount) {
        return "No visible outlines";
      }
      if (hasJoinedProjection) {
        return `1 joined outline from ${visibleLayerCount} visible ${visibleLayerCount === 1 ? "mesh" : "meshes"}`;
      }
      return `${visibleOutlineCount} visible ${visibleOutlineCount === 1 ? "outline" : "outlines"}`;
    },
    joinStyleLabel: englishJoinStyleLabel,
    projectionModeLabel: (mode) => (mode === "plane_cut" ? "Plane cut" : "Projection"),
    selectedTargetLabel: (target) => (target === "plane" ? "Cut plane" : "Mesh"),
    timingSuffix: buildEnglishTimingSuffix,
    unitLabel: englishUnitLabel,
    workerMessage: translateWorkerMessageEnglish,
  },
  ui: {
    browseFiles: "Browse files",
    buildPlateCopy: "Keep the print bed visible in perspective view.",
    buildPlateLabel: "Build plate",
    exportBoth: "Both",
    exportBothTitle: "Export both projection and offset as solid outlines",
    exportDxf: "Export DXF",
    exportDxfTitle: "Download the visible outline selection as DXF",
    exportOffset: "Offset",
    exportOffsetTitle: "Export only the green offset outlines",
    exportProjection: "Projection",
    exportProjectionTitle: "Export only the visible projection outlines",
    exportSvg: "Export SVG",
    exportSvgTitle: "Download the visible outline selection as SVG",
    joinOutlinesLabel: "Join outlines",
    joinOutlinesTitle: "Union the visible body outlines into one joined outline.",
    liveProjectionLabel: "Live projection",
    liveProjectionTitle:
      "Automatically refresh the top-down projection when you rotate or move the mesh. Turn this off if you want to pose first and project manually.",
    meshMetricsBoundingBox: "Bounding Box",
    meshMetricsFile: "File",
    meshMetricsMeshes: "Meshes",
    meshUnitsLabel: "Mesh units",
    meshUnitsSelectTitle: "Millimeters are used by default for mesh imports.",
    meshUnitsTitle: "Meshes are assumed to use these source units unless you change them for the current file.",
    meshesKicker: "Meshes",
    meshesTitle: "Meshes",
    offsetFieldLabel: (units) => `Offset (${units})`,
    offsetFieldTitle: (units) => `Offset the projected 2D outline only, in ${units}.`,
    offsetJoinLabel: "Offset join",
    offsetJoinSelectTitle: "Choose round, mitre, or bevel joins for the green offset outline.",
    offsetJoinTitle: "Controls how the offset corners are joined.",
    outlineKicker: "Outline",
    outlinePanelTitle: "Projection + offset",
    outputUnitsLabel: "Output units",
    outputUnitsSelectTitle: "Saved in this browser for future sessions.",
    outputUnitsTitle: "Choose the units used for preview labels and exported geometry.",
    planeCutButton: "Plane cut",
    planeCutTitle: "Slice the mesh with a movable cut plane and export that section outline.",
    randomizeColorsLabel: "Randomize mesh preview colors",
    randomizeColorsTitle: "Assign a distinct preview color to each visible mesh outline.",
    resetPlaneButton: "Reset plane",
    resetPlaneOffsetButton: "Reset plane offset",
    resetPlaneOffsetTitle: "Center the cut plane back on the default slice position.",
    resetPlaneTitle: "Restore the cut plane so it is parallel to the build plate.",
    resetPositionButton: "Reset position",
    resetPositionTitle: "Move the mesh back to its centered position.",
    resetRotationButton: "Reset rotation",
    resetRotationTitle: "Restore the original loaded mesh orientation.",
    selectionHint: (hasMesh, isPlaneCutMode) => {
      if (!hasMesh) {
        return "Load a mesh to unlock transforms.";
      }
      return isPlaneCutMode
        ? "Select the mesh or the cut plane in the 3D view to edit transforms."
        : "Select the mesh in the 3D view to edit transforms.";
    },
    settingsAlignmentLabel: "Transform alignment",
    settingsAlignmentObject: "Object",
    settingsAlignmentWorld: "World",
    shadowOutlineButton: "Shadow outline",
    shadowOutlineTitle: "Cast a top-down shadow outline from the current mesh pose.",
    showInnerOutlinesLabel: "Show inner outlines",
    showInnerOutlinesTitle: "Include enclosed inner loops and hole outlines in the preview, offset, and export.",
    sourceUnitsLabel: "Source units",
    sourceUnitsTitle: "Interpret the source mesh dimensions with these units.",
    strokeInputAriaLabel: "2D stroke size",
    strokeLabel: "2D stroke",
    strokeTitle: "Controls the line thickness used in the live 2D preview and SVG export.",
    transformAxisHeader: "Axis",
    transformCutPlane: "Cut plane",
    transformKicker: "Transforms",
    transformMesh: "Mesh",
    transformMoveHeader: (units) => `Move (${units})`,
    transformMoveTitle: (axis, target, units) =>
      `${axis} ${target === "plane" ? "plane offset" : "translation"} in ${units}`,
    transformPanelTitle: "Mesh + plane pose",
    transformRotateHeader: "Rotate (deg)",
    transformRotateTitle: (axis) => `${axis} rotation in degrees`,
    viewerCopy: {
      alignmentObjectShort: "OBJ",
      alignmentToObjectTitle: "Switch gizmo alignment to object axes.",
      alignmentToWorldTitle: "Switch gizmo alignment to world axes.",
      alignmentWorldShort: "WORLD",
      browseFiles: "Browse files",
      cameraPerspective: "Perspective",
      dropToPlateButton: "Drop to Plate",
      dropToPlateTitle: "Drop the selected mesh straight onto the buildplate",
      emptyFormats: "STL, OBJ, PLY, GLB, and 3MF",
      emptyTitle: "Drop mesh or browse",
      fitCameraButton: "Fit Camera",
      fitCameraTitle: "Refit the camera to the model",
      hideFacesButton: "Hide Faces (f)",
      layFlatButton: "Lay Flat (f)",
      layFlatMode: "Lay flat",
      layFlatTitle: "Show or hide lay-flat face candidates (f)",
      meshSelected: "Mesh selected",
      moveButton: "Move (t)",
      moveMode: "Move",
      moveTitle: "Move mode (t)",
      noSelection: "No selection",
      planeSelected: "Plane selected",
      preparingCopy: "Building the viewer scene.",
      preparingTitle: "Preparing 3D preview",
      resetOrientationButton: "Reset Orientation",
      resetOrientationTitle: "Reset to the original loaded orientation",
      resetPlaneButton: "Reset Plane",
      resetPlaneTitle: "Reset the cut plane rotation",
      rotateButton: "Rotate (r)",
      rotateMode: "Rotate",
      rotateTitle: "Rotate mode (r)",
      viewerErrorFallback: "The 3D preview could not be created.",
      viewerErrorTitle: "Viewer error",
    },
    viewerSettingsCopy: {
      alignmentLabel: "Transform alignment",
      buildPlateCopy: "Keep the print bed visible in perspective view.",
      buildPlateLabel: "Build plate",
      objectOption: "Object",
      transformAlignmentLabel: "Transform alignment",
      worldOption: "World",
    },
  },
};

const JA_TRANSLATION: Translation = {
  appTitle: "Mesh to CAD アウトラインスタジオ",
  dropMeshOverlayCopy: "ページ上のどこにでもドロップしてください。",
  dropMeshOverlayTitle: "メッシュをドロップして読み込む",
  exportKicker: "書き出し",
  fitTitles: {
    noMeshLoaded: "メッシュ未読み込み",
    preview2d: "2D プレビュー",
    preview2dTitle: "2D 投影プレビュー",
    preview3d: "3D 表示",
    preview3dTitle: "ビルドプレートの透視表示",
    previewTop: "上面図",
    previewTopTitle: "真上からの直交表示",
  },
  languageLabel: "言語",
  languageOptions: JA_LANGUAGE_OPTIONS,
  languageTitle: "スタジオの表示言語を選択します。",
  loaderHeading: ({ hasError, isBusy }) => (isBusy ? "処理中" : hasError ? "要確認" : "準備完了"),
  meshPanelEmpty: "投影後のメッシュがここに表示されます。",
  outputPreviewCopy: {
    generatedSvgAriaLabel: "生成された SVG 投影プレビュー",
    placeholderCopy: "投影を実行すると、生成された SVG の輪郭がここに表示されます。",
    placeholderTitle: "2D 出力プレビュー",
    resetView: "表示をリセット",
  },
  projectionActionButtonLabel: ({ isPlaneCutMode, isProcessing, projectionEnabled }) => {
    if (isProcessing) {
      return "更新中...";
    }
    if (projectionEnabled) {
      return isPlaneCutMode ? "平面カットを更新" : "投影を更新";
    }
    return isPlaneCutMode ? "平面カットを作成" : "投影を作成";
  },
  projectionActionButtonTitle: (isPlaneCutMode) =>
    isPlaneCutMode ? "平面カットのアウトラインを実行します (p)" : "上面アウトライン投影を実行します (p)",
  reloadPromptCopy: {
    dismiss: "閉じる",
    offlineReadyCopy: "このアプリはキャッシュされ、オフラインでも利用できます。",
    offlineReadyTitle: "オフライン利用の準備ができました",
    reload: "再読み込み",
    updateCopy: "新しいバージョンがキャッシュされました。準備ができたら再読み込みしてください。",
    updateTitle: "更新があります",
  },
  renameMeshAriaLabel: (name) => `${name} の名前を変更`,
  renameMeshTitle: (name) => `${name} の名前を変更`,
  selectedObjectChipLabel: (target, hasMesh) =>
    target === "mesh" ? "メッシュ" : target === "plane" ? "平面" : hasMesh ? "オブジェクトを選択" : "メッシュなし",
  selectedObjectChipTitle: (target, isPlaneCutMode, hasMesh) => {
    if (target === "mesh") {
      return "3D 表示でメッシュが選択されています。";
    }
    if (target === "plane") {
      return "3D 表示でカット平面が選択されています。";
    }
    if (isPlaneCutMode) {
      return "3D 表示でメッシュまたはカット平面を選択してください。";
    }
    return hasMesh
      ? "変形を編集するには 3D 表示でメッシュを選択してください。"
      : "変形を編集するには 3D 表示でメッシュを選択してください。";
  },
  settingsNote: "このブラウザーに自動保存されます。",
  settingsResetButton: "保存済みの既定値をリセット",
  status: {
    idleLoadMesh: "3D プレビューを始めるにはメッシュを読み込んでください。",
    idleUploadMesh: "対応したメッシュをアップロードして開始してください。",
    joinedOutlineReady: (timingSuffix) => `結合アウトラインの準備ができました${timingSuffix}。`,
    joiningVisibleOutlines: "表示中のアウトラインを結合しています...",
    meshReadyOnPlate: "メッシュをビルドプレート上に配置しました。",
    offsetFailed: "オフセットに失敗しました。",
    offsetOutlineReady: (timingSuffix) => `オフセットアウトラインの準備ができました${timingSuffix}。`,
    offsettingOutline: "2D アウトラインをオフセットしています...",
    outlineUnionFailed: "アウトライン結合に失敗しました。",
    parsingMesh: "アップロードしたメッシュを解析して 3D ビューアーを準備しています...",
    projectionFailed: "投影に失敗しました。",
    projectionReady: (mode, outlineCount, timingSuffix) => {
      if (outlineCount > 1) {
        return `${mode === "plane_cut" ? "平面カット" : "投影"}の準備ができました。アウトライン ${outlineCount} 件です。`;
      }
      return `${mode === "plane_cut" ? "平面カット" : "投影"}の準備ができました${timingSuffix}。`;
    },
    projectionStart: (mode, action) => {
      if (mode === "plane_cut") {
        return action === "create" ? "平面カットを作成しています..." : "平面カットを更新しています...";
      }
      return action === "create" ? "上面アウトラインを作成しています..." : "上面アウトラインを更新しています...";
    },
    wasmFailed: "Rust/Wasm バックエンドの事前読み込みに失敗しました。必要になったら再試行します。",
    wasmReady: "Rust/Wasm バックエンドの準備ができました。メッシュを読み込んで開始してください。",
  },
  studioSettingsAriaLabel: "スタジオ設定を開く",
  studioSettingsKicker: "スタジオ",
  studioSettingsTitle: "設定",
  support: {
    exportCountLabel: ({ hasJoinedProjection, projectionEnabled, visibleLayerCount, visibleOutlineCount }) => {
      if (!projectionEnabled || !visibleLayerCount) {
        return "表示中のアウトラインはありません";
      }
      if (hasJoinedProjection) {
        return `表示中の ${visibleLayerCount} メッシュから結合アウトライン 1 件`;
      }
      return `表示中のアウトライン ${visibleOutlineCount} 件`;
    },
    joinStyleLabel: japaneseJoinStyleLabel,
    projectionModeLabel: (mode) => (mode === "plane_cut" ? "平面カット" : "投影"),
    selectedTargetLabel: (target) => (target === "plane" ? "カット平面" : "メッシュ"),
    timingSuffix: buildJapaneseTimingSuffix,
    unitLabel: japaneseUnitLabel,
    workerMessage: translateWorkerMessageJapanese,
  },
  ui: {
    browseFiles: "ファイルを選択",
    buildPlateCopy: "透視表示でプリントベッドを表示したままにします。",
    buildPlateLabel: "ビルドプレート",
    exportBoth: "両方",
    exportBothTitle: "投影とオフセットの両方を実線アウトラインとして書き出します",
    exportDxf: "DXF を書き出し",
    exportDxfTitle: "表示中のアウトライン選択を DXF としてダウンロードします",
    exportOffset: "オフセット",
    exportOffsetTitle: "緑色のオフセットアウトラインのみを書き出します",
    exportProjection: "投影",
    exportProjectionTitle: "表示中の投影アウトラインのみを書き出します",
    exportSvg: "SVG を書き出し",
    exportSvgTitle: "表示中のアウトライン選択を SVG としてダウンロードします",
    joinOutlinesLabel: "アウトラインを結合",
    joinOutlinesTitle: "表示中のボディアウトラインを 1 つの結合アウトラインにまとめます。",
    liveProjectionLabel: "ライブ投影",
    liveProjectionTitle:
      "メッシュを回転または移動したときに上面投影を自動更新します。先に姿勢を調整してから手動で投影したい場合はオフにしてください。",
    meshMetricsBoundingBox: "バウンディングボックス",
    meshMetricsFile: "ファイル",
    meshMetricsMeshes: "メッシュ数",
    meshUnitsLabel: "メッシュ単位",
    meshUnitsSelectTitle: "メッシュ読み込みでは既定でミリメートルを使います。",
    meshUnitsTitle: "現在のファイルで変更しない限り、メッシュはこの元単位で扱われます。",
    meshesKicker: "メッシュ",
    meshesTitle: "メッシュ",
    offsetFieldLabel: (units) => `オフセット (${units})`,
    offsetFieldTitle: (units) => `投影された 2D アウトラインだけを ${units} 単位でオフセットします。`,
    offsetJoinLabel: "オフセット結合",
    offsetJoinSelectTitle: "緑色のオフセットアウトラインに丸め、留め、面取りの角処理を選びます。",
    offsetJoinTitle: "オフセット時の角のつなぎ方を制御します。",
    outlineKicker: "アウトライン",
    outlinePanelTitle: "投影 + オフセット",
    outputUnitsLabel: "出力単位",
    outputUnitsSelectTitle: "今後のセッション用にこのブラウザーへ保存されます。",
    outputUnitsTitle: "プレビュー表示や書き出しジオメトリに使う単位を選びます。",
    planeCutButton: "平面カット",
    planeCutTitle: "可動カット平面でメッシュをスライスし、その断面アウトラインを書き出します。",
    randomizeColorsLabel: "メッシュのプレビュー色をランダム化",
    randomizeColorsTitle: "表示中の各メッシュアウトラインに異なるプレビュー色を割り当てます。",
    resetPlaneButton: "平面をリセット",
    resetPlaneOffsetButton: "平面オフセットをリセット",
    resetPlaneOffsetTitle: "カット平面を既定のスライス位置に戻します。",
    resetPlaneTitle: "カット平面をビルドプレートと平行な状態に戻します。",
    resetPositionButton: "位置をリセット",
    resetPositionTitle: "メッシュを中央の位置に戻します。",
    resetRotationButton: "回転をリセット",
    resetRotationTitle: "読み込み時の元のメッシュ姿勢に戻します。",
    selectionHint: (hasMesh, isPlaneCutMode) => {
      if (!hasMesh) {
        return "変形を使うにはメッシュを読み込んでください。";
      }
      return isPlaneCutMode
        ? "変形を編集するには 3D 表示でメッシュまたはカット平面を選択してください。"
        : "変形を編集するには 3D 表示でメッシュを選択してください。";
    },
    settingsAlignmentLabel: "変形の基準",
    settingsAlignmentObject: "オブジェクト",
    settingsAlignmentWorld: "ワールド",
    shadowOutlineButton: "シャドーアウトライン",
    shadowOutlineTitle: "現在のメッシュ姿勢から上面の影アウトラインを投影します。",
    showInnerOutlinesLabel: "内側アウトラインを表示",
    showInnerOutlinesTitle: "プレビュー、オフセット、書き出しに穴や内側ループも含めます。",
    sourceUnitsLabel: "元単位",
    sourceUnitsTitle: "ソースメッシュ寸法をこの単位で解釈します。",
    strokeInputAriaLabel: "2D 線幅",
    strokeLabel: "2D 線幅",
    strokeTitle: "ライブ 2D プレビューと SVG 書き出しで使う線の太さを制御します。",
    transformAxisHeader: "軸",
    transformCutPlane: "カット平面",
    transformKicker: "変形",
    transformMesh: "メッシュ",
    transformMoveHeader: (units) => `移動 (${units})`,
    transformMoveTitle: (axis, target, units) =>
      `${axis} 軸の${target === "plane" ? "平面オフセット" : "移動量"} (${units})`,
    transformPanelTitle: "メッシュ + 平面の姿勢",
    transformRotateHeader: "回転 (度)",
    transformRotateTitle: (axis) => `${axis} 軸回転 (度)`,
    viewerCopy: {
      alignmentObjectShort: "OBJ",
      alignmentToObjectTitle: "ギズモの基準をオブジェクト軸に切り替えます。",
      alignmentToWorldTitle: "ギズモの基準をワールド軸に切り替えます。",
      alignmentWorldShort: "WORLD",
      browseFiles: "ファイルを選択",
      cameraPerspective: "透視",
      dropToPlateButton: "プレートに載せる",
      dropToPlateTitle: "選択したメッシュをそのままビルドプレートに落とします",
      emptyFormats: "STL, OBJ, PLY, GLB, 3MF",
      emptyTitle: "メッシュをドロップするか参照してください",
      fitCameraButton: "カメラを合わせる",
      fitCameraTitle: "モデル全体が入るようにカメラを合わせ直します",
      hideFacesButton: "面候補を隠す (f)",
      layFlatButton: "平置き (f)",
      layFlatMode: "平置き",
      layFlatTitle: "平置き候補面の表示を切り替えます (f)",
      meshSelected: "メッシュ選択中",
      moveButton: "移動 (t)",
      moveMode: "移動",
      moveTitle: "移動モード (t)",
      noSelection: "未選択",
      planeSelected: "平面選択中",
      preparingCopy: "ビューアーシーンを構築しています。",
      preparingTitle: "3D プレビューを準備中",
      resetOrientationButton: "姿勢をリセット",
      resetOrientationTitle: "読み込み時の元の姿勢に戻します",
      resetPlaneButton: "平面をリセット",
      resetPlaneTitle: "カット平面の回転をリセットします",
      rotateButton: "回転 (r)",
      rotateMode: "回転",
      rotateTitle: "回転モード (r)",
      viewerErrorFallback: "3D プレビューを作成できませんでした。",
      viewerErrorTitle: "ビューアーエラー",
    },
    viewerSettingsCopy: {
      alignmentLabel: "変形の基準",
      buildPlateCopy: "透視表示でプリントベッドを表示したままにします。",
      buildPlateLabel: "ビルドプレート",
      objectOption: "オブジェクト",
      transformAlignmentLabel: "変形の基準",
      worldOption: "ワールド",
    },
  },
};
