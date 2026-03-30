import type { ComponentChildren } from "preact";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  MeshWorkspaceViewer,
  ViewerSettingsButton,
  useViewerSettingsState,
  type ViewerPersistenceAdapter,
} from "@mesh2cad/mesh-workspace-viewer";
import { ReloadPrompt } from "./components/reload-prompt";
import { OutputPreview } from "./components/output-preview";
import { dropMeshToBuildplate } from "./lib/auto-drop";
import { ENABLE_PWA } from "./lib/base-path";
import {
  JOIN_STYLE_OPTIONS,
  MESH_ACCEPT,
  OUTPUT_UNIT_OPTIONS,
  UNIT_OPTIONS,
  stemFromFileName,
} from "./lib/directions";
import { downloadTextFile } from "./lib/download";
import { formatExtents, formatFileSize, formatNumber } from "./lib/format";
import { DEFAULT_UI_LANGUAGE, getTranslation, resolveUiLanguage, type UiLanguage } from "./lib/i18n";
import {
  offsetProjectedRings,
  processMeshFile,
  unionProjectedRings,
  warmMeshWorker,
} from "./lib/mesh-worker-client";
import { prepareMeshFile } from "./lib/model-loader";
import type {
  ExportSelection,
  FocusOutlineRequest,
  PlaneState,
  PipelineBrowserResult,
  PreviewOutlineLayer,
  PreviewSelectionDetails,
  PreparedMesh,
  ProcessSettings,
  ProjectionMode,
  RingSet2D,
  SceneSelectionTarget,
  TransformAlignmentMode,
} from "./lib/types";
import { buildExportDxf, buildExportSvg, buildPreviewSvg } from "./lib/vector-export";

const TOP_DOWN_DIRECTION: [number, number, number] = [0, 0, 1];
const EMPTY_RINGS: PipelineBrowserResult["rings"] = [];
const DEFAULT_OUTLINE_COLOR = "#dc2626";
const OUTLINE_COLOR_PALETTE = [
  "#3b4cc0",
  "#5d7ce6",
  "#84a7fc",
  "#b5cdfa",
  "#edd1c2",
  "#f7a889",
  "#e26952",
  "#b40426",
];
const DEFAULT_LIVE_PROJECTION_ENABLED = true;
const MIN_STROKE_SIZE = 0.1;
const STROKE_SIZE_COMMIT_DELAY_MS = 320;
const DEFAULT_TRANSFORM_ALIGNMENT_MODE: TransformAlignmentMode = "local";

const DEFAULT_SETTINGS: ProcessSettings = {
  direction: TOP_DOWN_DIRECTION,
  joinStyle: "round",
  keepMode: "outer_only",
  minArea: 0,
  offsetDistance: 0,
  offsetStage: "post_scale",
  outputUnits: "mm",
  planeRotationDegrees: [0, 0, 0],
  planeTranslation: [0, 0, 0],
  projectionMode: "silhouette",
  rotationDegrees: [0, 0, 0],
  rotationOrigin: [0, 0, 0],
  scale: 1,
  snapGrid: null,
  simplifyTolerance: 0,
  sourceUnits: "mm",
  svgStrokeWidth: 0.35,
  translation: [0, 0, 0],
  unionBatchSize: 4096,
};

type PreviewTab = "svg" | "top" | "viewer";

type OutlineEntry = {
  displayName: string;
  id: string;
  originalName: string;
  result: PipelineBrowserResult | null;
  visible: boolean;
};

type PreviewSelectionDebugState = {
  clickedMeshId: string | null;
  clientX: number;
  clientY: number;
  hoveredMeshIdBefore: string | null;
  selectedMeshIdBefore: string | null;
  selectionSourceBefore: "list" | "preview" | null;
};

type PreviewVisibilityDebugState = {
  meshId: string;
  selectedMeshIdBefore: string | null;
  source: "keyboard" | "ui";
  visibleBefore: boolean | null;
};

const STUDIO_SETTINGS_STORAGE_KEY = "mesh2cad.studio.settings";

type StudioPreferences = {
  liveProjectionEnabled: boolean;
  settings: ProcessSettings;
  uiLanguage: UiLanguage;
};

function applyOutlineViewMode(
  result: PipelineBrowserResult,
  keepMode: ProcessSettings["keepMode"],
  showInnerOutlines: boolean,
): PipelineBrowserResult {
  const rings = applyKeepModeToRings(result.rings, keepMode).map((ring) => ({
    exterior: ring.exterior,
    holes: showInnerOutlines ? ring.holes : [],
  }));

  return {
    ...result,
    area: rings.reduce((total, ring) => total + ringSetArea(ring), 0),
    bodyCount: rings.length,
    rings,
  };
}

function applyKeepModeToRings(
  rings: RingSet2D[],
  keepMode: ProcessSettings["keepMode"],
): RingSet2D[] {
  if (keepMode === "largest") {
    const largestRing = rings.reduce<RingSet2D | null>((largest, ring) => {
      if (!largest) {
        return ring;
      }
      return ringSetArea(ring) > ringSetArea(largest) ? ring : largest;
    }, null);
    return largestRing ? [largestRing] : [];
  }

  return rings;
}

function ringSetArea(ring: RingSet2D): number {
  return Math.max(
    0,
    ringArea(ring.exterior) - ring.holes.reduce((total, hole) => total + ringArea(hole), 0),
  );
}

function ringArea(points: [number, number][]): number {
  if (points.length < 3) {
    return 0;
  }

  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const [x0, y0] = points[index];
    const [x1, y1] = points[(index + 1) % points.length];
    area += (x0 * y1) - (x1 * y0);
  }
  return Math.abs(area * 0.5);
}

