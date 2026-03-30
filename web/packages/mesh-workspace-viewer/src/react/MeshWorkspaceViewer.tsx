import { useEffect, useRef, useState } from "preact/hooks";
import type { Mesh, Object3D, OrthographicCamera, PerspectiveCamera, Vector3 } from "three";
import type { TransformControls as TransformControlsImpl } from "three/examples/jsm/controls/TransformControls.js";
import { normalizeViewerSettings } from "../core/defaults";
import type { MeshWorkspaceViewerProps, SceneSelectionTarget, TransformToolMode, ViewerSettings } from "../core/types";
import {
  applyLayFlatCandidate,
  applyRotation,
  applyTransformAlignmentMode,
  applyTranslation,
  areNumberTriplesClose,
  AXIS_GIZMO_INSET_MM,
  BUILD_PLATE_SIZE_MM,
  buildAxisGizmo,
  buildFaceCandidateMarkers,
  centerTopCameraOnRings,
  clearGroup,
  CLICK_MOVE_TOLERANCE,
  createBuildPlate,
  dropObjectToBed,
  enableMeshShadows,
  fitCamera,
  fitTopCamera,
  getSelectedSceneObject,
  getSelectionTargetForObject,
  isTransformControlsDragging,
  pickSelectableObjectAtPoint,
  pickViewportTargetAtPoint,
  planeTranslationFromGroup,
  prepareViewerObject,
  refreshSelectableObjects,
  requestRender,
  resetBuildPlateLayout,
  rotationFromGroup,
  setHoveredCandidate,
  setModelProjectionState,
  setModelSelectionState,
  setPlaneSelectionState,
  setRotationSnap,
  setRayFromPointer,
  syncInteractionDecorations,
  syncPlacementToPlate,
  syncTransformControls,
  syncTransformControlsMatrices,
  translationFromGroup,
  updateModelClippingState,
  updateOverlayPlacement,
  updateProjectionOverlay,
  updateSectionPlaneOverlay,
  type ViewerRuntime,
} from "../core/viewer-runtime";
import { collectFlatFaceCandidates, type FlatFaceCandidate } from "../core/mesh-analysis";

const DEFAULT_COPY = {
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
  meshSelected: "Mesh selected",
};