export default function App() {
  const initialStudioPreferences = useMemo(() => loadStoredStudioPreferences(), []);
  const initialViewerSettings = useMemo(() => loadStoredStudioViewerSettings(), []);
  const viewerPersistenceAdapter = useMemo(() => createStudioViewerPersistenceAdapter(), []);
  const initialSettings = initialStudioPreferences.settings;
  const completedProjectionSignatureRef = useRef<string | null>(null);
  const dragDepthRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef<{
    future: ProcessSettings[];
    past: ProcessSettings[];
    suspend: boolean;
  }>({ future: [], past: [], suspend: false });
  const isProcessingRef = useRef(false);
  const joinedRequestVersionRef = useRef(0);
  const meshRef = useRef<PreparedMesh | null>(null);
  const meshRowRefs = useRef(new Map<string, HTMLDivElement>());
  const offsetRequestVersionRef = useRef(0);
  const pendingPreviewSelectionDebugRef = useRef<PreviewSelectionDebugState | null>(null);
  const pendingPreviewScrollMeshIdRef = useRef<string | null>(null);
  const pendingPreviewVisibilityDebugRef = useRef<PreviewVisibilityDebugState | null>(null);
  const previousSettingsRef = useRef<ProcessSettings>(cloneSettings(initialSettings));
  const previousPlaneSignatureRef = useRef<string | null>(null);
  const queuedProjectionRef = useRef<{ reason: string; signature: string } | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const settingsRef = useRef(initialSettings);
  const showInnerOutlinesRef = useRef(false);
  const skipNextAutoProjectionRef = useRef(false);
  const workspaceRailRef = useRef<HTMLDivElement>(null);
  const [activePreview, setActivePreview] = useState<PreviewTab>("viewer");
  const [editingMeshId, setEditingMeshId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [exportSelection, setExportSelection] = useState<ExportSelection>("projection");
  const [focusOutlineRequest, setFocusOutlineRequest] = useState<FocusOutlineRequest | null>(null);
  const [focusPreviewRequest, setFocusPreviewRequest] = useState<FocusOutlineRequest | null>(null);
  const [hoverOrigin, setHoverOrigin] = useState<"list" | "preview" | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [isOffsetting, setIsOffsetting] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hoveredMeshId, setHoveredMeshId] = useState<string | null>(null);
  const [joinOutlines, setJoinOutlines] = useState(false);
  const [joinedProjectionResult, setJoinedProjectionResult] = useState<PipelineBrowserResult | null>(null);
  const [mesh, setMesh] = useState<PreparedMesh | null>(null);
  const [meshNameDraft, setMeshNameDraft] = useState("");
  const [offsetResult, setOffsetResult] = useState<PipelineBrowserResult | null>(null);
  const [outlineEntries, setOutlineEntries] = useState<OutlineEntry[]>([]);
  const [planeRevision, setPlaneRevision] = useState(0);
  const [projectionEnabled, setProjectionEnabled] = useState(false);
  const [selectedMeshId, setSelectedMeshId] = useState<string | null>(null);
  const [selectionSource, setSelectionSource] = useState<"list" | "preview" | null>(null);
  const [selectedSceneTarget, setSelectedSceneTarget] = useState<SceneSelectionTarget>(null);
  const [settings, setSettings] = useState<ProcessSettings>(initialSettings);
  const [uiLanguage, setUiLanguage] = useState<UiLanguage>(initialStudioPreferences.uiLanguage);
  const [isLiveProjectionEnabled, setIsLiveProjectionEnabled] = useState(
    initialStudioPreferences.liveProjectionEnabled,
  );
  const i18n = useMemo(() => getTranslation(uiLanguage), [uiLanguage]);
  const ui = i18n.ui;
  const joinStyleOptions = JOIN_STYLE_OPTIONS.map((option) => ({
    label: i18n.support.joinStyleLabel(option.value),
    value: option.value,
  }));
  const outputUnitOptions = OUTPUT_UNIT_OPTIONS.map((option) => ({
    label: i18n.support.unitLabel(option.value),
    value: option.value ?? "",
  }));
  const unitOptions = UNIT_OPTIONS.map((option) => ({
    label: i18n.support.unitLabel(option.value),
    value: option.value ?? "",
  }));
  const {
    resetSettings: resetViewerSettings,
    settings: viewerSettings,
    setSettings: setViewerSettings,
  } = useViewerSettingsState({
    defaultSettings: initialViewerSettings,
    persistenceAdapter: viewerPersistenceAdapter,
  });
  const [showInnerOutlines, setShowInnerOutlines] = useState(false);
  const [statusMessage, setStatusMessage] = useState(
    () => getTranslation(initialStudioPreferences.uiLanguage).status.idleLoadMesh,
  );
  const [useRandomOutlineColors, setUseRandomOutlineColors] = useState(false);

  const exportStem = useMemo(() => stemFromFileName(mesh?.fileName ?? "projection"), [mesh]);
  const isBusy = isPreparing || isProcessing || isJoining || isOffsetting;
  const visibleOutlineEntries = useMemo(
    () => outlineEntries.filter((entry) => entry.visible && entry.result),
    [outlineEntries],
  );
  const visibleOutlineResults = useMemo(
    () =>
      visibleOutlineEntries
        .map((entry) => applyOutlineViewMode(entry.result!, settings.keepMode, showInnerOutlines)),
    [settings.keepMode, showInnerOutlines, visibleOutlineEntries],
  );
  const visibleOutlineRings = useMemo(
    () => visibleOutlineResults.flatMap((result) => result.rings),
    [visibleOutlineResults],
  );
  const shouldJoinVisibleOutlines = joinOutlines && visibleOutlineResults.length > 1;
  const hasJoinedProjection = shouldJoinVisibleOutlines && Boolean(joinedProjectionResult?.rings.length);
  const projectionResult = useMemo(() => {
    if (hasJoinedProjection) {
      return joinedProjectionResult;
    }
    return aggregatePipelineResults(visibleOutlineResults);
  }, [hasJoinedProjection, joinedProjectionResult, visibleOutlineResults]);
  const projectionRings = projectionResult?.rings ?? EMPTY_RINGS;
  const offsetRings = Math.abs(settings.offsetDistance) > 0.0001
    ? (offsetResult?.rings ?? EMPTY_RINGS)
    : EMPTY_RINGS;
  const outlineColors = useMemo(() => {
    const map = new Map<string, string>();
    outlineEntries.forEach((entry, index) => {
      map.set(
        entry.id,
        useRandomOutlineColors
          ? OUTLINE_COLOR_PALETTE[hashString(entry.id || String(index)) % OUTLINE_COLOR_PALETTE.length]
          : DEFAULT_OUTLINE_COLOR,
      );
    });
    return map;
  }, [outlineEntries, useRandomOutlineColors]);
  const selectedVisibleOutlineEntry = useMemo(
    () =>
      selectedMeshId
        ? outlineEntries.find((entry) => entry.id === selectedMeshId && entry.visible && entry.result) ?? null
        : null,
    [outlineEntries, selectedMeshId],
  );
  const hoveredVisibleOutlineEntry = useMemo(
    () =>
      hoveredMeshId
        ? outlineEntries.find((entry) => entry.id === hoveredMeshId && entry.visible && entry.result) ?? null
        : null,
    [hoveredMeshId, outlineEntries],
  );
  const activePreviewOutlineEntry = selectedVisibleOutlineEntry ?? hoveredVisibleOutlineEntry;
  const activePreviewMeshId = activePreviewOutlineEntry?.id ?? null;
  const selectedProjectionRings = useMemo(
    () =>
      selectedVisibleOutlineEntry?.result
        ? applyOutlineViewMode(selectedVisibleOutlineEntry.result, settings.keepMode, showInnerOutlines).rings
        : EMPTY_RINGS,
    [selectedVisibleOutlineEntry, settings.keepMode, showInnerOutlines],
  );
  const hoveredProjectionRings = useMemo(
    () =>
      !selectedVisibleOutlineEntry && hoveredVisibleOutlineEntry?.result
        ? applyOutlineViewMode(hoveredVisibleOutlineEntry.result, settings.keepMode, showInnerOutlines).rings
        : EMPTY_RINGS,
    [hoveredVisibleOutlineEntry, selectedVisibleOutlineEntry, settings.keepMode, showInnerOutlines],
  );
  const highlightedProjectionRings = useMemo(
    () => (selectedProjectionRings.length ? selectedProjectionRings : hoveredProjectionRings),
    [hoveredProjectionRings, selectedProjectionRings],
  );
  const hoveredProjectionColor = useMemo(
    () => (
      !selectedVisibleOutlineEntry && hoveredVisibleOutlineEntry
        ? (outlineColors.get(hoveredVisibleOutlineEntry.id) ?? DEFAULT_OUTLINE_COLOR)
        : null
    ),
    [hoveredVisibleOutlineEntry, outlineColors, selectedVisibleOutlineEntry],
  );
  const selectedProjectionColor = useMemo(
    () => (
      selectedVisibleOutlineEntry
        ? (outlineColors.get(selectedVisibleOutlineEntry.id) ?? DEFAULT_OUTLINE_COLOR)
        : null
    ),
    [outlineColors, selectedVisibleOutlineEntry],
  );
  const hasAnyInnerOutlines = useMemo(
    () => outlineEntries.some((entry) => entry.result?.rings.some((ring) => ring.holes.length > 0)),
    [outlineEntries],
  );
  const projectionPreviewLayers = useMemo<PreviewOutlineLayer[]>(() => {
    if (hasJoinedProjection) {
      return [
        {
          color: DEFAULT_OUTLINE_COLOR,
          id: "joined-projection",
          rings: joinedProjectionResult?.rings ?? EMPTY_RINGS,
        },
      ];
    }

    return visibleOutlineEntries.map((entry) => ({
      color: outlineColors.get(entry.id) ?? DEFAULT_OUTLINE_COLOR,
      dimmed: activePreviewMeshId !== null && activePreviewMeshId !== entry.id,
      id: entry.id,
      meshId: entry.id,
      rings: entry.result
        ? applyOutlineViewMode(entry.result, settings.keepMode, showInnerOutlines).rings
        : EMPTY_RINGS,
    }));
  }, [
    activePreviewMeshId,
    hasJoinedProjection,
    joinedProjectionResult?.rings,
    outlineColors,
    settings.keepMode,
    showInnerOutlines,
    visibleOutlineEntries,
  ]);
  const visibleLayerCount = useMemo(
    () => outlineEntries.filter((entry) => entry.visible).length,
    [outlineEntries],
  );
  const exportCountLabel = useMemo(() => {
    return i18n.support.exportCountLabel({
      hasJoinedProjection: hasJoinedProjection && projectionRings.length > 0,
      projectionEnabled,
      visibleLayerCount,
      visibleOutlineCount: visibleOutlineResults.length,
    });
  }, [
    hasJoinedProjection,
    i18n,
    projectionEnabled,
    projectionRings.length,
    visibleLayerCount,
    visibleOutlineResults.length,
  ]);
  const showStatusBanner = Boolean(errorMessage)
    || isPreparing
    || (isBusy && !projectionRings.length && !offsetRings.length && !visibleOutlineResults.length);
  const previewSvgText = useMemo(
    () => (activePreview === "svg"
      ? buildPreviewSvg({
        hoveredProjectionColor,
        hoveredProjectionRings,
        offsetRings,
        projectionLayers: projectionPreviewLayers,
        projectionRings,
        selectedProjectionColor,
        selectedProjectionRings,
        strokeWidth: settings.svgStrokeWidth,
        units: projectionResult?.units ?? settings.outputUnits,
      })
      : null),
    [
      activePreview,
      hoveredProjectionColor,
      hoveredProjectionRings,
      offsetRings,
      projectionPreviewLayers,
      projectionResult?.units,
      projectionRings,
      selectedProjectionColor,
      selectedProjectionRings,
      settings.outputUnits,
      settings.svgStrokeWidth,
    ],
  );
  const previewGeometryKey = useMemo(
    () =>
      JSON.stringify({
        meshId: mesh?.id ?? null,
        offsetBounds: offsetResult?.bounds ?? null,
        offsetCount: offsetRings.length,
        projectionBounds: projectionResult?.bounds ?? null,
        projectionCount: projectionRings.length,
        visibleEntries: visibleOutlineEntries.map((entry) => ({
          bounds: entry.result?.bounds ?? null,
          id: entry.id,
        })),
      }),
    [
      mesh?.id,
      offsetResult?.bounds,
      offsetRings.length,
      projectionResult?.bounds,
      projectionRings.length,
      visibleOutlineEntries,
    ],
  );
  const warningItems = useMemo(
    () =>
      [...new Set([
        ...outlineEntries.flatMap((entry) => entry.result?.warnings ?? []),
        ...(joinedProjectionResult?.warnings ?? []),
        ...(offsetResult?.warnings ?? []),
      ])],
    [joinedProjectionResult?.warnings, offsetResult?.warnings, outlineEntries],
  );
  const offsetUnits = projectionResult?.units ?? settings.outputUnits;
  const isPlaneCutMode = settings.projectionMode === "plane_cut";
  const isPlaneSelected = selectedSceneTarget === "plane";
  const selectedRotation = isPlaneSelected ? settings.planeRotationDegrees : settings.rotationDegrees;
  const selectedTranslation = isPlaneSelected ? settings.planeTranslation : settings.translation;
  const canExportProjection = projectionRings.length > 0;
  const canExportOffset = offsetRings.length > 0;
  const canExportSelection = exportSelection === "projection"
    ? canExportProjection
    : exportSelection === "offset"
      ? canExportOffset
      : canExportProjection && canExportOffset;
  const planeState = useMemo(
    () => (mesh && settings.projectionMode === "plane_cut"
      ? buildCanonicalPlaneState(mesh, settings, planeRevision)
      : null),
    [mesh, planeRevision, settings],
  );
  const planeAnchorLocal = useMemo(
    () => (mesh ? buildPlaneAnchorLocal(mesh, settings) : null),
    [mesh, settings.rotationDegrees, settings.rotationOrigin, settings.translation],
  );
  const projectionChangeKey = useMemo(
    () =>
      JSON.stringify({
        minArea: settings.minArea,
        outputUnits: settings.outputUnits,
        planeState,
        projectionMode: settings.projectionMode,
        rotationDegrees: settings.rotationDegrees,
        rotationOrigin: settings.rotationOrigin,
        simplifyTolerance: settings.simplifyTolerance,
        snapGrid: settings.snapGrid,
        sourceUnits: settings.sourceUnits,
        translation: settings.translation,
        unionBatchSize: settings.unionBatchSize,
      }),
    [
      settings.minArea,
      settings.outputUnits,
      planeState,
      settings.projectionMode,
      settings.rotationDegrees,
      settings.rotationOrigin,
      settings.simplifyTolerance,
      settings.snapGrid,
      settings.sourceUnits,
      settings.translation,
      settings.unionBatchSize,
    ],
  );

  const planeRevisionSignature = useMemo(
    () => (mesh
      ? JSON.stringify({
        meshId: mesh.id,
        planeRotationDegrees: settings.planeRotationDegrees,
        planeTranslation: settings.planeTranslation,
        rotationDegrees: settings.rotationDegrees,
        rotationOrigin: settings.rotationOrigin,
        translation: settings.translation,
      })
      : null),
    [
      mesh,
      settings.planeRotationDegrees,
      settings.planeTranslation,
      settings.rotationDegrees,
      settings.rotationOrigin,
      settings.translation,
    ],
  );

  useEffect(() => {
    meshRef.current = mesh;
  }, [mesh]);

  useEffect(() => {
    if (!planeRevisionSignature) {
      previousPlaneSignatureRef.current = null;
      setPlaneRevision(0);
      return;
    }

    if (previousPlaneSignatureRef.current === planeRevisionSignature) {
      return;
    }

    previousPlaneSignatureRef.current = planeRevisionSignature;
    setPlaneRevision((current) => current + 1);
  }, [planeRevisionSignature]);

  useEffect(() => {
    if (!canExportOffset && exportSelection !== "projection") {
      setExportSelection("projection");
    }
  }, [canExportOffset, exportSelection]);

  useEffect(() => {
    if (mesh && mesh.bodies.length <= 1 && joinOutlines) {
      setJoinOutlines(false);
    }
  }, [joinOutlines, mesh]);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = uiLanguage;
    }
  }, [uiLanguage]);

  useEffect(() => {
    let cancelled = false;
    const updateIdleStatus = (message: string) => {
      if (cancelled || meshRef.current || isProcessingRef.current) {
        return;
      }
      setStatusMessage(i18n.support.workerMessage(message));
    };

    void warmMeshWorker((message) => updateIdleStatus(message))
      .then(() => {
        updateIdleStatus(i18n.status.wasmReady);
      })
      .catch(() => {
        updateIdleStatus(i18n.status.wasmFailed);
      });

    return () => {
      cancelled = true;
    };
  }, [i18n]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    saveStoredStudioSettings(settings, isLiveProjectionEnabled, uiLanguage);
  }, [
    isLiveProjectionEnabled,
    settings.outputUnits,
    settings.sourceUnits,
    settings.svgStrokeWidth,
    uiLanguage,
  ]);

  useEffect(() => {
    showInnerOutlinesRef.current = showInnerOutlines;
  }, [showInnerOutlines]);

  useEffect(() => {
    const previous = previousSettingsRef.current;
    if (historyRef.current.suspend) {
      historyRef.current.suspend = false;
      previousSettingsRef.current = cloneSettings(settings);
      return;
    }

    if (!areSettingsEqual(previous, settings)) {
      historyRef.current.past.push(cloneSettings(previous));
      if (historyRef.current.past.length > 100) {
        historyRef.current.past.shift();
      }
      historyRef.current.future = [];
      previousSettingsRef.current = cloneSettings(settings);
    }
  }, [settings]);

  useEffect(() => {
    setSelectedSceneTarget(null);
  }, [mesh]);

  useEffect(() => {
    if (!hoveredMeshId) {
      return;
    }
    if (outlineEntries.some((entry) => entry.id === hoveredMeshId && entry.visible)) {
      return;
    }
    setHoveredMeshId(null);
    setHoverOrigin(null);
  }, [hoveredMeshId, outlineEntries]);

  useEffect(() => {
    if (!selectedMeshId) {
      return;
    }
    if (outlineEntries.some((entry) => entry.id === selectedMeshId)) {
      return;
    }
    setSelectedMeshId(null);
    setSelectionSource(null);
  }, [outlineEntries, selectedMeshId]);

  useLayoutEffect(() => {
    const meshId = pendingPreviewScrollMeshIdRef.current;
    if (!meshId || selectionSource !== "preview" || selectedMeshId !== meshId) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      if (scrollMeshRowIntoView(meshId)) {
        pendingPreviewScrollMeshIdRef.current = null;
      }
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [outlineEntries, selectedMeshId, selectionSource]);

  useEffect(() => {
    if (!editingMeshId) {
      return;
    }

    if (outlineEntries.some((entry) => entry.id === editingMeshId)) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
      return;
    }

    setEditingMeshId(null);
    setMeshNameDraft("");
  }, [editingMeshId, outlineEntries]);

  useEffect(() => {
    const pendingVisibilityDebug = pendingPreviewVisibilityDebugRef.current;
    if (!pendingVisibilityDebug) {
      return;
    }

    const entry = outlineEntries.find((candidate) => candidate.id === pendingVisibilityDebug.meshId) ?? null;
    pushPreviewDebugLog("preview-visibility-toggle-end", {
      meshId: pendingVisibilityDebug.meshId,
      selectedMeshIdAfter: selectedMeshId,
      selectedMeshIdBefore: pendingVisibilityDebug.selectedMeshIdBefore,
      source: pendingVisibilityDebug.source,
      visibleAfter: entry?.visible ?? null,
      visibleBefore: pendingVisibilityDebug.visibleBefore,
    });
    pendingPreviewVisibilityDebugRef.current = null;
  }, [outlineEntries, selectedMeshId]);

  useEffect(() => {
    if ((activePreview === "svg" && previewSvgText) || hoverOrigin !== "preview") {
      return;
    }

    setHoveredMeshId(null);
    setHoverOrigin(null);
  }, [activePreview, hoverOrigin, previewSvgText]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as EventTarget | null;
      if (
        target instanceof HTMLElement
        && (target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName))
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }

      if (key === "p" && mesh && !isBusy) {
        event.preventDefault();
        handleGenerateProjection();
        return;
      }

      if (key === "v" && selectedMeshId) {
        event.preventDefault();
        handleToggleOutlineVisibility(selectedMeshId, "keyboard");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isBusy, mesh, outlineEntries, selectedMeshId]);

  useEffect(() => {
    const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files");

    const handleWindowDragEnter = (event: DragEvent) => {
      if (!hasFiles(event)) {
        return;
      }
      event.preventDefault();
      dragDepthRef.current += 1;
      setIsDragActive(true);
    };

    const handleWindowDragOver = (event: DragEvent) => {
      if (!hasFiles(event)) {
        return;
      }
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
      }
      setIsDragActive(true);
    };

    const handleWindowDragLeave = (event: DragEvent) => {
      if (!hasFiles(event)) {
        return;
      }
      event.preventDefault();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) {
        setIsDragActive(false);
      }
    };

    const handleWindowDrop = (event: DragEvent) => {
      if (!hasFiles(event)) {
        return;
      }
      event.preventDefault();
      dragDepthRef.current = 0;
      setIsDragActive(false);
      void handleFileSelection(event.dataTransfer?.files?.[0] ?? null);
    };

    window.addEventListener("dragenter", handleWindowDragEnter);
    window.addEventListener("dragover", handleWindowDragOver);
    window.addEventListener("dragleave", handleWindowDragLeave);
    window.addEventListener("drop", handleWindowDrop);
    return () => {
      window.removeEventListener("dragenter", handleWindowDragEnter);
      window.removeEventListener("dragover", handleWindowDragOver);
      window.removeEventListener("dragleave", handleWindowDragLeave);
      window.removeEventListener("drop", handleWindowDrop);
    };
  }, []);

  useEffect(() => {
    if (!mesh || !projectionEnabled || !isLiveProjectionEnabled) {
      return;
    }

    if (skipNextAutoProjectionRef.current) {
      skipNextAutoProjectionRef.current = false;
      return;
    }

    const timeout = window.setTimeout(() => {
      queueProjection(i18n.status.projectionStart(settings.projectionMode, "update"));
    }, 220);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [isLiveProjectionEnabled, mesh, projectionChangeKey, projectionEnabled]);

  useEffect(() => {
    if (!projectionEnabled || !shouldJoinVisibleOutlines || !visibleOutlineRings.length) {
      setJoinedProjectionResult(null);
      setIsJoining(false);
      return;
    }

    const requestVersion = ++joinedRequestVersionRef.current;
    const timeout = window.setTimeout(() => {
      setIsJoining(true);
      setErrorMessage(null);
      if (!isProcessingRef.current) {
        setStatusMessage(i18n.status.joiningVisibleOutlines);
      }

      void unionProjectedRings(
        visibleOutlineRings,
        visibleOutlineResults[0]?.units ?? settings.outputUnits,
        (message) => {
          if (joinedRequestVersionRef.current === requestVersion && !isProcessingRef.current) {
            setStatusMessage(i18n.support.workerMessage(message));
          }
        },
      )
        .then((output) => {
          if (joinedRequestVersionRef.current !== requestVersion) {
            return;
          }
          setJoinedProjectionResult(output);
          if (!isProcessingRef.current) {
            setStatusMessage(i18n.status.joinedOutlineReady(i18n.support.timingSuffix(output.timings?.pipelineMs)));
          }
        })
        .catch((error) => {
          if (joinedRequestVersionRef.current !== requestVersion) {
            return;
          }
          const baseMessage = error instanceof Error
            ? i18n.support.workerMessage(error.message)
            : i18n.status.outlineUnionFailed;
          setErrorMessage(baseMessage);
          if (!isProcessingRef.current) {
            setStatusMessage(i18n.status.outlineUnionFailed);
          }
        })
        .finally(() => {
          if (joinedRequestVersionRef.current === requestVersion) {
            setIsJoining(false);
          }
        });
    }, 100);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [
    projectionEnabled,
    settings.outputUnits,
    shouldJoinVisibleOutlines,
    visibleOutlineResults,
    visibleOutlineRings,
  ]);

  useEffect(() => {
    if (!projectionEnabled || !projectionResult) {
      setOffsetResult(null);
      setIsOffsetting(false);
      return;
    }

    if (Math.abs(settings.offsetDistance) <= 0.0001) {
      setOffsetResult(null);
      setIsOffsetting(false);
      return;
    }

    const requestVersion = ++offsetRequestVersionRef.current;
    const timeout = window.setTimeout(() => {
      setIsOffsetting(true);
      setErrorMessage(null);
      if (!isProcessingRef.current && !isJoining) {
        setStatusMessage(i18n.status.offsettingOutline);
      }

      void offsetProjectedRings(
        projectionResult.rings,
        {
          joinStyle: settings.joinStyle,
          offsetDistance: settings.offsetDistance,
          units: projectionResult.units,
        },
        (message) => {
          if (
            offsetRequestVersionRef.current === requestVersion
            && !isProcessingRef.current
            && !isJoining
          ) {
            setStatusMessage(i18n.support.workerMessage(message));
          }
        },
      )
        .then((output) => {
          if (offsetRequestVersionRef.current !== requestVersion) {
            return;
          }
          setOffsetResult(output);
          if (!isProcessingRef.current && !isJoining) {
            setStatusMessage(i18n.status.offsetOutlineReady(i18n.support.timingSuffix(output.timings?.pipelineMs)));
          }
        })
        .catch((error) => {
          if (offsetRequestVersionRef.current !== requestVersion) {
            return;
          }
          const baseMessage = error instanceof Error
            ? i18n.support.workerMessage(error.message)
            : i18n.status.offsetFailed;
          setErrorMessage(baseMessage);
          if (!isProcessingRef.current && !isJoining) {
            setStatusMessage(i18n.status.offsetFailed);
          }
        })
        .finally(() => {
          if (offsetRequestVersionRef.current === requestVersion) {
            setIsOffsetting(false);
          }
        });
    }, 120);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [isJoining, projectionEnabled, projectionResult, settings.joinStyle, settings.offsetDistance]);

  async function handleFileSelection(file: File | null) {
    if (!file) {
      return;
    }

    completedProjectionSignatureRef.current = null;
    dragDepthRef.current = 0;
    historyRef.current = { future: [], past: [], suspend: false };
    joinedRequestVersionRef.current += 1;
    offsetRequestVersionRef.current += 1;
    previousSettingsRef.current = cloneSettings(settingsRef.current);
    queuedProjectionRef.current = null;
    setActivePreview("viewer");
    setErrorMessage(null);
    setExportSelection("projection");
    setFocusOutlineRequest(null);
    setFocusPreviewRequest(null);
    setIsDragActive(false);
    setIsJoining(false);
    setIsOffsetting(false);
    setJoinOutlines(false);
    setJoinedProjectionResult(null);
    setOffsetResult(null);
    setOutlineEntries([]);
    setHoveredMeshId(null);
    setHoverOrigin(null);
    setSelectedMeshId(null);
    setSelectionSource(null);
    setEditingMeshId(null);
    setMeshNameDraft("");
    setShowInnerOutlines(false);
    setProjectionEnabled(false);
    setIsPreparing(true);
    setStatusMessage(i18n.status.parsingMesh);

    try {
      const prepared = await prepareMeshFile(file);
      const initialTranslation = normalizeTranslationVector(
        dropMeshToBuildplate(prepared, {
          rotationDegrees: [...prepared.defaultRotationDegrees] as [number, number, number],
          rotationOrigin: [...prepared.centroid] as [number, number, number],
          translation: [0, 0, 0],
        }).translation,
      );
      const nextSettings = cloneSettings({
        ...DEFAULT_SETTINGS,
        outputUnits: settingsRef.current.outputUnits,
        rotationDegrees: [...prepared.defaultRotationDegrees] as [number, number, number],
        rotationOrigin: [...prepared.centroid] as [number, number, number],
        sourceUnits: settingsRef.current.sourceUnits,
        svgStrokeWidth: settingsRef.current.svgStrokeWidth,
        translation: initialTranslation,
      });
      historyRef.current = { future: [], past: [], suspend: true };
      previousSettingsRef.current = cloneSettings(nextSettings);
      settingsRef.current = cloneSettings(nextSettings);
      setSettings(nextSettings);
      setMesh(prepared);
      setOutlineEntries(createOutlineEntries(prepared.bodies));
      setStatusMessage(i18n.status.meshReadyOnPlate);
    } catch (error) {
      setMesh(null);
      setStatusMessage(i18n.status.idleUploadMesh);
      setErrorMessage(error instanceof Error ? i18n.support.workerMessage(error.message) : i18n.status.idleUploadMesh);
    } finally {
      setIsPreparing(false);
    }
  }

  function handleGenerateProjection() {
    if (!mesh) {
      return;
    }

    skipNextAutoProjectionRef.current = true;
    setProjectionEnabled(true);
    queueProjection(i18n.status.projectionStart(settings.projectionMode, "create"));
  }

  function updateSettings<Key extends keyof ProcessSettings>(
    key: Key,
    value: ProcessSettings[Key],
  ) {
    setSettings((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function setMeshRotationWithAutoDrop(
    updater: [number, number, number] | ((current: ProcessSettings) => [number, number, number]),
  ) {
    setSettings((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      const rotationDegrees = next.map(clampRotation) as [number, number, number];
      const translation = getGroundedMeshTranslation(
        meshRef.current,
        rotationDegrees,
        current.rotationOrigin,
        current.translation,
      );
      if (
        areNumberTriplesEqual(current.rotationDegrees, rotationDegrees)
        && areNumberTriplesEqual(current.translation, translation)
      ) {
        return current;
      }

      return {
        ...current,
        rotationDegrees,
        translation,
      };
    });
  }

  function updateRotation(index: 0 | 1 | 2, value: number) {
    setMeshRotationWithAutoDrop((current) => {
      const next = [...current.rotationDegrees] as [number, number, number];
      next[index] = clampRotation(value);
      return next;
    });
  }

  function nudgeRotation(index: 0 | 1 | 2, amount: number) {
    updateRotation(index, settings.rotationDegrees[index] + amount);
  }

  function handleViewerRotationChange(rotationDegrees: [number, number, number]) {
    setSettings((current) => {
      const next = rotationDegrees.map(clampRotation) as [number, number, number];
      if (current.rotationDegrees.every((value, index) => Math.abs(value - next[index]) < 0.001)) {
        return current;
      }

      return {
        ...current,
        rotationDegrees: next,
      };
    });
  }

  function handleViewerTranslationChange(translation: [number, number, number]) {
    setSettings((current) => {
      const next = translation.map(clampTranslation) as [number, number, number];
      if (current.translation.every((value, index) => Math.abs(value - next[index]) < 0.001)) {
        return current;
      }

      return {
        ...current,
        translation: next,
      };
    });
  }

  function handleViewerPlaneRotationChange(rotationDegrees: [number, number, number]) {
    setSettings((current) => {
      const next = rotationDegrees.map(clampRotation) as [number, number, number];
      if (current.planeRotationDegrees.every((value, index) => Math.abs(value - next[index]) < 0.001)) {
        return current;
      }

      return {
        ...current,
        planeRotationDegrees: next,
      };
    });
  }

  function handleViewerPlaneTranslationChange(translation: [number, number, number]) {
    setSettings((current) => {
      const next = translation.map(clampTranslation) as [number, number, number];
      if (current.planeTranslation.every((value, index) => Math.abs(value - next[index]) < 0.001)) {
        return current;
      }

      return {
        ...current,
        planeTranslation: next,
      };
    });
  }

  function handleResetOrientation() {
    setMeshRotationWithAutoDrop(
      meshRef.current?.defaultRotationDegrees ?? ([0, 0, 0] as [number, number, number]),
    );
  }

  function handleResetTranslation() {
    setSettings((current) => {
      const translation = getGroundedMeshTranslation(
        meshRef.current,
        current.rotationDegrees,
        current.rotationOrigin,
        [0, 0, 0],
      );
      if (areNumberTriplesEqual(current.translation, translation)) {
        return current;
      }

      return {
        ...current,
        translation,
      };
    });
  }

  function updatePlaneRotation(index: 0 | 1 | 2, value: number) {
    setSettings((current) => {
      const next = [...current.planeRotationDegrees] as [number, number, number];
      next[index] = clampRotation(value);
      return {
        ...current,
        planeRotationDegrees: next,
      };
    });
  }

  function updatePlaneTranslation(index: 0 | 1 | 2, value: number) {
    setSettings((current) => {
      const next = [...current.planeTranslation] as [number, number, number];
      next[index] = clampTranslation(value);
      return {
        ...current,
        planeTranslation: next,
      };
    });
  }

  function handleResetPlaneOrientation() {
    updateSettings("planeRotationDegrees", [0, 0, 0]);
  }

  function handleResetPlanePosition() {
    updateSettings("planeTranslation", [0, 0, 0]);
  }

  function updateSelectedRotation(index: 0 | 1 | 2, value: number) {
    if (selectedSceneTarget === "plane") {
      updatePlaneRotation(index, value);
      return;
    }
    updateRotation(index, value);
  }

  function updateSelectedTranslation(index: 0 | 1 | 2, value: number) {
    if (selectedSceneTarget === "plane") {
      updatePlaneTranslation(index, value);
      return;
    }

    const nextValue = clampTranslation(value);
    updateSettings("translation", [
      index === 0 ? nextValue : settings.translation[0],
      index === 1 ? nextValue : settings.translation[1],
      index === 2 ? nextValue : settings.translation[2],
    ]);
  }

  function handleResetSelectedRotation() {
    if (selectedSceneTarget === "plane") {
      handleResetPlaneOrientation();
      return;
    }
    handleResetOrientation();
  }

  function handleResetSelectedTranslation() {
    if (selectedSceneTarget === "plane") {
      handleResetPlanePosition();
      return;
    }
    handleResetTranslation();
  }

  function nudgeSelectedRotation(index: 0 | 1 | 2, amount: number) {
    if (selectedSceneTarget === "plane") {
      updatePlaneRotation(index, settings.planeRotationDegrees[index] + amount);
      return;
    }
    updateRotation(index, settings.rotationDegrees[index] + amount);
  }

  function setHoveredMeshFromOrigin(meshId: string | null, origin: "list" | "preview") {
    if (selectedMeshId && meshId !== selectedMeshId) {
      setHoveredMeshId(selectedMeshId);
      setHoverOrigin(origin);
      return;
    }

    setHoveredMeshId(meshId);
    setHoverOrigin(meshId ? origin : null);
  }

  function queuePreviewSelectionDebug(details: PreviewSelectionDetails) {
    pendingPreviewSelectionDebugRef.current = {
      clickedMeshId: details.clickedMeshId,
      clientX: details.clientX,
      clientY: details.clientY,
      hoveredMeshIdBefore: hoveredMeshId,
      selectedMeshIdBefore: selectedMeshId,
      selectionSourceBefore: selectionSource,
    };
    pushPreviewDebugLog("preview-click-start", {
      clickedMeshId: details.clickedMeshId,
      clientX: roundTo(details.clientX, 2),
      clientY: roundTo(details.clientY, 2),
      hoveredMeshIdBefore: hoveredMeshId,
      selectedMeshIdBefore: selectedMeshId,
      selectionSourceBefore: selectionSource,
    });
  }

  function handleToggleOutlineVisibility(meshId: string, source: "keyboard" | "ui" = "ui") {
    const targetEntry = outlineEntries.find((entry) => entry.id === meshId) ?? null;
    pendingPreviewVisibilityDebugRef.current = {
      meshId,
      selectedMeshIdBefore: selectedMeshId,
      source,
      visibleBefore: targetEntry?.visible ?? null,
    };
    pushPreviewDebugLog("preview-visibility-toggle-start", {
      meshId,
      selectedMeshIdBefore: selectedMeshId,
      source,
      visibleBefore: targetEntry?.visible ?? null,
    });
    setOutlineEntries((current) =>
      current.map((entry) =>
        entry.id === meshId
          ? {
            ...entry,
            visible: !entry.visible,
          }
          : entry));
  }

  function buildFocusRequest(rings: RingSet2D[]): FocusOutlineRequest {
    return {
      nonce: Date.now() + Math.random(),
      rings,
    };
  }

  function syncOutlineFocusRequests(rings: RingSet2D[]) {
    const request = buildFocusRequest(rings);
    setFocusPreviewRequest(request);
    setFocusOutlineRequest(request);
  }

  function scrollMeshRowIntoView(meshId: string): boolean {
    const rowEl = meshRowRefs.current.get(meshId);
    const railEl = workspaceRailRef.current;
    const pendingDebug = pendingPreviewSelectionDebugRef.current;
    const railRect = railEl?.getBoundingClientRect() ?? null;
    const rowRect = rowEl?.getBoundingClientRect() ?? null;
    const isRailScrollable = Boolean(railEl && railEl.scrollHeight > railEl.clientHeight + 1);
    const railScrollTopBefore = railEl ? roundTo(railEl.scrollTop, 3) : null;
    const debugBase = pendingDebug
      ? {
        clickedMeshId: pendingDebug.clickedMeshId,
        clientX: roundTo(pendingDebug.clientX, 2),
        clientY: roundTo(pendingDebug.clientY, 2),
        containerRect: serializeRect(railRect),
        hoveredMeshIdAfter: hoveredMeshId,
        hoveredMeshIdBefore: pendingDebug.hoveredMeshIdBefore,
        rowRect: serializeRect(rowRect),
        scrollContainer: describeScrollContainer(railEl),
        scrollableContainer: isRailScrollable,
        selectedMeshIdAfter: selectedMeshId,
        selectedMeshIdBefore: pendingDebug.selectedMeshIdBefore,
        selectedRowRefExists: Boolean(rowEl),
        selectionSourceAfter: selectionSource,
        selectionSourceBefore: pendingDebug.selectionSourceBefore,
      }
      : null;

    if (!rowEl) {
      if (debugBase) {
        pushPreviewDebugLog("preview-click-scroll-missing-row", {
          ...debugBase,
          containerScrollTopAfter: railScrollTopBefore,
          containerScrollTopBefore: railScrollTopBefore,
        });
        pendingPreviewSelectionDebugRef.current = null;
      }
      return false;
    }

    if (railEl && isRailScrollable && rowRect && railRect) {
      const desiredTop = railEl.scrollTop
        + (rowRect.top - railRect.top)
        - ((railRect.height - rowRect.height) / 2);
      const maxTop = Math.max(0, railEl.scrollHeight - railEl.clientHeight);
      const top = Math.max(0, Math.min(maxTop, desiredTop));

      if (debugBase) {
        pushPreviewDebugLog("preview-click-scroll-start", {
          ...debugBase,
          containerScrollTopBefore: railScrollTopBefore,
          scrollTargetTop: roundTo(top, 3),
        });
      }

      if (typeof railEl.scroll === "function") {
        railEl.scroll({
          behavior: "smooth",
          top,
        });
      } else {
        railEl.scrollTop = top;
      }

      if (debugBase) {
        window.setTimeout(() => {
          pushPreviewDebugLog("preview-click-scroll-end", {
            ...debugBase,
            containerScrollTopAfter: roundTo(railEl.scrollTop, 3),
            containerScrollTopBefore: railScrollTopBefore,
            scrollTargetTop: roundTo(top, 3),
          });
        }, 420);
        pendingPreviewSelectionDebugRef.current = null;
      }

      return true;
    }

    rowEl.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "nearest",
    });

    if (debugBase) {
      window.setTimeout(() => {
        pushPreviewDebugLog("preview-click-scroll-fallback", {
          ...debugBase,
          containerScrollTopAfter: railEl ? roundTo(railEl.scrollTop, 3) : null,
          containerScrollTopBefore: railScrollTopBefore,
        });
      }, 420);
      pendingPreviewSelectionDebugRef.current = null;
    }

    return true;
  }

  function getDisplayOutlineRings(entry: OutlineEntry): RingSet2D[] {
    if (!entry.result) {
      return EMPTY_RINGS;
    }

    return applyOutlineViewMode(
      entry.result,
      settingsRef.current.keepMode,
      showInnerOutlinesRef.current,
    ).rings;
  }

  function handleFocusOutline(entry: OutlineEntry) {
    const displayRings = getDisplayOutlineRings(entry);
    if (!displayRings.length) {
      return;
    }

    setHoveredMeshFromOrigin(entry.id, "list");
    setSelectedMeshId(entry.id);
    setSelectionSource("list");
    syncOutlineFocusRequests(displayRings);
    if (activePreview === "svg") {
      return;
    }

    setActivePreview("top");
  }

  function handleSelectMesh(meshId: string | null, details?: PreviewSelectionDetails) {
    if (details) {
      queuePreviewSelectionDebug(details);
    }

    if (meshId && meshId === selectedMeshId && selectionSource === "preview") {
      window.requestAnimationFrame(() => {
        scrollMeshRowIntoView(meshId);
      });
    }

    setSelectedMeshId(meshId);

    if (!meshId) {
      pendingPreviewScrollMeshIdRef.current = null;
      setSelectionSource(null);
      setHoveredMeshId(null);
      setHoverOrigin(null);
      if (pendingPreviewSelectionDebugRef.current) {
        pushPreviewDebugLog("preview-click-cleared-selection", {
          clickedMeshId: pendingPreviewSelectionDebugRef.current.clickedMeshId,
          clientX: roundTo(pendingPreviewSelectionDebugRef.current.clientX, 2),
          clientY: roundTo(pendingPreviewSelectionDebugRef.current.clientY, 2),
          containerRect: serializeRect(workspaceRailRef.current?.getBoundingClientRect() ?? null),
          hoveredMeshIdAfter: null,
          hoveredMeshIdBefore: pendingPreviewSelectionDebugRef.current.hoveredMeshIdBefore,
          rowRect: null,
          scrollContainer: describeScrollContainer(workspaceRailRef.current),
          scrollableContainer: Boolean(
            workspaceRailRef.current
            && workspaceRailRef.current.scrollHeight > workspaceRailRef.current.clientHeight + 1
          ),
          selectedMeshIdAfter: null,
          selectedMeshIdBefore: pendingPreviewSelectionDebugRef.current.selectedMeshIdBefore,
          selectedRowRefExists: false,
          selectionSourceAfter: null,
          selectionSourceBefore: pendingPreviewSelectionDebugRef.current.selectionSourceBefore,
        });
        pendingPreviewSelectionDebugRef.current = null;
      }
      return;
    }

    pendingPreviewScrollMeshIdRef.current = meshId;
    setSelectionSource("preview");
    setHoveredMeshId(meshId);
    setHoverOrigin("preview");

    const entry = outlineEntries.find((candidate) =>
      candidate.id === meshId && candidate.visible && candidate.result);
    if (!entry) {
      return;
    }

    const displayRings = getDisplayOutlineRings(entry);
    if (!displayRings.length) {
      return;
    }

    syncOutlineFocusRequests(displayRings);
  }

  function handleStartRenaming(entry: OutlineEntry) {
    setEditingMeshId(entry.id);
    setMeshNameDraft(entry.displayName);
  }

  function handleCommitRename(meshId: string) {
    setOutlineEntries((current) =>
      current.map((entry) =>
        entry.id === meshId
          ? {
            ...entry,
            displayName: meshNameDraft.trim() || entry.originalName,
          }
          : entry));
    setEditingMeshId(null);
    setMeshNameDraft("");
  }

  function handleCancelRename() {
    setEditingMeshId(null);
    setMeshNameDraft("");
  }

  function queueProjection(reason: string) {
    const currentMesh = meshRef.current;
    if (!currentMesh) {
      return;
    }

    queuedProjectionRef.current = {
      reason,
      signature: projectionSignature(currentMesh, settingsRef.current, planeState),
    };
    void flushProjectionQueue();
  }

  async function flushProjectionQueue() {
    if (isProcessingRef.current) {
      return;
    }

    while (queuedProjectionRef.current) {
      const nextRequest = queuedProjectionRef.current;
      queuedProjectionRef.current = null;

      const currentMesh = meshRef.current;
      if (!currentMesh) {
        return;
      }

      if (completedProjectionSignatureRef.current === nextRequest.signature) {
        continue;
      }

      isProcessingRef.current = true;
      joinedRequestVersionRef.current += 1;
      offsetRequestVersionRef.current += 1;
      setErrorMessage(null);
      setIsJoining(false);
      setIsOffsetting(false);
      setIsProcessing(true);
      setStatusMessage(nextRequest.reason);
      const currentSettings = {
        ...settingsRef.current,
        direction: TOP_DOWN_DIRECTION,
        keepMode: "all" as const,
        offsetDistance: 0,
        offsetStage: "post_scale" as const,
        scale: 1,
      };
      const currentPlaneState = currentSettings.projectionMode === "plane_cut"
        ? buildCanonicalPlaneState(currentMesh, currentSettings, planeRevision)
        : null;

      try {
        const nextEntries = createOutlineEntries(currentMesh.bodies);

        for (const [index, body] of currentMesh.bodies.entries()) {
          const output = await processMeshFile(body, currentSettings, currentPlaneState, (message) => {
            setStatusMessage(
              currentMesh.bodies.length > 1
                ? `${i18n.support.workerMessage(message)} (${index + 1}/${currentMesh.bodies.length})`
                : i18n.support.workerMessage(message),
            );
          });

          nextEntries[index] = {
            ...nextEntries[index],
            result: output,
          };
        }

        if (
          meshRef.current
          && nextRequest.signature === projectionSignature(
            meshRef.current,
            settingsRef.current,
            currentPlaneState,
          )
        ) {
          setOutlineEntries((current) => {
            return mergeOutlineEntries(nextEntries, current);
          });
          completedProjectionSignatureRef.current = nextRequest.signature;
          setStatusMessage(
            currentMesh.bodies.length > 1
              ? i18n.status.projectionReady(currentSettings.projectionMode, currentMesh.bodies.length, "")
              : i18n.status.projectionReady(
                currentSettings.projectionMode,
                1,
                i18n.support.timingSuffix(nextEntries[0]?.result?.timings?.pipelineMs),
              ),
          );
        }
      } catch (error) {
        completedProjectionSignatureRef.current = null;
        const baseMessage = error instanceof Error
          ? i18n.support.workerMessage(error.message)
          : i18n.status.projectionFailed;
        setErrorMessage(baseMessage);
        setStatusMessage(i18n.status.projectionFailed);
      } finally {
        isProcessingRef.current = false;
        setIsProcessing(false);
      }
    }
  }

  function undoSettings() {
    const previous = historyRef.current.past.pop();
    if (!previous) {
      return;
    }

    historyRef.current.future.push(cloneSettings(settingsRef.current));
    historyRef.current.suspend = true;
    previousSettingsRef.current = cloneSettings(previous);
    setSettings(cloneSettings(previous));
  }

  function redoSettings() {
    const next = historyRef.current.future.pop();
    if (!next) {
      return;
    }

    historyRef.current.past.push(cloneSettings(settingsRef.current));
    historyRef.current.suspend = true;
    previousSettingsRef.current = cloneSettings(next);
    setSettings(cloneSettings(next));
  }

  return (
    <main class="app-shell">
      {isDragActive ? (
        <div aria-hidden="true" class="screen-drop-overlay">
          <div class="screen-drop-card">
            <strong>{i18n.dropMeshOverlayTitle}</strong>
            <span>{i18n.dropMeshOverlayCopy}</span>
          </div>
        </div>
      ) : null}

      <header class="compact-header">
        <h1 class="compact-title">{i18n.appTitle}</h1>
        <ViewerSettingsButton
          buttonAriaLabel={i18n.studioSettingsAriaLabel}
          buttonClassName="header-icon-button"
          buttonTitle={i18n.studioSettingsTitle}
          className="header-actions"
          copy={ui.viewerSettingsCopy}
          note={i18n.settingsNote}
          onSettingsChange={setViewerSettings}
          popoverKicker={i18n.studioSettingsKicker}
          popoverTitle={i18n.studioSettingsTitle}
          settings={viewerSettings}
        >
          <Field>
            <FieldLabel title={i18n.languageTitle}>{i18n.languageLabel}</FieldLabel>
            <SelectField
              onChange={(value) => setUiLanguage(resolveUiLanguage(value))}
              options={i18n.languageOptions}
              title={i18n.languageTitle}
              value={uiLanguage}
            />
          </Field>
          <label
            class="toggle-card"
            title={ui.liveProjectionTitle}
          >
            <input
              checked={isLiveProjectionEnabled}
              onChange={(event) =>
                setIsLiveProjectionEnabled((event.currentTarget as HTMLInputElement).checked)}
              type="checkbox"
            />
            <div>
              <span class="toggle-label">{ui.liveProjectionLabel}</span>
            </div>
          </label>
          <Field>
            <FieldLabel title={ui.meshUnitsTitle}>
              {ui.meshUnitsLabel}
            </FieldLabel>
            <SelectField
              onChange={(value) => updateSettings("sourceUnits", value || null)}
              options={unitOptions}
              title={ui.meshUnitsSelectTitle}
              value={settings.sourceUnits ?? ""}
            />
          </Field>
          <Field>
            <FieldLabel title={ui.outputUnitsTitle}>
              {ui.outputUnitsLabel}
            </FieldLabel>
            <SelectField
              onChange={(value) => updateSettings("outputUnits", value)}
              options={outputUnitOptions}
              title={ui.outputUnitsSelectTitle}
              value={settings.outputUnits}
            />
          </Field>
          <button
            class="secondary-button settings-reset-button"
            onClick={() => {
              clearStoredStudioSettings();
              setIsLiveProjectionEnabled(DEFAULT_LIVE_PROJECTION_ENABLED);
              setUiLanguage(DEFAULT_UI_LANGUAGE);
              resetViewerSettings();
              setSettings((current) => ({
                ...current,
                outputUnits: DEFAULT_SETTINGS.outputUnits,
                sourceUnits: DEFAULT_SETTINGS.sourceUnits,
                svgStrokeWidth: DEFAULT_SETTINGS.svgStrokeWidth,
              }));
            }}
            type="button"
          >
            {i18n.settingsResetButton}
          </button>
        </ViewerSettingsButton>
      </header>

      <input
        accept={MESH_ACCEPT}
        class="sr-only"
        onChange={(event) => {
          const input = event.currentTarget as HTMLInputElement;
          void handleFileSelection(input.files?.[0] ?? null);
          input.value = "";
        }}
        ref={fileInputRef}
        type="file"
      />

      <section class="workspace-grid">
        <article class="studio-panel preview-panel">
          <div class="preview-toolbar">
            <div class="preview-tabs" role="tablist">
              <button
                aria-selected={activePreview === "viewer"}
                class={`preview-tab ${activePreview === "viewer" ? "is-active" : ""}`}
                onClick={() => setActivePreview("viewer")}
                role="tab"
                title={i18n.fitTitles.preview3dTitle}
                type="button"
              >
                <span class="button-content">
                  <UiIcon name="cube" />
                  {i18n.fitTitles.preview3d}
                </span>
              </button>
              <button
                aria-selected={activePreview === "top"}
                class={`preview-tab ${activePreview === "top" ? "is-active" : ""}`}
                onClick={() => setActivePreview("top")}
                role="tab"
                title={i18n.fitTitles.previewTopTitle}
                type="button"
              >
                <span class="button-content">
                  <UiIcon name="top" />
                  {i18n.fitTitles.previewTop}
                </span>
              </button>
              <button
                aria-selected={activePreview === "svg"}
                class={`preview-tab ${activePreview === "svg" ? "is-active" : ""}`}
                disabled={(!projectionRings.length && !offsetRings.length) && !isProcessing}
                onClick={() => setActivePreview("svg")}
                role="tab"
                title={i18n.fitTitles.preview2dTitle}
                type="button"
              >
                <span class="button-content">
                  <UiIcon name="outline" />
                  {i18n.fitTitles.preview2d}
                </span>
              </button>
            </div>
            <span class="panel-chip preview-mesh-chip" title={mesh ? mesh.fileName : i18n.fitTitles.noMeshLoaded}>
              {mesh ? mesh.fileName : i18n.fitTitles.noMeshLoaded}
            </span>
          </div>

          <div class="preview-stage">
            {activePreview === "svg" ? (
              <OutputPreview
                copy={i18n.outputPreviewCopy}
                focusRequest={focusPreviewRequest}
                geometryKey={previewGeometryKey}
                hoveredMeshId={hoveredMeshId}
                isBusy={isBusy}
                onHoverMeshChange={(meshId) => setHoveredMeshFromOrigin(meshId, "preview")}
                onSelectMesh={handleSelectMesh}
                selectedMeshId={selectedMeshId}
                statusMessage={statusMessage}
                svgText={previewSvgText}
                viewportResetKey={mesh?.id ?? "empty"}
              />
            ) : (
              <MeshWorkspaceViewer
                cameraMode={activePreview === "top" ? "top" : "perspective"}
                copy={ui.viewerCopy}
                focusOutlineRequest={focusOutlineRequest}
                highlightedProjectionRings={highlightedProjectionRings}
                isPreparing={isPreparing}
                planeAnchorLocal={planeAnchorLocal}
                planeCutEnabled={isPlaneCutMode}
                planeState={planeState}
                mesh={mesh}
                offsetRings={offsetRings}
                onBrowseRequest={() => fileInputRef.current?.click()}
                onResetOrientation={handleResetOrientation}
                onResetPlaneOrientation={handleResetPlaneOrientation}
                onPlaneRotationChange={handleViewerPlaneRotationChange}
                onPlaneTranslationChange={handleViewerPlaneTranslationChange}
                onRotationChange={handleViewerRotationChange}
                onSelectionChange={setSelectedSceneTarget}
                onSettingsChange={setViewerSettings}
                onTranslationChange={handleViewerTranslationChange}
                projectionLayers={projectionPreviewLayers}
                rotationDegrees={settings.rotationDegrees}
                settings={viewerSettings}
                translation={settings.translation}
              />
            )}
          </div>

          <section class="loader-banner preview-loader" data-visible={showStatusBanner}>
            <div class="loader-copy">
              <strong>{i18n.loaderHeading({ hasError: Boolean(errorMessage), isBusy })}</strong>
              <span>{errorMessage ?? statusMessage}</span>
            </div>
            {isBusy ? <span aria-hidden="true" class="loader-spinner" /> : null}
          </section>

          <div class="export-card preview-export-card">
            <div class="export-card-header">
              <div>
                <p class="panel-kicker">{i18n.exportKicker}</p>
                <p class="compact-panel-note">{exportCountLabel}</p>
              </div>
            </div>
            <div class="download-group">
              <div class="segmented-control export-segmented-control" role="tablist">
                <button
                  aria-selected={exportSelection === "projection"}
                  class={`segment-button ${exportSelection === "projection" ? "is-active" : ""}`}
                  onClick={() => setExportSelection("projection")}
                  title={ui.exportProjectionTitle}
                  type="button"
                >
                  {ui.exportProjection}
                </button>
                <button
                  aria-selected={exportSelection === "offset"}
                  class={`segment-button ${exportSelection === "offset" ? "is-active" : ""}`}
                  disabled={!canExportOffset}
                  onClick={() => setExportSelection("offset")}
                  title={ui.exportOffsetTitle}
                  type="button"
                >
                  {ui.exportOffset}
                </button>
                <button
                  aria-selected={exportSelection === "both"}
                  class={`segment-button ${exportSelection === "both" ? "is-active" : ""}`}
                  disabled={!canExportOffset}
                  onClick={() => setExportSelection("both")}
                  title={ui.exportBothTitle}
                  type="button"
                >
                  {ui.exportBoth}
                </button>
              </div>

              <div class="download-button-row compact-download-buttons">
                <button
                  class="secondary-button"
                  disabled={!canExportSelection}
                  onClick={() => {
                    const svgText = buildExportSvg({
                      offsetRings,
                      projectionRings,
                      selection: exportSelection,
                      strokeWidth: settings.svgStrokeWidth,
                      units: projectionResult?.units ?? settings.outputUnits,
                    });
                    if (svgText) {
                      downloadTextFile(`${exportStem}.svg`, svgText, "image/svg+xml");
                    }
                  }}
                  title={ui.exportSvgTitle}
                  type="button"
                >
                  <span class="button-content">
                    <UiIcon name="svg" />
                    {ui.exportSvg}
                  </span>
                </button>
                <button
                  class="secondary-button"
                  disabled={!canExportSelection}
                  onClick={() => {
                    if (canExportSelection) {
                      downloadTextFile(
                        `${exportStem}.dxf`,
                        buildExportDxf({
                          offsetRings,
                          projectionRings,
                          selection: exportSelection,
                          units: projectionResult?.units ?? settings.outputUnits,
                        }),
                        "application/dxf",
                      );
                    }
                  }}
                  title={ui.exportDxfTitle}
                  type="button"
                >
                  <span class="button-content">
                    <UiIcon name="dxf" />
                    {ui.exportDxf}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {warningItems.length ? (
            <div class="warning-list">
              {warningItems.map((warning) => (
                <p class="warning-item" key={warning}>
                  {warning}
                </p>
              ))}
            </div>
          ) : null}
        </article>

        <div class="workspace-rail" ref={workspaceRailRef}>
          <details class="studio-panel collapsible-panel" open>
            <summary class="panel-summary">
              <div class="panel-head">
                <div>
                  <p class="panel-kicker">{ui.outlineKicker}</p>
                  <h2 class="panel-title">{ui.outlinePanelTitle}</h2>
                </div>
                {mesh ? (
                  <span
                    class="panel-chip"
                    title={`${mesh.fileType.toUpperCase()} · ${formatFileSize(mesh.arrayBuffer.byteLength)}`}
                  >
                    {mesh.fileType.toUpperCase()} · {formatFileSize(mesh.arrayBuffer.byteLength)}
                  </span>
                ) : null}
              </div>
            </summary>

            <div class="panel-content">
              <div class="projection-actions-stack">
                <button
                  class="primary-button full-width-button"
                  disabled={!mesh || isBusy}
                  onClick={handleGenerateProjection}
                  title={i18n.projectionActionButtonTitle(isPlaneCutMode)}
                  type="button"
                >
                  {i18n.projectionActionButtonLabel({
                    isPlaneCutMode,
                    isProcessing,
                    projectionEnabled,
                  })}
                </button>

                <div class="segmented-control mode-segmented-control" role="tablist">
                  <button
                    aria-selected={!isPlaneCutMode}
                    class={`segment-button ${!isPlaneCutMode ? "is-active" : ""}`}
                    onClick={() => updateSettings("projectionMode", "silhouette")}
                    title={ui.shadowOutlineTitle}
                    type="button"
                  >
                    {ui.shadowOutlineButton}
                  </button>
                  <button
                    aria-selected={isPlaneCutMode}
                    class={`segment-button ${isPlaneCutMode ? "is-active" : ""}`}
                    onClick={() => updateSettings("projectionMode", "plane_cut")}
                    title={ui.planeCutTitle}
                    type="button"
                  >
                    {ui.planeCutButton}
                  </button>
                </div>

                {(hasAnyInnerOutlines || (mesh && mesh.bodies.length > 1)) ? (
                  <div class="outline-option-grid">
                    {hasAnyInnerOutlines ? (
                      <label
                        class="toggle-card compact-toggle-card outline-option-toggle"
                        title={ui.showInnerOutlinesTitle}
                      >
                        <input
                          checked={showInnerOutlines}
                          onChange={(event) =>
                            setShowInnerOutlines((event.currentTarget as HTMLInputElement).checked)}
                          type="checkbox"
                        />
                        <div class="toggle-label-row">
                          <UiIcon name="outline" />
                          <span class="toggle-label">{ui.showInnerOutlinesLabel}</span>
                        </div>
                      </label>
                    ) : null}

                    {mesh && mesh.bodies.length > 1 ? (
                      <label class="toggle-card compact-toggle-card outline-option-toggle" title={ui.joinOutlinesTitle}>
                        <input
                          checked={joinOutlines}
                          onChange={(event) => setJoinOutlines((event.currentTarget as HTMLInputElement).checked)}
                          type="checkbox"
                        />
                        <div class="toggle-label-row">
                          <UiIcon name="merge" />
                          <span class="toggle-label">{ui.joinOutlinesLabel}</span>
                        </div>
                      </label>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {mesh ? (
                <div class="metric-grid compact-metric-grid rail-metric-grid">
                  <MetricCard icon="file" label={ui.meshMetricsFile} value={mesh.fileName} />
                  <MetricCard icon="layers" label={ui.meshMetricsMeshes} value={String(mesh.meshCount)} />
                  <MetricCard icon="box" label={ui.meshMetricsBoundingBox} value={formatExtents(mesh.extents)} />
                </div>
              ) : null}

              {errorMessage ? <p class="error-banner">{errorMessage}</p> : null}

              <div class="grid gap-3 sm:grid-cols-2 control-grid-top">
                <Field>
                  <FieldLabel title={ui.offsetFieldTitle(offsetUnits)}>
                    {ui.offsetFieldLabel(offsetUnits)}
                  </FieldLabel>
                  <NumberField
                    onInput={(value) => updateSettings("offsetDistance", value)}
                    step={1}
                    title={ui.offsetFieldTitle(offsetUnits)}
                    value={settings.offsetDistance}
                  />
                </Field>
                <Field>
                  <FieldLabel title={ui.offsetJoinTitle}>{ui.offsetJoinLabel}</FieldLabel>
                  <SelectField
                    onChange={(value) => updateSettings("joinStyle", value as ProcessSettings["joinStyle"])}
                    options={joinStyleOptions}
                    title={ui.offsetJoinSelectTitle}
                    value={settings.joinStyle}
                  />
                </Field>
                <Field>
                  <FieldLabel title={ui.sourceUnitsTitle}>
                    {ui.sourceUnitsLabel}
                  </FieldLabel>
                  <SelectField
                    onChange={(value) => updateSettings("sourceUnits", value || null)}
                    options={unitOptions}
                    title={ui.sourceUnitsTitle}
                    value={settings.sourceUnits ?? ""}
                  />
                </Field>
                <Field>
                  <FieldLabel title={ui.outputUnitsTitle}>
                    {ui.outputUnitsLabel}
                  </FieldLabel>
                  <SelectField
                    onChange={(value) => updateSettings("outputUnits", value)}
                    options={outputUnitOptions}
                    title={ui.outputUnitsTitle}
                    value={settings.outputUnits}
                  />
                </Field>
              </div>
            </div>
          </details>

          <details class="studio-panel collapsible-panel" open={false}>
            <summary class="panel-summary">
              <div class="panel-head panel-head-with-action">
                <div>
                  <p class="panel-kicker">{ui.transformKicker}</p>
                  <h2 class="panel-title">{ui.transformPanelTitle}</h2>
                </div>
                <span
                  class="panel-chip"
                  title={i18n.selectedObjectChipTitle(selectedSceneTarget, isPlaneCutMode, Boolean(mesh))}
                >
                  {i18n.selectedObjectChipLabel(selectedSceneTarget, Boolean(mesh))}
                </span>
              </div>
            </summary>

            <div class="panel-content">
              {selectedSceneTarget ? (
                <div class="pose-tools-stack">
                  <div class="transform-panel-header">
                    <span class="transform-target-pill">
                      <UiIcon name={selectedSceneTarget === "plane" ? "outline" : "cube"} />
                      {selectedSceneTarget === "plane" ? ui.transformCutPlane : ui.transformMesh}
                    </span>
                  </div>

                  <div class="transform-axis-grid">
                    <div class="transform-axis-grid-head">{ui.transformAxisHeader}</div>
                    <div class="transform-axis-grid-head">{ui.transformRotateHeader}</div>
                    <div class="transform-axis-grid-head">{ui.transformMoveHeader(offsetUnits)}</div>

                    {(["X", "Y", "Z"] as const).map((axis, index) => (
                      <TransformAxisRow
                        axis={axis}
                        key={axis}
                        moveTitle={ui.transformMoveTitle(axis, selectedSceneTarget, offsetUnits)}
                        onMoveInput={(value) => updateSelectedTranslation(index as 0 | 1 | 2, value)}
                        onRotateInput={(value) => updateSelectedRotation(index as 0 | 1 | 2, value)}
                        rotateTitle={ui.transformRotateTitle(axis)}
                        rotationValue={selectedRotation[index]}
                        translationValue={selectedTranslation[index]}
                      />
                    ))}
                  </div>

                  <div class="quick-rotate-row compact-action-row">
                    <button
                      class="secondary-button"
                      onClick={handleResetSelectedRotation}
                      title={selectedSceneTarget === "plane"
                        ? ui.resetPlaneTitle
                        : ui.resetRotationTitle}
                      type="button"
                    >
                      {selectedSceneTarget === "plane" ? ui.resetPlaneButton : ui.resetRotationButton}
                    </button>
                    <button
                      class="secondary-button"
                      onClick={handleResetSelectedTranslation}
                      title={selectedSceneTarget === "plane"
                        ? ui.resetPlaneOffsetTitle
                        : ui.resetPositionTitle}
                      type="button"
                    >
                      {selectedSceneTarget === "plane" ? ui.resetPlaneOffsetButton : ui.resetPositionButton}
                    </button>
                    <button
                      class="secondary-button"
                      onClick={() => nudgeSelectedRotation(0, 90)}
                      title={`${ui.transformRotateTitle("X")} +90`}
                      type="button"
                    >
                      X +90
                    </button>
                    <button
                      class="secondary-button"
                      onClick={() => nudgeSelectedRotation(1, 90)}
                      title={`${ui.transformRotateTitle("Y")} +90`}
                      type="button"
                    >
                      Y +90
                    </button>
                    <button
                      class="secondary-button"
                      onClick={() => nudgeSelectedRotation(2, 90)}
                      title={`${ui.transformRotateTitle("Z")} +90`}
                      type="button"
                    >
                      Z +90
                    </button>
                  </div>
                </div>
              ) : (
                <p class="compact-panel-note">
                  {ui.selectionHint(Boolean(mesh), isPlaneCutMode)}
                </p>
              )}
            </div>
          </details>

          <details class="studio-panel collapsible-panel" open={Boolean(outlineEntries.length)}>
            <summary class="panel-summary">
              <div class="panel-head">
                <div>
                  <p class="panel-kicker">{ui.meshesKicker}</p>
                  <h2 class="panel-title">{ui.meshesTitle}</h2>
                </div>
              </div>
            </summary>

            <div class="panel-content">
              <div class="layers-panel">
                <Field>
                  <FieldLabel title={ui.strokeTitle}>
                    {ui.strokeLabel}
                  </FieldLabel>
                  <StrokeSizeInput
                    ariaLabel={ui.strokeInputAriaLabel}
                    onCommit={(value) => updateSettings("svgStrokeWidth", value)}
                    step={0.05}
                    title={ui.strokeTitle}
                    value={settings.svgStrokeWidth}
                  />
                </Field>
                {outlineEntries.length ? (
                  <>
                    <label class="toggle-card layers-color-toggle" title={ui.randomizeColorsTitle}>
                      <input
                        checked={useRandomOutlineColors}
                        onChange={(event) =>
                          setUseRandomOutlineColors((event.currentTarget as HTMLInputElement).checked)}
                        type="checkbox"
                      />
                      <div>
                        <span class="toggle-label">{ui.randomizeColorsLabel}</span>
                      </div>
                    </label>
                    {outlineEntries.map((entry) => {
                      const isEditing = editingMeshId === entry.id;
                      const hasCustomName = entry.displayName !== entry.originalName;
                      const rowColor = outlineColors.get(entry.id) ?? DEFAULT_OUTLINE_COLOR;
                      return (
                        <div
                          class={`layer-row ${selectedMeshId === entry.id ? "is-selected" : ""} ${hoveredMeshId === entry.id ? "is-hovered" : ""}`}
                          key={entry.id}
                          onBlur={(event) => {
                            const nextTarget = event.relatedTarget as Node | null;
                            if (nextTarget && event.currentTarget.contains(nextTarget)) {
                              return;
                            }
                            setHoveredMeshFromOrigin(null, "list");
                          }}
                          onClick={() => handleFocusOutline(entry)}
                          onFocus={() => setHoveredMeshFromOrigin(entry.id, "list")}
                          onKeyDown={(event) => {
                            if (isEditing) {
                              return;
                            }
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              handleFocusOutline(entry);
                            }
                          }}
                          onMouseEnter={() => setHoveredMeshFromOrigin(entry.id, "list")}
                          onMouseLeave={() => setHoveredMeshFromOrigin(null, "list")}
                          ref={(node) => {
                            if (node) {
                              meshRowRefs.current.set(entry.id, node);
                              return;
                            }
                            meshRowRefs.current.delete(entry.id);
                          }}
                          role="button"
                          tabIndex={isEditing ? -1 : 0}
                        >
                          <input
                            checked={entry.visible}
                            onClick={(event) => event.stopPropagation()}
                            onChange={() => handleToggleOutlineVisibility(entry.id, "ui")}
                            type="checkbox"
                          />
                          <div class="layer-row-copy">
                            {useRandomOutlineColors ? (
                              <span
                                aria-hidden="true"
                                class="mesh-color-swatch"
                                style={{ backgroundColor: rowColor }}
                              />
                            ) : null}
                            {isEditing ? (
                              <input
                                aria-label={i18n.renameMeshAriaLabel(entry.originalName)}
                                class="mesh-name-input"
                                onBlur={() => handleCommitRename(entry.id)}
                                onClick={(event) => event.stopPropagation()}
                                onInput={(event) =>
                                  setMeshNameDraft((event.currentTarget as HTMLInputElement).value)}
                                onKeyDown={(event) => {
                                  event.stopPropagation();
                                  if (event.key === "Enter") {
                                    event.preventDefault();
                                    handleCommitRename(entry.id);
                                  }
                                  if (event.key === "Escape") {
                                    event.preventDefault();
                                    handleCancelRename();
                                  }
                                }}
                                ref={renameInputRef}
                                type="text"
                                value={meshNameDraft}
                              />
                            ) : (
                              <button
                                class="mesh-name-button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleStartRenaming(entry);
                                }}
                                title={i18n.renameMeshTitle(entry.originalName)}
                                type="button"
                              >
                                <span class="mesh-display-name">{entry.displayName}</span>
                                {hasCustomName ? (
                                  <span class="mesh-original-name">({entry.originalName})</span>
                                ) : null}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </>
                ) : (
                  <p class="compact-panel-note">{i18n.meshPanelEmpty}</p>
                )}
              </div>
            </div>
          </details>

        </div>
      </section>

      {ENABLE_PWA ? <ReloadPrompt copy={i18n.reloadPromptCopy} /> : null}
    </main>
  );
}

function createOutlineEntries(bodies: PreparedMesh["bodies"]): OutlineEntry[] {
  return bodies.map((body) => ({
    displayName: body.name,
    id: body.id,
    originalName: body.name,
    result: null,
    visible: true,
  }));
}

function mergeOutlineEntries(nextEntries: OutlineEntry[], currentEntries: OutlineEntry[]): OutlineEntry[] {
  const currentById = new Map(currentEntries.map((entry) => [entry.id, entry]));

  return nextEntries.map((entry) => {
    const currentEntry = currentById.get(entry.id);
    if (!currentEntry) {
      return entry;
    }

    return {
      ...entry,
      displayName: currentEntry.displayName,
      visible: currentEntry.visible,
    };
  });
}

function loadStoredStudioPreferences(): StudioPreferences {
  const parsed = readStoredStudioSettingsBlob();
  if (!parsed) {
    return {
      liveProjectionEnabled: DEFAULT_LIVE_PROJECTION_ENABLED,
      settings: cloneSettings(DEFAULT_SETTINGS),
      uiLanguage: DEFAULT_UI_LANGUAGE,
    };
  }

  return {
    liveProjectionEnabled:
      typeof parsed.liveProjectionEnabled === "boolean"
        ? parsed.liveProjectionEnabled
        : DEFAULT_LIVE_PROJECTION_ENABLED,
    settings: cloneSettings({
      ...DEFAULT_SETTINGS,
      outputUnits:
        typeof parsed.outputUnits === "string" && parsed.outputUnits
          ? parsed.outputUnits
          : DEFAULT_SETTINGS.outputUnits,
      sourceUnits:
        typeof parsed.sourceUnits === "string" && parsed.sourceUnits
          ? parsed.sourceUnits
          : DEFAULT_SETTINGS.sourceUnits,
      svgStrokeWidth:
        typeof parsed.svgStrokeWidth === "number" && Number.isFinite(parsed.svgStrokeWidth)
          ? Math.max(0.1, roundTo(parsed.svgStrokeWidth, 2))
          : DEFAULT_SETTINGS.svgStrokeWidth,
    }),
    uiLanguage: resolveUiLanguage(parsed.uiLanguage),
  };
}

function loadStoredStudioViewerSettings() {
  const parsed = readStoredStudioSettingsBlob();

  return {
    alignmentSpace: resolveStoredTransformAlignmentMode(parsed?.transformAlignmentMode),
    showBuildPlate: true,
  };
}

function createStudioViewerPersistenceAdapter(): ViewerPersistenceAdapter {
  return {
    loadSettings() {
      return loadStoredStudioViewerSettings();
    },
    saveSettings(viewerSettings) {
      const current = readStoredStudioSettingsBlob() ?? {};
      writeStoredStudioSettingsBlob({
        ...current,
        transformAlignmentMode: viewerSettings.alignmentSpace,
      });
    },
  };
}

function saveStoredStudioSettings(
  settings: ProcessSettings,
  liveProjectionEnabled: boolean,
  uiLanguage: UiLanguage,
) {
  const current = readStoredStudioSettingsBlob() ?? {};
  writeStoredStudioSettingsBlob({
    ...current,
    liveProjectionEnabled,
    outputUnits: settings.outputUnits,
    sourceUnits: settings.sourceUnits,
    svgStrokeWidth: settings.svgStrokeWidth,
    uiLanguage,
  });
}

function clearStoredStudioSettings() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(STUDIO_SETTINGS_STORAGE_KEY);
  } catch {
    // Ignore storage failures and keep the session live.
  }
}

function readStoredStudioSettingsBlob(): (
  Partial<ProcessSettings> & {
    liveProjectionEnabled?: boolean;
    transformAlignmentMode?: TransformAlignmentMode | "model" | "object";
    uiLanguage?: UiLanguage;
  }
) | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(STUDIO_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as Partial<ProcessSettings> & {
      liveProjectionEnabled?: boolean;
      transformAlignmentMode?: TransformAlignmentMode | "model" | "object";
      uiLanguage?: UiLanguage;
    };
  } catch {
    return null;
  }
}

function writeStoredStudioSettingsBlob(
  nextValue: Partial<ProcessSettings> & {
    liveProjectionEnabled?: boolean;
    transformAlignmentMode?: TransformAlignmentMode | "model" | "object";
    uiLanguage?: UiLanguage;
  },
) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(STUDIO_SETTINGS_STORAGE_KEY, JSON.stringify(nextValue));
  } catch {
    // Ignore storage failures and keep the session live.
  }
}

function resolveStoredTransformAlignmentMode(
  value: TransformAlignmentMode | "model" | "object" | undefined,
): TransformAlignmentMode {
  if (value === "world" || value === "local") {
    return value;
  }
  if (value === "model") {
    return "world";
  }
  if (value === "object") {
    return "local";
  }
  return DEFAULT_TRANSFORM_ALIGNMENT_MODE;
}

function buildCanonicalPlaneState(
  mesh: PreparedMesh,
  settings: ProcessSettings,
  revision: number,
): PlaneState {
  const rotationOrigin = settings.rotationOrigin ?? mesh.centroid;
  const meshRotation = buildEulerRotation(settings.rotationDegrees);
  const planeRotation = buildEulerRotation(settings.planeRotationDegrees);
  const transformedCenter = transformPointAroundOrigin(
    mesh.centroid,
    rotationOrigin,
    meshRotation,
    settings.translation,
  );
  const normalWorld = normalizeVector3(applyEulerRotation(planeRotation, [0, 0, 1]));
  const [basisUWorld, basisVWorld] = buildStablePlaneAxes(normalWorld);

  return {
    basisUWorld,
    basisVWorld,
    normalWorld,
    originWorld: [
      roundTo(transformedCenter[0] + settings.planeTranslation[0], 6),
      roundTo(transformedCenter[1] + settings.planeTranslation[1], 6),
      roundTo(transformedCenter[2] + settings.planeTranslation[2], 6),
    ],
    revision,
  };
}

function buildPlaneAnchorLocal(
  mesh: PreparedMesh,
  settings: ProcessSettings,
): [number, number, number] {
  const rotationOrigin = settings.rotationOrigin ?? mesh.centroid;
  const meshRotation = buildEulerRotation(settings.rotationDegrees);
  const transformedCenter = transformPointAroundOrigin(
    mesh.centroid,
    rotationOrigin,
    meshRotation,
    settings.translation,
  );

  return [
    roundTo(transformedCenter[0] - mesh.centroid[0], 6),
    roundTo(transformedCenter[1] - mesh.centroid[1], 6),
    roundTo(transformedCenter[2] - mesh.centroid[2], 6),
  ];
}

type EulerRotationMatrix = {
  m11: number;
  m12: number;
  m13: number;
  m21: number;
  m22: number;
  m23: number;
  m31: number;
  m32: number;
  m33: number;
};

function buildEulerRotation(
  rotationDegrees: [number, number, number],
): EulerRotationMatrix {
  const [x, y, z] = rotationDegrees.map((value) => value * (Math.PI / 180));
  const [a, b] = [Math.cos(x), Math.sin(x)];
  const [c, d] = [Math.cos(y), Math.sin(y)];
  const [e, f] = [Math.cos(z), Math.sin(z)];

  return {
    m11: c * e,
    m12: -c * f,
    m13: d,
    m21: (a * f) + (b * e * d),
    m22: (a * e) - (b * f * d),
    m23: -b * c,
    m31: (b * f) - (a * e * d),
    m32: (b * e) + (a * f * d),
    m33: a * c,
  };
}

function applyEulerRotation(
  rotation: EulerRotationMatrix,
  value: [number, number, number],
): [number, number, number] {
  const [x, y, z] = value;
  return [
    (rotation.m11 * x) + (rotation.m12 * y) + (rotation.m13 * z),
    (rotation.m21 * x) + (rotation.m22 * y) + (rotation.m23 * z),
    (rotation.m31 * x) + (rotation.m32 * y) + (rotation.m33 * z),
  ];
}

function transformPointAroundOrigin(
  point: [number, number, number],
  origin: [number, number, number],
  rotation: EulerRotationMatrix,
  translation: [number, number, number],
): [number, number, number] {
  const rotated = applyEulerRotation(rotation, [
    point[0] - origin[0],
    point[1] - origin[1],
    point[2] - origin[2],
  ]);

  return [
    rotated[0] + origin[0] + translation[0],
    rotated[1] + origin[1] + translation[1],
    rotated[2] + origin[2] + translation[2],
  ];
}

function normalizeVector3(vector: [number, number, number]): [number, number, number] {
  const length = Math.hypot(vector[0], vector[1], vector[2]) || 1;
  return [
    roundTo(vector[0] / length, 6),
    roundTo(vector[1] / length, 6),
    roundTo(vector[2] / length, 6),
  ];
}

function buildStablePlaneAxes(
  normal: [number, number, number],
): [[number, number, number], [number, number, number]] {
  const helper = Math.abs(normal[2]) < 0.9 ? [0, 0, 1] as const : [0, 1, 0] as const;
  const basisU = normalizeVector3(crossProduct(helper, normal));
  const basisV = normalizeVector3(crossProduct(normal, basisU));
  return [basisU, basisV];
}

function crossProduct(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
): [number, number, number] {
  return [
    (left[1] * right[2]) - (left[2] * right[1]),
    (left[2] * right[0]) - (left[0] * right[2]),
    (left[0] * right[1]) - (left[1] * right[0]),
  ];
}

function projectionSignature(
  mesh: PreparedMesh,
  settings: ProcessSettings,
  planeState: PlaneState | null,
): string {
  return JSON.stringify({
    bodyIds: mesh.bodies.map((body) => body.id),
    minArea: settings.minArea,
    outputUnits: settings.outputUnits,
    planeState,
    projectionMode: settings.projectionMode,
    rotationDegrees: settings.rotationDegrees,
    rotationOrigin: settings.rotationOrigin,
    simplifyTolerance: settings.simplifyTolerance,
    snapGrid: settings.snapGrid,
    sourceUnits: settings.sourceUnits,
    translation: settings.translation,
    unionBatchSize: settings.unionBatchSize,
  });
}

function formatProjectionModeLabel(mode: ProjectionMode): string {
  return mode === "plane_cut" ? "Plane cut" : "Projection";
}

function buildProjectionStatusMessage(mode: ProjectionMode, action: "create" | "update"): string {
  if (mode === "plane_cut") {
    return action === "create" ? "Creating the plane cut..." : "Updating the plane cut...";
  }
  return action === "create" ? "Creating the top-down outline..." : "Updating the top-down outline...";
}

function formatTimingSuffix(result: PipelineBrowserResult | null): string {
  const pipelineMs = result?.timings?.pipelineMs;
  if (pipelineMs === undefined || !Number.isFinite(pipelineMs)) {
    return "";
  }
  return ` in ${formatNumber(Number(pipelineMs), pipelineMs >= 100 ? 0 : 1)} ms`;
}

function aggregatePipelineResults(results: PipelineBrowserResult[]): PipelineBrowserResult | null {
  if (!results.length) {
    return null;
  }

  const rings = results.flatMap((result) => result.rings);
  const area = results.reduce((total, result) => total + result.area, 0);
  const bounds = results.reduce<[number, number, number, number]>(
    (accumulator, result, index) => {
      if (index === 0) {
        return [...result.bounds] as [number, number, number, number];
      }
      return [
        Math.min(accumulator[0], result.bounds[0]),
        Math.min(accumulator[1], result.bounds[1]),
        Math.max(accumulator[2], result.bounds[2]),
        Math.max(accumulator[3], result.bounds[3]),
      ];
    },
    [0, 0, 0, 0],
  );

  return {
    area,
    bodyCount: rings.length,
    bounds,
    rings,
    units: results[0]?.units ?? null,
    warnings: [...new Set(results.flatMap((result) => result.warnings))],
  };
}

function Field(props: { children: ComponentChildren }) {
  return <label class="field">{props.children}</label>;
}

function FieldLabel(props: { children: ComponentChildren; title?: string }) {
  return (
    <span class="field-label" title={props.title}>
      {props.children}
    </span>
  );
}

function NumberField(props: {
  onInput: (value: number) => void;
  step?: number;
  title?: string;
  value: number;
}) {
  return (
    <input
      class="field-input"
      inputMode="decimal"
      onInput={(event) => {
        const next = Number((event.currentTarget as HTMLInputElement).value);
        props.onInput(Number.isFinite(next) ? roundTo(next, 2) : 0);
      }}
      step={String(props.step ?? 0.01)}
      title={props.title}
      type="number"
      value={String(roundTo(props.value, 2))}
    />
  );
}

function StrokeSizeInput(props: {
  ariaLabel?: string;
  onCommit: (value: number) => void;
  step?: number;
  title?: string;
  value: number;
}) {
  const [draft, setDraft] = useState(formatStrokeSizeValue(props.value));
  const commitTimeoutRef = useRef<number | null>(null);
  const isEditingRef = useRef(false);

  useEffect(() => {
    if (!isEditingRef.current) {
      setDraft(formatStrokeSizeValue(props.value));
    }
  }, [props.value]);

  useEffect(() => () => {
    if (commitTimeoutRef.current !== null) {
      window.clearTimeout(commitTimeoutRef.current);
    }
  }, []);

  function clearCommitTimeout() {
    if (commitTimeoutRef.current === null) {
      return;
    }
    window.clearTimeout(commitTimeoutRef.current);
    commitTimeoutRef.current = null;
  }

  function commitDraft(nextDraft: string, options: { normalizeDraft?: boolean } = {}) {
    clearCommitTimeout();
    const parsed = parseCommittedStrokeSize(nextDraft);
    if (parsed === null) {
      setDraft(formatStrokeSizeValue(props.value));
      return;
    }

    const committed = clampStrokeSize(parsed);
    props.onCommit(committed);
    if (options.normalizeDraft ?? true) {
      setDraft(formatStrokeSizeValue(committed));
    }
  }

  function scheduleCommit(nextDraft: string) {
    clearCommitTimeout();
    if (!shouldAutoCommitStrokeSize(nextDraft)) {
      return;
    }

    commitTimeoutRef.current = window.setTimeout(() => {
      commitTimeoutRef.current = null;
      const parsed = parseCommittedStrokeSize(nextDraft);
      if (parsed === null) {
        return;
      }

      props.onCommit(clampStrokeSize(parsed));
    }, STROKE_SIZE_COMMIT_DELAY_MS);
  }

  return (
    <input
      aria-label={props.ariaLabel ?? "2D stroke size"}
      class="field-input"
      inputMode="decimal"
      onBlur={() => {
        isEditingRef.current = false;
        commitDraft(draft);
      }}
      onFocus={() => {
        isEditingRef.current = true;
      }}
      onInput={(event) => {
        const nextDraft = (event.currentTarget as HTMLInputElement).value;
        isEditingRef.current = true;
        setDraft(nextDraft);
        scheduleCommit(nextDraft);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          isEditingRef.current = false;
          commitDraft(draft);
        }
        if (event.key === "Escape") {
          event.preventDefault();
          isEditingRef.current = false;
          clearCommitTimeout();
          setDraft(formatStrokeSizeValue(props.value));
        }
      }}
      placeholder={formatStrokeSizeValue(props.value)}
      title={props.title}
      type="text"
      value={draft}
    />
  );
}

function TransformAxisRow(props: {
  axis: "X" | "Y" | "Z";
  moveTitle: string;
  onMoveInput: (value: number) => void;
  onRotateInput: (value: number) => void;
  rotateTitle: string;
  rotationValue: number;
  translationValue: number;
}) {
  return (
    <>
      <div class="transform-axis-label">{props.axis}</div>
      <input
        class="field-input transform-axis-input"
        inputMode="decimal"
        max="180"
        min="-180"
        onInput={(event) => props.onRotateInput(Number((event.currentTarget as HTMLInputElement).value))}
        step="0.01"
        title={props.rotateTitle}
        type="number"
        value={String(roundTo(props.rotationValue, 2))}
      />
      <input
        class="field-input transform-axis-input"
        inputMode="decimal"
        onInput={(event) => props.onMoveInput(Number((event.currentTarget as HTMLInputElement).value))}
        step="0.01"
        title={props.moveTitle}
        type="number"
        value={String(roundTo(props.translationValue, 2))}
      />
    </>
  );
}

function SelectField(props: {
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  title?: string;
  value: string;
}) {
  return (
    <select
      class="field-input"
      onChange={(event) => props.onChange((event.currentTarget as HTMLSelectElement).value)}
      title={props.title}
      value={props.value}
    >
      {props.options.map((option) => (
        <option key={option.value || "blank"} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function MetricCard(props: { icon?: IconName; label: string; value: string }) {
  return (
    <div class="metric-card">
      <p class="metric-label metric-label-with-icon">
        <UiIcon name={props.icon ?? "outline"} />
        {props.label}
      </p>
      <p class="metric-value">{props.value}</p>
    </div>
  );
}

type IconName = "box" | "cog" | "cube" | "dxf" | "file" | "layers" | "merge" | "outline" | "svg" | "top";

function UiIcon(props: { name: IconName }) {
  switch (props.name) {
    case "file":
      return (
        <svg aria-hidden="true" class="inline-icon" viewBox="0 0 16 16">
          <path d="M4 1.75h5L12.5 5v9.25H4z" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path d="M9 1.75V5h3.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      );
    case "layers":
      return (
        <svg aria-hidden="true" class="inline-icon" viewBox="0 0 16 16">
          <path d="m8 2.2 5.3 3L8 8.2 2.7 5.2z" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <path d="m3.6 7.2 4.4 2.5 4.4-2.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <path d="m3.6 9.8 4.4 2.5 4.4-2.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
    case "box":
      return (
        <svg aria-hidden="true" class="inline-icon" viewBox="0 0 16 16">
          <path d="m8 1.9 5.1 2.6v6.9L8 14.1l-5.1-2.7V4.5z" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <path d="M8 1.9v12.2M2.9 4.5 8 7.1l5.1-2.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
    case "cog":
      return (
        <svg
          aria-hidden="true"
          class="inline-icon"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          viewBox="0 0 24 24"
        >
          <path
            d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.53 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.53-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c0 .66.39 1.26 1 1.51.16.07.33.1.51.1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
            strokeWidth="1.8"
          />
          <circle cx="12" cy="12" r="3.25" strokeWidth="1.8" />
        </svg>
      );
    case "cube":
      return (
        <svg aria-hidden="true" class="inline-icon" viewBox="0 0 16 16">
          <path d="m8 2.1 4.8 2.5v6.8L8 13.9l-4.8-2.5V4.6z" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <path d="M8 2.1v11.8M3.2 4.6 8 7l4.8-2.4" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
    case "top":
      return (
        <svg aria-hidden="true" class="inline-icon" viewBox="0 0 16 16">
          <rect fill="none" height="8" rx="1.2" stroke="currentColor" strokeWidth="1.2" width="8" x="4" y="4" />
          <path d="M8 1.8v2.1M6.6 2.9 8 1.5l1.4 1.4" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
    case "outline":
      return (
        <svg aria-hidden="true" class="inline-icon" viewBox="0 0 16 16">
          <path d="M3.1 8.1c.2-2.8 2.1-5.1 4.9-5.1 2.6 0 4.8 1.9 4.9 4.7-.1 2.7-2.2 5.3-4.9 5.3-2.8 0-4.7-2.2-4.9-4.9Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
    case "merge":
      return (
        <svg aria-hidden="true" class="inline-icon" viewBox="0 0 16 16">
          <circle cx="5.5" cy="8" fill="none" r="3.1" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="10.5" cy="8" fill="none" r="3.1" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
    case "svg":
      return (
        <svg aria-hidden="true" class="inline-icon" viewBox="0 0 16 16">
          <path d="M2.3 12.6 5.5 3.4h1.1l3.2 9.2M3.4 9.6h4.8" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <path d="M10.6 4.2h3.1v3.1h-3.1z" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
    case "dxf":
      return (
        <svg aria-hidden="true" class="inline-icon" viewBox="0 0 16 16">
          <path d="M2.2 3.2h4v9.6h-4zM9 3.2l4.8 9.6M13.8 3.2 9 12.8" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
    default:
      return (
        <svg aria-hidden="true" class="inline-icon" viewBox="0 0 16 16">
          <circle cx="8" cy="8" fill="none" r="5" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
  }
}

function getGroundedMeshTranslation(
  mesh: PreparedMesh | null,
  rotationDegrees: [number, number, number],
  rotationOrigin: [number, number, number],
  translation: [number, number, number],
): [number, number, number] {
  if (!mesh) {
    return normalizeTranslationVector(translation);
  }

  return normalizeTranslationVector(
    dropMeshToBuildplate(mesh, {
      rotationDegrees,
      rotationOrigin,
      translation,
    }).translation,
  );
}

function normalizeTranslationVector(
  translation: [number, number, number],
): [number, number, number] {
  return translation.map(clampTranslation) as [number, number, number];
}

function areNumberTriplesEqual(
  left: [number, number, number],
  right: [number, number, number],
): boolean {
  return left.every((value, index) => Math.abs(value - right[index]) < 0.001);
}

function clampRotation(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return roundTo(Math.max(-180, Math.min(180, value)), 2);
}

function clampStrokeSize(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_SETTINGS.svgStrokeWidth;
  }

  return Math.max(MIN_STROKE_SIZE, roundTo(value, 2));
}

function clampTranslation(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return roundTo(Math.max(-1000, Math.min(1000, value)), 2);
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function formatStrokeSizeValue(value: number): string {
  return String(roundTo(value, 2));
}

function parseCommittedStrokeSize(rawValue: string): number | null {
  const trimmed = rawValue.trim();
  if (!trimmed || trimmed === "." || trimmed === "-" || trimmed.endsWith(".")) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function shouldAutoCommitStrokeSize(rawValue: string): boolean {
  const trimmed = rawValue.trim();
  if (!trimmed || trimmed === "." || trimmed === "-" || trimmed.endsWith(".")) {
    return false;
  }

  if (/^0(?:\.0*)?$/u.test(trimmed)) {
    return false;
  }

  return Number.isFinite(Number(trimmed));
}

function describeScrollContainer(container: HTMLDivElement | null): string | null {
  if (!container) {
    return null;
  }

  const className = container.className.trim().split(/\s+/u).filter(Boolean).join(".");
  return className ? `${container.tagName.toLowerCase()}.${className}` : container.tagName.toLowerCase();
}

function pushPreviewDebugLog(stage: string, payload: Record<string, unknown>) {
  if (typeof window === "undefined") {
    return;
  }

  const entry = {
    stage,
    timestamp: new Date().toISOString(),
    ...payload,
  };
  console.debug("[mesh-preview-debug]", entry);
  const debugWindow = window as Window & {
    __meshPreviewDebugLogs?: Array<Record<string, unknown>>;
  };
  debugWindow.__meshPreviewDebugLogs = [...(debugWindow.__meshPreviewDebugLogs ?? []).slice(-19), entry];
}

function serializeRect(rect: DOMRect | null | undefined) {
  if (!rect) {
    return null;
  }

  return {
    bottom: roundTo(rect.bottom, 3),
    height: roundTo(rect.height, 3),
    left: roundTo(rect.left, 3),
    right: roundTo(rect.right, 3),
    top: roundTo(rect.top, 3),
    width: roundTo(rect.width, 3),
  };
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function areSettingsEqual(left: ProcessSettings, right: ProcessSettings): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function cloneSettings(settings: ProcessSettings): ProcessSettings {
  return {
    ...settings,
    direction: [...settings.direction] as [number, number, number],
    planeOrigin: settings.planeOrigin ? [...settings.planeOrigin] as [number, number, number] : null,
    planeRotationDegrees: [...settings.planeRotationDegrees] as [number, number, number],
    planeTranslation: [...settings.planeTranslation] as [number, number, number],
    rotationDegrees: [...settings.rotationDegrees] as [number, number, number],
    rotationOrigin: [...settings.rotationOrigin] as [number, number, number],
    translation: [...settings.translation] as [number, number, number],
  };
}