export function MeshWorkspaceViewer(props: MeshWorkspaceViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<ViewerRuntime | null>(null);
  const copy = {
    ...DEFAULT_COPY,
    ...(props.copy ?? {}),
  };
  const [uncontrolledSettings, setUncontrolledSettings] = useState<ViewerSettings>(
    normalizeViewerSettings(props.settings),
  );
  const viewerSettings = props.settings === undefined
    ? uncontrolledSettings
    : normalizeViewerSettings(props.settings);
  const propsRef = useRef({ ...props, copy, settings: viewerSettings });
  const originalCentroidRef = useRef<Vector3 | null>(null);
  const lastFocusOutlineNonceRef = useRef<number | null>(null);
  const syncFromAppRef = useRef(false);
  const selectedSceneObjectRef = useRef<Object3D | null>(null);
  const selectedTargetRef = useRef<SceneSelectionTarget>(null);
  const layFlatModeRef = useRef(false);
  const transformModeRef = useRef<TransformToolMode>("rotate");
  const transformDragStartRef = useRef<{
    mode: TransformToolMode;
    rotationDegrees: [number, number, number];
    target: SceneSelectionTarget;
    translation: [number, number, number];
  } | null>(null);
  const gizmoHandlePointerRef = useRef(false);
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
  const [isLayFlatMode, setIsLayFlatMode] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<SceneSelectionTarget>(null);
  const [sceneReady, setSceneReady] = useState(false);
  const [transformMode, setTransformMode] = useState<TransformToolMode>("rotate");
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [viewerReady, setViewerReady] = useState(false);

  useEffect(() => {
    propsRef.current = { ...props, copy, settings: viewerSettings };
  }, [copy, props, viewerSettings]);

  function commitSettings(nextSettings: ViewerSettings) {
    if (props.settings === undefined) {
      setUncontrolledSettings(nextSettings);
    }
    props.onSettingsChange?.(nextSettings);
  }

  function updateSelection(
    nextTarget: SceneSelectionTarget,
    nextSceneObject: Object3D | null = null,
  ) {
    if (selectedTargetRef.current === nextTarget && selectedSceneObjectRef.current === nextSceneObject) {
      return;
    }

    selectedTargetRef.current = nextTarget;
    selectedSceneObjectRef.current = nextSceneObject;
    setSelectedTarget(nextTarget);
    propsRef.current.onSelectionChange(nextTarget);

    const runtime = runtimeRef.current;
    if (!runtime) {
      return;
    }

    syncTransformControls(
      runtime,
      nextTarget,
      nextSceneObject,
      transformModeRef.current,
      propsRef.current.settings.alignmentSpace,
    );
    if (nextTarget !== "mesh") {
      updateLayFlatMode(false);
    }

    setModelSelectionState(runtime.THREE, runtime.modelHolder, nextTarget === "mesh");
    setPlaneSelectionState(runtime.planeHolder, nextTarget === "plane");
    syncInteractionDecorations(runtime, nextTarget === "mesh", layFlatModeRef.current);
  }

  function updateLayFlatMode(nextValue: boolean) {
    if (layFlatModeRef.current === nextValue) {
      return;
    }

    layFlatModeRef.current = nextValue;
    setIsLayFlatMode(nextValue);
    const runtime = runtimeRef.current;
    if (runtime) {
      syncInteractionDecorations(runtime, selectedTargetRef.current === "mesh", layFlatModeRef.current);
    }
  }

  function updateTransformMode(nextMode: TransformToolMode) {
    if (transformModeRef.current === nextMode) {
      return;
    }

    transformModeRef.current = nextMode;
    setTransformMode(nextMode);
    const runtime = runtimeRef.current;
    if (runtime) {
      syncTransformControls(
        runtime,
        selectedTargetRef.current,
        selectedSceneObjectRef.current,
        nextMode,
        propsRef.current.settings.alignmentSpace,
      );
    }
  }

  function focusSelectionAndToggleLayFlat() {
    if (!propsRef.current.mesh || selectedTargetRef.current !== "mesh") {
      return;
    }

    updateLayFlatMode(!layFlatModeRef.current);
  }

  function activateTransformMode(nextMode: TransformToolMode) {
    if (!propsRef.current.mesh || !selectedTargetRef.current) {
      return;
    }
    updateTransformMode(nextMode);
  }

  function commitMeshAutoDrop(
    runtime: ViewerRuntime,
    options: { requireMeshSelection?: boolean } = {},
  ) {
    const requireMeshSelection = options.requireMeshSelection ?? true;
    if (
      !propsRef.current.mesh
      || (requireMeshSelection && selectedTargetRef.current !== "mesh")
    ) {
      return;
    }

    dropObjectToBed(runtime.modelHolder, runtime, runtime.modelTransformGroup);
    syncTransformControlsMatrices(runtime, selectedSceneObjectRef.current);
    propsRef.current.onRotationChange(rotationFromGroup(runtime.THREE, runtime.modelTransformGroup));
    propsRef.current.onTranslationChange(translationFromGroup(runtime.modelTransformGroup));
  }

  function handleDropSelectedMeshToBuildplate() {
    const runtime = runtimeRef.current;
    if (!runtime || selectedTargetRef.current !== "mesh") {
      return;
    }

    commitMeshAutoDrop(runtime);
    requestRender(runtime, propsRef.current.cameraMode);
  }

  function handleResetCamera() {
    const runtime = runtimeRef.current;
    if (!runtime) {
      return;
    }
    fitCamera(
      runtime.THREE,
      runtime.camera,
      runtime.controls,
      runtime.modelHolder,
      BUILD_PLATE_SIZE_MM,
    );
    fitTopCamera(
      runtime.THREE,
      runtime.topCamera,
      runtime.topControls,
      runtime.modelHolder,
      runtime.renderer.domElement.clientWidth || 1,
      runtime.renderer.domElement.clientHeight || 1,
      BUILD_PLATE_SIZE_MM,
    );
  }

  function clearSelectionAndTools() {
    updateLayFlatMode(false);
    updateSelection(null, null);
    const runtime = runtimeRef.current;
    if (runtime) {
      setHoveredCandidate(runtime, null);
      requestRender(runtime, propsRef.current.cameraMode);
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const shell = shellRef.current;
    if (!canvas || !container || !shell) {
      return;
    }

    let cancelled = false;
    let cleanup = () => {};

    setViewerError(null);
    setViewerReady(false);
    setSceneReady(false);

    void (async () => {
      try {
        const THREE = await import("three");
        const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
        const { TransformControls } = await import(
          "three/examples/jsm/controls/TransformControls.js"
        );
        if (cancelled) {
          return;
        }

        const renderer = new THREE.WebGLRenderer({ antialias: true, canvas });
        renderer.localClippingEnabled = true;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setClearColor(0x171713, 1);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.outputColorSpace = THREE.SRGBColorSpace;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
        camera.position.set(190, 220, 260);
        camera.lookAt(0, 0, 0);
        const topCamera = new THREE.OrthographicCamera(-100, 100, 100, -100, 0.1, 5000);
        topCamera.position.set(0, 500, 0);
        topCamera.up.set(0, 0, -1);
        topCamera.lookAt(0, 0, 0);

        const controls = new OrbitControls(camera, canvas);
        controls.enableDamping = true;
        controls.dampingFactor = 0.07;
        controls.minDistance = 30;
        controls.maxDistance = 1400;
        controls.target.set(0, 0, 0);

        const topControls = new OrbitControls(topCamera, canvas);
        topControls.enableDamping = true;
        topControls.dampingFactor = 0.09;
        topControls.enableRotate = false;
        topControls.enablePan = true;
        topControls.screenSpacePanning = true;
        topControls.zoomSpeed = 1.15;
        topControls.target.set(0, 0, 0);
        topControls.enabled = false;

        scene.add(new THREE.AmbientLight(0xffffff, 0.55));
        const keyLight = new THREE.DirectionalLight(0xffffff, 1.3);
        keyLight.position.set(150, 300, 150);
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.set(2048, 2048);
        scene.add(keyLight);
        const fillLight = new THREE.DirectionalLight(0x8090ff, 0.4);
        fillLight.position.set(-150, 100, -200);
        scene.add(fillLight);

        const buildPlate = createBuildPlate(THREE, BUILD_PLATE_SIZE_MM);
        const axisGizmo = buildAxisGizmo(
          THREE,
          new THREE.Vector3(
            (-BUILD_PLATE_SIZE_MM / 2) + AXIS_GIZMO_INSET_MM,
            0,
            (BUILD_PLATE_SIZE_MM / 2) - AXIS_GIZMO_INSET_MM,
          ),
        );
        scene.add(buildPlate);
        scene.add(axisGizmo);

        const overlayConversionGroup = new THREE.Group();
        overlayConversionGroup.rotation.x = -Math.PI / 2;
        const overlayPlacementGroup = new THREE.Group();
        const projectionHolder = new THREE.Group();
        overlayPlacementGroup.add(projectionHolder);
        overlayConversionGroup.add(overlayPlacementGroup);
        scene.add(overlayConversionGroup);

        const planeConversionGroup = new THREE.Group();
        planeConversionGroup.rotation.x = -Math.PI / 2;
        const planeTransformGroup = new THREE.Group();
        planeTransformGroup.rotation.order = "XYZ";
        const planeHolder = new THREE.Group();
        planeTransformGroup.add(planeHolder);
        planeConversionGroup.add(planeTransformGroup);
        scene.add(planeConversionGroup);

        const modelConversionGroup = new THREE.Group();
        modelConversionGroup.rotation.x = -Math.PI / 2;
        const modelTransformGroup = new THREE.Group();
        modelTransformGroup.rotation.order = "XYZ";
        const modelHolder = new THREE.Group();
        const faceCandidateHolder = new THREE.Group();
        modelTransformGroup.add(modelHolder);
        modelTransformGroup.add(faceCandidateHolder);
        modelConversionGroup.add(modelTransformGroup);
        scene.add(modelConversionGroup);

        const transformControls = new TransformControls(camera, renderer.domElement);
        transformControls.setMode("rotate");
        transformControls.space = "local";
        transformControls.size = 0.95;
        transformControls.enabled = false;
        transformControls.showX = true;
        transformControls.showY = true;
        transformControls.showZ = true;
        transformControls.addEventListener("dragging-changed", (event) => {
          const dragging = Boolean(event.value);
          controls.enabled = !dragging && propsRef.current.cameraMode !== "top";
          topControls.enabled = !dragging && propsRef.current.cameraMode === "top";
          const runtime = runtimeRef.current;
          if (runtime) {
            requestRender(runtime, propsRef.current.cameraMode);
          }
        });
        transformControls.addEventListener("mouseDown", () => {
          gizmoHandlePointerRef.current = true;
          const runtime = runtimeRef.current;
          if (!runtime) {
            transformDragStartRef.current = null;
            return;
          }

          transformDragStartRef.current = {
            mode: transformModeRef.current,
            rotationDegrees: rotationFromGroup(runtime.THREE, runtime.modelTransformGroup),
            target: selectedTargetRef.current,
            translation: translationFromGroup(runtime.modelTransformGroup),
          };
        });
        transformControls.addEventListener("mouseUp", () => {
          const runtime = runtimeRef.current;
          const dragStart = transformDragStartRef.current;
          transformDragStartRef.current = null;
          if (runtime) {
            const endRotationDegrees = rotationFromGroup(runtime.THREE, runtime.modelTransformGroup);
            const endTranslation = translationFromGroup(runtime.modelTransformGroup);
            const didRotateMesh = dragStart
              && dragStart.mode === "rotate"
              && dragStart.target === "mesh"
              && (
                !areNumberTriplesClose(dragStart.rotationDegrees, endRotationDegrees)
                || !areNumberTriplesClose(dragStart.translation, endTranslation)
              );
            if (didRotateMesh) {
              commitMeshAutoDrop(runtime);
            }
            syncTransformControlsMatrices(runtime, selectedSceneObjectRef.current);
            requestRender(runtime, propsRef.current.cameraMode);
          }
        });
        transformControls.addEventListener("objectChange", () => {
          if (syncFromAppRef.current || !propsRef.current.mesh) {
            return;
          }

          if (selectedTargetRef.current === "plane") {
            propsRef.current.onPlaneRotationChange(rotationFromGroup(THREE, planeTransformGroup));
            propsRef.current.onPlaneTranslationChange(
              planeTranslationFromGroup(
                planeTransformGroup,
                propsRef.current.planeAnchorLocal ?? null,
              ),
            );
            return;
          }

          const runtime = runtimeRef.current;
          if (!runtime) {
            return;
          }

          syncFromAppRef.current = true;
          try {
            dropObjectToBed(modelHolder, runtime, modelTransformGroup);
          } finally {
            syncFromAppRef.current = false;
          }
          propsRef.current.onRotationChange(rotationFromGroup(THREE, modelTransformGroup));
          propsRef.current.onTranslationChange(translationFromGroup(modelTransformGroup));
        });
        const transformHelper = transformControls.getHelper();
        transformHelper.traverse((child) => {
          child.layers.enable(2);
        });
        scene.add(transformHelper);
        const gizmoRaycaster = transformControls.getRaycaster();
        gizmoRaycaster.layers.set(2);

        const raycaster = new THREE.Raycaster();
        const pointerNdc = new THREE.Vector2();

        const render = () => {
          if (cancelled) {
            return;
          }

          const useTopCamera = propsRef.current.cameraMode === "top";
          const activeCamera = useTopCamera ? runtimeRef.current?.topCamera ?? topCamera : camera;
          renderer.setClearColor(useTopCamera ? 0xf8fafc : 0x171713, 1);
          const showBuildPlate = propsRef.current.settings.showBuildPlate;
          buildPlate.visible = !useTopCamera && showBuildPlate;
          axisGizmo.visible = !useTopCamera && showBuildPlate;
          const draggingTransform = runtimeRef.current
            ? isTransformControlsDragging(runtimeRef.current)
            : Boolean((transformControls as TransformControlsImpl & { dragging?: boolean }).dragging);
          const canOrbit = !useTopCamera && !draggingTransform;
          const canTopNavigate = useTopCamera && !draggingTransform;
          controls.enabled = canOrbit;
          topControls.enabled = canTopNavigate;
          if (canOrbit) {
            controls.update();
          }
          if (canTopNavigate) {
            topControls.update();
          }
          (transformControls as TransformControlsImpl & {
            camera?: PerspectiveCamera | OrthographicCamera;
          }).camera = activeCamera;

          const width = container.clientWidth || 1;
          const height = container.clientHeight || 1;
          renderer.setScissorTest(false);
          renderer.setViewport(0, 0, width, height);
          renderer.render(scene, activeCamera);
        };

        const resize = () => {
          const width = Math.max(container.clientWidth, 1);
          const height = Math.max(container.clientHeight, 1);
          renderer.setSize(width, height, false);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          fitTopCamera(
            THREE,
            topCamera,
            topControls,
            modelHolder,
            width,
            height,
            BUILD_PLATE_SIZE_MM,
          );
          render();
        };

        const updateHoverState = (event: PointerEvent) => {
          const runtime = runtimeRef.current;
          if (!runtime || selectedTargetRef.current !== "mesh") {
            return;
          }

          runtime.modelTransformGroup.updateMatrixWorld(true);
          setRayFromPointer(runtime, event.clientX, event.clientY, container, propsRef.current.cameraMode);
          runtime.raycaster.layers.set(3);
          if (layFlatModeRef.current) {
            const faceHit = runtime.raycaster.intersectObjects(runtime.candidateTargets, true)[0];
            setHoveredCandidate(runtime, (faceHit?.object as Mesh) ?? null);
            return;
          }

          setHoveredCandidate(runtime, null);
        };

        const pickViewportTarget = (event: PointerEvent): "gizmo" | "selectable" | "empty" => {
          const runtime = runtimeRef.current;
          if (!runtime) {
            return "empty";
          }

          runtime.modelTransformGroup.updateMatrixWorld(true);
          runtime.planeTransformGroup.updateMatrixWorld(true);
          return pickViewportTargetAtPoint(
            runtime,
            event.clientX,
            event.clientY,
            container,
            propsRef.current.cameraMode,
          );
        };

        const handlePointerDown = (event: PointerEvent) => {
          if (event.button !== 0) {
            pointerDownRef.current = null;
            return;
          }
          gizmoHandlePointerRef.current = false;
          pointerDownRef.current = { x: event.clientX, y: event.clientY };
          updateHoverState(event);
        };

        const handlePointerMove = (event: PointerEvent) => {
          updateHoverState(event);
        };

        const handlePointerUp = (event: PointerEvent) => {
          if (event.button !== 0) {
            pointerDownRef.current = null;
            return;
          }
          const runtime = runtimeRef.current;
          const pointerDown = pointerDownRef.current;
          pointerDownRef.current = null;
          if (!runtime || !pointerDown || isTransformControlsDragging(runtime)) {
            return;
          }

          const movedDistance = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y);
          if (movedDistance > CLICK_MOVE_TOLERANCE) {
            return;
          }

          const viewportTarget = pickViewportTarget(event);
          const didHitGizmoHandle = gizmoHandlePointerRef.current;
          gizmoHandlePointerRef.current = false;

          if (layFlatModeRef.current && selectedTargetRef.current === "mesh") {
            setRayFromPointer(runtime, event.clientX, event.clientY, container, propsRef.current.cameraMode);
            runtime.raycaster.layers.set(3);
            const faceHit = runtime.raycaster.intersectObjects(runtime.candidateTargets, true)[0];
            const candidate = faceHit?.object.userData.candidate as FlatFaceCandidate | undefined;
            if (candidate) {
              applyLayFlatCandidate(runtime, candidate);
              commitMeshAutoDrop(runtime);
              updateLayFlatMode(false);
              requestRender(runtime, propsRef.current.cameraMode);
              return;
            }
          }

          if (didHitGizmoHandle) {
            return;
          }

          if (viewportTarget === "selectable" || viewportTarget === "gizmo") {
            const selectedObject = pickSelectableObjectAtPoint(
              runtime,
              event.clientX,
              event.clientY,
              container,
              propsRef.current.cameraMode,
            );
            const nextTarget = selectedObject ? getSelectionTargetForObject(selectedObject) : null;
            if (nextTarget) {
              updateSelection(nextTarget, getSelectedSceneObject(runtime, nextTarget));
              return;
            }
          }

          if (viewportTarget === "empty") {
            clearSelectionAndTools();
            return;
          }

          clearSelectionAndTools();
        };

        const handleContextMenu = (event: MouseEvent) => {
          event.preventDefault();
        };

        const handleKeyDown = (event: KeyboardEvent) => {
          const activeElement = document.activeElement;
          if (
            activeElement instanceof HTMLElement
            && ["INPUT", "SELECT", "TEXTAREA"].includes(activeElement.tagName)
          ) {
            return;
          }

          if (event.metaKey || event.ctrlKey || event.altKey) {
            return;
          }

          const key = event.key.toLowerCase();
          if (key === "f" && propsRef.current.mesh && selectedTargetRef.current === "mesh") {
            event.preventDefault();
            focusSelectionAndToggleLayFlat();
            return;
          }

          if (key === "r" && propsRef.current.mesh && selectedTargetRef.current) {
            event.preventDefault();
            activateTransformMode("rotate");
            return;
          }

          if (key === "t" && propsRef.current.mesh && selectedTargetRef.current) {
            event.preventDefault();
            activateTransformMode("translate");
            return;
          }

          if (key === "d") {
            event.preventDefault();
            clearSelectionAndTools();
            return;
          }

          if (event.key === "Shift") {
            setRotationSnap(runtimeRef.current, true);
          }
        };

        const handleKeyUp = (event: KeyboardEvent) => {
          if (event.key === "Shift") {
            setRotationSnap(runtimeRef.current, false);
          }
        };

        const handleWindowPointerDown = (event: PointerEvent) => {
          const target = event.target;
          if (!selectedTargetRef.current || !(target instanceof Node) || shell.contains(target)) {
            return;
          }
          clearSelectionAndTools();
        };

        const handleShellPointerDown = (event: PointerEvent) => {
          const target = event.target;
          if (!selectedTargetRef.current || !(target instanceof Node)) {
            return;
          }

          if (container.contains(target)) {
            return;
          }

          const element = target instanceof HTMLElement ? target : null;
          if (element?.closest(".mwv-toolbar, .mwv-side-tools")) {
            return;
          }

          clearSelectionAndTools();
        };

        canvas.addEventListener("pointerdown", handlePointerDown);
        canvas.addEventListener("pointermove", handlePointerMove);
        canvas.addEventListener("pointerup", handlePointerUp);
        canvas.addEventListener("contextmenu", handleContextMenu);
        shell.addEventListener("pointerdown", handleShellPointerDown, true);
        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);
        window.addEventListener("pointerdown", handleWindowPointerDown, true);

        const resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(container);
        resize();
        renderer.setAnimationLoop(render);

        runtimeRef.current = {
          axisGizmo,
          bedZWorld: 0,
          buildPlate,
          THREE,
          camera,
          candidateTargets: [],
          controls,
          faceCandidateHolder,
          flatFaceCandidates: [],
          gizmoRaycaster,
          hoveredCandidate: null,
          modelConversionGroup,
          modelHolder,
          modelTransformGroup,
          overlayConversionGroup,
          overlayPlacementGroup,
          planeConversionGroup,
          planeHolder,
          planeTransformGroup,
          pointerNdc,
          projectionHolder,
          raycaster,
          renderer,
          resizeObserver,
          selectableObjects: [],
          scene,
          topCamera,
          topControls,
          transformControls,
          transformHelper,
          worldUpAxis: "y",
        };
        setSceneReady(true);

        cleanup = () => {
          canvas.removeEventListener("pointerdown", handlePointerDown);
          canvas.removeEventListener("pointermove", handlePointerMove);
          canvas.removeEventListener("pointerup", handlePointerUp);
          canvas.removeEventListener("contextmenu", handleContextMenu);
          shell.removeEventListener("pointerdown", handleShellPointerDown, true);
          window.removeEventListener("keydown", handleKeyDown);
          window.removeEventListener("keyup", handleKeyUp);
          window.removeEventListener("pointerdown", handleWindowPointerDown, true);
          resizeObserver.disconnect();
          renderer.setAnimationLoop(null);
          controls.dispose();
          topControls.dispose();
          transformControls.detach();
          transformControls.dispose();
          renderer.dispose();
        };
      } catch (error) {
        if (!cancelled) {
          console.error("MeshWorkspaceViewer setup failed", error);
          setViewerError(
            error instanceof Error ? error.message : copy.viewerErrorFallback,
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      cleanup();
      runtimeRef.current = null;
      originalCentroidRef.current = null;
      selectedSceneObjectRef.current = null;
      selectedTargetRef.current = null;
      layFlatModeRef.current = false;
      setSelectedTarget(null);
      setIsLayFlatMode(false);
      setSceneReady(false);
      setViewerReady(false);
    };
  }, []);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!sceneReady || !runtime || isTransformControlsDragging(runtime)) {
      return;
    }

    updateTransformMode("rotate");
    updateLayFlatMode(false);
    updateSelection(null, null);

    const {
      THREE,
      camera,
      controls,
      modelConversionGroup,
      modelHolder,
      modelTransformGroup,
    } = runtime;
    clearGroup(modelHolder);
    clearGroup(runtime.faceCandidateHolder);
    runtime.candidateTargets = [];
    runtime.flatFaceCandidates = [];
    runtime.selectableObjects = [];
    runtime.transformControls.detach();
    originalCentroidRef.current = null;
    setViewerError(null);
    setViewerReady(false);

    if (!props.mesh) {
      clearGroup(runtime.projectionHolder);
      clearGroup(runtime.planeHolder);
      lastFocusOutlineNonceRef.current = null;
      resetBuildPlateLayout(runtime);
      return;
    }

    try {
      const model = props.mesh.object3d.clone(true);
      prepareViewerObject(model, THREE);
      enableMeshShadows(model);

      const centroid = new THREE.Vector3(...props.mesh.centroid);
      originalCentroidRef.current = centroid.clone();
      model.position.sub(centroid);
      modelHolder.add(model);
      modelHolder.updateMatrixWorld(true);

      runtime.flatFaceCandidates = collectFlatFaceCandidates(THREE, modelHolder);
      buildFaceCandidateMarkers(runtime);

      syncFromAppRef.current = true;
      applyRotation(THREE, modelTransformGroup, props.rotationDegrees);
      applyTranslation(modelTransformGroup, props.translation);
      syncPlacementToPlate(
        THREE,
        modelConversionGroup,
        modelTransformGroup,
        modelHolder,
        props.translation,
      );
      commitMeshAutoDrop(runtime, { requireMeshSelection: false });
      const groundedTranslation = translationFromGroup(modelTransformGroup);
      updateOverlayPlacement(runtime, groundedTranslation);
      syncFromAppRef.current = false;

      fitCamera(THREE, camera, controls, modelHolder, BUILD_PLATE_SIZE_MM);
      fitTopCamera(
        THREE,
        runtime.topCamera,
        runtime.topControls,
        modelHolder,
        runtime.renderer.domElement.clientWidth || 1,
        runtime.renderer.domElement.clientHeight || 1,
        BUILD_PLATE_SIZE_MM,
      );
      updateProjectionOverlay(
        runtime,
        !Boolean(props.planeCutEnabled),
        props.projectionLayers ?? [],
        props.highlightedProjectionRings ?? null,
        props.offsetRings ?? null,
        centroid,
        groundedTranslation,
      );
      updateSectionPlaneOverlay(
        runtime,
        props.mesh,
        Boolean(props.planeCutEnabled),
        props.planeState ?? null,
        props.projectionLayers ?? [],
        props.highlightedProjectionRings ?? null,
        props.offsetRings ?? null,
      );
      updateModelClippingState(runtime, props.mesh, Boolean(props.planeCutEnabled), props.planeState ?? null, centroid);
      refreshSelectableObjects(runtime);
      setModelProjectionState(
        modelHolder,
        Boolean((props.projectionLayers ?? []).length || props.highlightedProjectionRings?.length || props.offsetRings?.length),
      );
      setModelSelectionState(THREE, modelHolder, false);
      setPlaneSelectionState(runtime.planeHolder, false);
      syncInteractionDecorations(runtime, selectedTargetRef.current === "mesh", layFlatModeRef.current);
      syncTransformControls(
        runtime,
        null,
        null,
        transformModeRef.current,
        viewerSettings.alignmentSpace,
      );
      setViewerReady(true);
    } catch (error) {
      console.error("MeshWorkspaceViewer mesh load failed", error);
      setViewerError(
        error instanceof Error ? error.message : copy.viewerErrorFallback,
      );
    }
  }, [copy.viewerErrorFallback, sceneReady, props.mesh]);

  useEffect(() => {
    if (props.planeCutEnabled || selectedTargetRef.current !== "plane") {
      return;
    }
    updateSelection(null, null);
  }, [props.planeCutEnabled]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!sceneReady || !runtime || isTransformControlsDragging(runtime)) {
      return;
    }

    const selectedSceneObject = selectedSceneObjectRef.current;
    if (!selectedTargetRef.current || !selectedSceneObject) {
      return;
    }

    applyTransformAlignmentMode(runtime, viewerSettings.alignmentSpace);
    syncTransformControlsMatrices(runtime, selectedSceneObject);
    requestRender(runtime, props.cameraMode);
  }, [props.cameraMode, sceneReady, viewerSettings.alignmentSpace]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!sceneReady || !runtime) {
      return;
    }

    requestRender(runtime, props.cameraMode);
  }, [props.cameraMode, sceneReady, viewerSettings.showBuildPlate]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!sceneReady || !runtime || !props.mesh || isTransformControlsDragging(runtime)) {
      return;
    }

    syncFromAppRef.current = true;
    applyRotation(runtime.THREE, runtime.modelTransformGroup, props.rotationDegrees);
    syncPlacementToPlate(
      runtime.THREE,
      runtime.modelConversionGroup,
      runtime.modelTransformGroup,
      runtime.modelHolder,
      props.translation,
    );
    commitMeshAutoDrop(runtime, { requireMeshSelection: false });
    syncFromAppRef.current = false;
  }, [sceneReady, props.mesh, props.rotationDegrees]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!sceneReady || !runtime || !props.mesh || isTransformControlsDragging(runtime)) {
      return;
    }

    syncFromAppRef.current = true;
    applyTranslation(runtime.modelTransformGroup, props.translation);
    syncPlacementToPlate(
      runtime.THREE,
      runtime.modelConversionGroup,
      runtime.modelTransformGroup,
      runtime.modelHolder,
      props.translation,
    );
    commitMeshAutoDrop(runtime, { requireMeshSelection: false });
    updateOverlayPlacement(runtime, translationFromGroup(runtime.modelTransformGroup));
    syncFromAppRef.current = false;
  }, [sceneReady, props.mesh, props.translation]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!sceneReady || !runtime || !selectedTargetRef.current || isTransformControlsDragging(runtime)) {
      return;
    }

    syncTransformControls(
      runtime,
      selectedTargetRef.current,
      selectedSceneObjectRef.current,
      transformModeRef.current,
      viewerSettings.alignmentSpace,
    );
  }, [
    sceneReady,
    props.mesh,
    props.planeCutEnabled,
    props.planeState,
    props.rotationDegrees,
    props.translation,
    viewerSettings.alignmentSpace,
  ]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!sceneReady || !runtime) {
      return;
    }

    updateSectionPlaneOverlay(
      runtime,
      props.mesh,
      Boolean(props.planeCutEnabled),
      props.planeState ?? null,
      props.projectionLayers ?? [],
      props.highlightedProjectionRings ?? null,
      props.offsetRings ?? null,
    );
    updateModelClippingState(runtime, props.mesh, Boolean(props.planeCutEnabled), props.planeState ?? null, originalCentroidRef.current);
    refreshSelectableObjects(runtime);
    setPlaneSelectionState(runtime.planeHolder, selectedTargetRef.current === "plane");
  }, [
    sceneReady,
    props.mesh,
    props.planeCutEnabled,
    props.planeState,
    props.highlightedProjectionRings,
    props.offsetRings,
    props.projectionLayers,
  ]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    const centroid = originalCentroidRef.current;
    if (!sceneReady || !runtime || !props.mesh || !centroid) {
      return;
    }

    updateProjectionOverlay(
      runtime,
      !Boolean(props.planeCutEnabled),
      props.projectionLayers ?? [],
      props.highlightedProjectionRings ?? null,
      props.offsetRings ?? null,
      centroid,
      props.translation,
    );
    setModelProjectionState(
      runtime.modelHolder,
      Boolean((props.projectionLayers ?? []).length || props.highlightedProjectionRings?.length || props.offsetRings?.length),
    );
  }, [
    sceneReady,
    props.planeCutEnabled,
    props.highlightedProjectionRings,
    props.mesh,
    props.offsetRings,
    props.projectionLayers,
    props.translation,
  ]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    const centroid = originalCentroidRef.current;
    const request = props.focusOutlineRequest;
    if (!sceneReady || !runtime || !props.mesh || !centroid || !request || props.cameraMode !== "top") {
      return;
    }

    if (lastFocusOutlineNonceRef.current === request.nonce) {
      return;
    }

    centerTopCameraOnRings(
      runtime,
      request.rings,
      centroid,
      props.translation,
    );
    lastFocusOutlineNonceRef.current = request.nonce;
    requestRender(runtime, props.cameraMode);
  }, [sceneReady, props.cameraMode, props.focusOutlineRequest, props.mesh, props.translation]);

  function rootClassName() {
    return ["mwv-shell", props.className].filter(Boolean).join(" ");
  }

  return (
    <div className={rootClassName()} ref={shellRef} style={props.style}>
      {!props.mesh ? (
        <div className="mwv-overlay">
          <div className="mwv-upload-card">
            <p className="mwv-placeholder-title">{copy.emptyTitle}</p>
            <p className="mwv-placeholder-copy">{copy.emptyFormats}</p>
            <button className="mwv-tool-button" onClick={props.onBrowseRequest} type="button">
              {copy.browseFiles}
            </button>
          </div>
        </div>
      ) : null}

      {props.mesh && (props.isPreparing || (!viewerReady && !viewerError)) ? (
        <div className="mwv-overlay">
          <p className="mwv-placeholder-title">{copy.preparingTitle}</p>
          <p className="mwv-placeholder-copy">{copy.preparingCopy}</p>
        </div>
      ) : null}

      {viewerError ? (
        <div className="mwv-overlay">
          <p className="mwv-placeholder-title">{copy.viewerErrorTitle}</p>
          <p className="mwv-placeholder-copy">{viewerError}</p>
        </div>
      ) : null}

      <div className="mwv-canvas-host" ref={containerRef}>
        <canvas className="mwv-canvas" ref={canvasRef} />
      </div>

      {props.mesh && props.cameraMode !== "top" ? (
        <div className="mwv-side-tools">
          <button
            className={`mwv-tool-button mwv-side-tool-button ${viewerSettings.alignmentSpace === "world" ? "mwv-is-active" : ""}`.trim()}
            onClick={() =>
              commitSettings(normalizeViewerSettings({
                ...viewerSettings,
                alignmentSpace: viewerSettings.alignmentSpace === "local" ? "world" : "local",
              }))}
            title={viewerSettings.alignmentSpace === "local"
              ? copy.alignmentToWorldTitle
              : copy.alignmentToObjectTitle}
            type="button"
          >
            {viewerSettings.alignmentSpace === "local" ? copy.alignmentObjectShort : copy.alignmentWorldShort}
          </button>
        </div>
      ) : null}

      {props.cameraMode === "top" || !selectedTarget ? null : (
        <div className="mwv-footer">
          <div className="mwv-footer-copy">
            <span>
              {selectedTarget === "mesh"
                ? copy.meshSelected
                : selectedTarget === "plane"
                  ? copy.planeSelected
                  : copy.noSelection}
            </span>
            <span>{copy.cameraPerspective}</span>
            <span>
              {isLayFlatMode ? copy.layFlatMode : transformMode === "translate" ? copy.moveMode : copy.rotateMode}
            </span>
          </div>
          <div className="mwv-toolbar">
            <button
              className={`mwv-tool-button ${transformMode === "rotate" ? "mwv-is-active" : ""}`.trim()}
              onClick={() => activateTransformMode("rotate")}
              title={copy.rotateTitle}
              type="button"
            >
              {copy.rotateButton}
            </button>
            <button
              className={`mwv-tool-button ${transformMode === "translate" ? "mwv-is-active" : ""}`.trim()}
              onClick={() => activateTransformMode("translate")}
              title={copy.moveTitle}
              type="button"
            >
              {copy.moveButton}
            </button>
            {selectedTarget !== "plane" ? (
              <button
                className="mwv-tool-button"
                onClick={focusSelectionAndToggleLayFlat}
                title={copy.layFlatTitle}
                type="button"
              >
                {isLayFlatMode ? copy.hideFacesButton : copy.layFlatButton}
              </button>
            ) : null}
            {selectedTarget === "mesh" ? (
              <button
                className="mwv-tool-button"
                onClick={handleDropSelectedMeshToBuildplate}
                title={copy.dropToPlateTitle}
                type="button"
              >
                {copy.dropToPlateButton}
              </button>
            ) : null}
            <button
              className="mwv-tool-button"
              onClick={selectedTarget === "plane" ? props.onResetPlaneOrientation : props.onResetOrientation}
              title={selectedTarget === "plane"
                ? copy.resetPlaneTitle
                : copy.resetOrientationTitle}
              type="button"
            >
              {selectedTarget === "plane" ? copy.resetPlaneButton : copy.resetOrientationButton}
            </button>
            <button
              className="mwv-tool-button"
              onClick={handleResetCamera}
              title={copy.fitCameraTitle}
              type="button"
            >
              {copy.fitCameraButton}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
