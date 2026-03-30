import { useEffect, useRef, useState } from "preact/hooks";
import type { OrbitControls as OrbitControlsImpl } from "three/examples/jsm/controls/OrbitControls.js";
import type { TransformControls as TransformControlsImpl } from "three/examples/jsm/controls/TransformControls.js";
import type { BufferGeometry, Material, Mesh, Object3D, OrthographicCamera, PerspectiveCamera, Vector3 } from "three";
import { collectFlatFaceCandidates, type FlatFaceCandidate } from "../lib/flat-face-candidates";
import type {
  FocusOutlineRequest,
  PlaneState,
  PreparedMesh,
  PreviewOutlineLayer,
  RingSet2D,
  SceneSelectionTarget,
  TransformAlignmentMode,
} from "../lib/types";

const BUILD_PLATE_SIZE_MM = 254;
const AXIS_LENGTH = 28;
const AXIS_HEAD_LENGTH = 5;
const AXIS_HEAD_WIDTH = 2.5;
const AXIS_GIZMO_INSET_MM = 8;
const CLICK_MOVE_TOLERANCE = 6;
const FACE_MARKER_RADIUS = 4.6;
const PROJECTION_MODEL_ALPHA = 0.34;
const ROTATION_SNAP_DEGREES = 15;
const SELECTION_OUTLINE_NAME = "__mesh2cadSelectionOutline";
const TOP_VIEW_FIT_PADDING = 0.18;
const TOP_VIEW_MIN_SPAN = 8;
const SELECTABLE_LAYER = 1;
const GIZMO_LAYER = 2;
const HELPER_LAYER = 3;
type TransformMode = "rotate" | "translate";

type ViewerRuntime = {
  axisGizmo: import("three").Group;
  bedZWorld: number;
  buildPlate: import("three").Group;
  THREE: typeof import("three");
  camera: PerspectiveCamera;
  candidateTargets: import("three").Mesh[];
  controls: OrbitControlsImpl;
  faceCandidateHolder: import("three").Group;
  flatFaceCandidates: FlatFaceCandidate[];
  gizmoRaycaster: import("three").Raycaster;
  hoveredCandidate: import("three").Mesh | null;
  modelConversionGroup: import("three").Group;
  modelHolder: import("three").Group;
  modelTransformGroup: import("three").Group;
  overlayConversionGroup: import("three").Group;
  overlayPlacementGroup: import("three").Group;
  planeConversionGroup: import("three").Group;
  planeHolder: import("three").Group;
  planeTransformGroup: import("three").Group;
  pointerNdc: import("three").Vector2;
  projectionHolder: import("three").Group;
  raycaster: import("three").Raycaster;
  renderer: import("three").WebGLRenderer;
  resizeObserver: ResizeObserver;
  selectableObjects: Object3D[];
  scene: import("three").Scene;
  topCamera: OrthographicCamera;
  topControls: OrbitControlsImpl;
  transformControls: TransformControlsImpl;
  transformHelper: import("three").Object3D;
  worldUpAxis: "x" | "y" | "z";
};

type CameraMode = "perspective" | "top";

export function ModelViewer(props: {
  cameraMode: CameraMode;
  focusOutlineRequest: FocusOutlineRequest | null;
  highlightedProjectionRings: RingSet2D[] | null;
  isPreparing: boolean;
  mesh: PreparedMesh | null;
  offsetRings: RingSet2D[] | null;
  onBrowseRequest: () => void;
  onResetOrientation: () => void;
  onResetPlaneOrientation: () => void;
  onPlaneRotationChange: (rotationDegrees: [number, number, number]) => void;
  onPlaneTranslationChange: (translation: [number, number, number]) => void;
  onRotationChange: (rotationDegrees: [number, number, number]) => void;
  onSelectionChange: (target: SceneSelectionTarget) => void;
  onTransformAlignmentModeChange: (mode: TransformAlignmentMode) => void;
  onTranslationChange: (translation: [number, number, number]) => void;
  planeAnchorLocal: [number, number, number] | null;
  planeCutEnabled: boolean;
  planeState: PlaneState | null;
  projectionLayers: PreviewOutlineLayer[];
  rotationDegrees: [number, number, number];
  transformAlignmentMode: TransformAlignmentMode;
  translation: [number, number, number];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<ViewerRuntime | null>(null);
  const propsRef = useRef(props);
  const originalCentroidRef = useRef<Vector3 | null>(null);
  const lastFocusOutlineNonceRef = useRef<number | null>(null);
  const syncFromAppRef = useRef(false);
  const selectedSceneObjectRef = useRef<Object3D | null>(null);
  const selectedTargetRef = useRef<SceneSelectionTarget>(null);
  const layFlatModeRef = useRef(false);
  const transformModeRef = useRef<TransformMode>("rotate");
  const transformDragStartRef = useRef<{
    mode: TransformMode;
    rotationDegrees: [number, number, number];
    target: SceneSelectionTarget;
    translation: [number, number, number];
  } | null>(null);
  const gizmoHandlePointerRef = useRef(false);
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
  const [isLayFlatMode, setIsLayFlatMode] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<SceneSelectionTarget>(null);
  const [sceneReady, setSceneReady] = useState(false);
  const [transformMode, setTransformMode] = useState<TransformMode>("rotate");
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [viewerReady, setViewerReady] = useState(false);

  useEffect(() => {
    propsRef.current = props;
  }, [props]);

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
      propsRef.current.transformAlignmentMode,
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

  function updateTransformMode(nextMode: TransformMode) {
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
        propsRef.current.transformAlignmentMode,
      );
    }
  }

  function focusSelectionAndToggleLayFlat() {
    if (!propsRef.current.mesh || selectedTargetRef.current !== "mesh") {
      return;
    }

    updateLayFlatMode(!layFlatModeRef.current);
  }

  function activateTransformMode(nextMode: TransformMode) {
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
                propsRef.current.planeAnchorLocal,
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
          child.layers.enable(GIZMO_LAYER);
        });
        scene.add(transformHelper);
        const gizmoRaycaster = transformControls.getRaycaster();
        gizmoRaycaster.layers.set(GIZMO_LAYER);

        const raycaster = new THREE.Raycaster();
        const pointerNdc = new THREE.Vector2();

        const render = () => {
          if (cancelled) {
            return;
          }

          const useTopCamera = propsRef.current.cameraMode === "top";
          const activeCamera = useTopCamera ? runtimeRef.current?.topCamera ?? topCamera : camera;
          renderer.setClearColor(useTopCamera ? 0xf8fafc : 0x171713, 1);
          buildPlate.visible = !useTopCamera;
          axisGizmo.visible = !useTopCamera;
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
          runtime.raycaster.layers.set(HELPER_LAYER);
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
          getTransformControlsHelper(runtime)?.updateMatrixWorld(true);
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
            runtime.raycaster.layers.set(HELPER_LAYER);
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
          if (element?.closest(".viewer-toolbar, .viewer-side-tools")) {
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
          console.error("ModelViewer setup failed", error);
          setViewerError(
            error instanceof Error ? error.message : "The 3D preview could not be created.",
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
        !props.planeCutEnabled,
        props.projectionLayers,
        props.highlightedProjectionRings,
        props.offsetRings,
        centroid,
        groundedTranslation,
      );
      updateSectionPlaneOverlay(
        runtime,
        props.mesh,
        props.planeCutEnabled,
        props.planeState,
        props.projectionLayers,
        props.highlightedProjectionRings,
        props.offsetRings,
      );
      updateModelClippingState(runtime, props.mesh, props.planeCutEnabled, props.planeState, centroid);
      refreshSelectableObjects(runtime);
      setModelProjectionState(
        modelHolder,
        Boolean(props.projectionLayers.length || props.highlightedProjectionRings?.length || props.offsetRings?.length),
      );
      setModelSelectionState(THREE, modelHolder, false);
      setPlaneSelectionState(runtime.planeHolder, false);
      syncInteractionDecorations(runtime, selectedTargetRef.current === "mesh", layFlatModeRef.current);
      syncTransformControls(
        runtime,
        null,
        null,
        transformModeRef.current,
        props.transformAlignmentMode,
      );
      setViewerReady(true);
    } catch (error) {
      console.error("ModelViewer mesh load failed", error);
      setViewerError(
        error instanceof Error ? error.message : "The 3D preview could not be created.",
      );
    }
  }, [sceneReady, props.mesh]);

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

    applyTransformAlignmentMode(runtime, props.transformAlignmentMode);
    syncTransformControlsMatrices(runtime, selectedSceneObject);
    requestRender(runtime, props.cameraMode);
  }, [props.transformAlignmentMode, sceneReady]);

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
      props.transformAlignmentMode,
    );
  }, [
    sceneReady,
    props.mesh,
    props.planeCutEnabled,
    props.planeState,
    props.rotationDegrees,
    props.translation,
  ]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!sceneReady || !runtime) {
      return;
    }

    updateSectionPlaneOverlay(
      runtime,
      props.mesh,
      props.planeCutEnabled,
      props.planeState,
      props.projectionLayers,
      props.highlightedProjectionRings,
      props.offsetRings,
    );
    updateModelClippingState(runtime, props.mesh, props.planeCutEnabled, props.planeState, originalCentroidRef.current);
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
      !props.planeCutEnabled,
      props.projectionLayers,
      props.highlightedProjectionRings,
      props.offsetRings,
      centroid,
      props.translation,
    );
    setModelProjectionState(
      runtime.modelHolder,
      Boolean(props.projectionLayers.length || props.highlightedProjectionRings?.length || props.offsetRings?.length),
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

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!sceneReady || !runtime) {
      return;
    }

    requestRender(runtime, props.cameraMode);
  }, [sceneReady, props.cameraMode]);

  return (
    <div class="viewer-shell" ref={shellRef}>
      {!props.mesh ? (
        <div class="viewer-overlay">
          <div class="viewer-upload-card">
            <p class="viewer-placeholder-title">Drop mesh or browse</p>
            <p class="viewer-placeholder-copy">STL, OBJ, PLY, GLB, and 3MF</p>
            <button class="secondary-button" onClick={props.onBrowseRequest} type="button">
              Browse files
            </button>
          </div>
        </div>
      ) : null}

      {props.mesh && (props.isPreparing || (!viewerReady && !viewerError)) ? (
        <div class="viewer-overlay">
          <p class="viewer-placeholder-title">Preparing 3D preview</p>
          <p class="viewer-placeholder-copy">Building the viewer scene.</p>
        </div>
      ) : null}

      {viewerError ? (
        <div class="viewer-overlay">
          <p class="viewer-placeholder-title">Viewer error</p>
          <p class="viewer-placeholder-copy">{viewerError}</p>
        </div>
      ) : null}

      <div class="viewer-canvas-host" ref={containerRef}>
        <canvas class="viewer-canvas" ref={canvasRef} />
      </div>

      {props.mesh && props.cameraMode !== "top" ? (
        <div class="viewer-side-tools">
          <button
            class={`viewer-tool-button viewer-side-tool-button ${props.transformAlignmentMode === "world" ? "is-active" : ""}`}
            onClick={() =>
              props.onTransformAlignmentModeChange(
                props.transformAlignmentMode === "local" ? "world" : "local",
              )}
            title={props.transformAlignmentMode === "local"
              ? "Switch gizmo alignment to world axes."
              : "Switch gizmo alignment to object axes."}
            type="button"
          >
            {props.transformAlignmentMode === "local" ? "OBJ" : "WORLD"}
          </button>
        </div>
      ) : null}

      {props.cameraMode === "top" || !selectedTarget ? null : (
        <div class="viewer-footer glass">
          <div class="viewer-footer-copy">
            <span>
              {selectedTarget === "mesh"
                ? "Mesh selected"
                : selectedTarget === "plane"
                  ? "Plane selected"
                  : "No selection"}
            </span>
            <span>Perspective</span>
            <span>
              {isLayFlatMode ? "Lay flat" : transformMode === "translate" ? "Move" : "Rotate"}
            </span>
          </div>
          <div class="viewer-toolbar">
            <button
              class={`viewer-tool-button ${transformMode === "rotate" ? "is-active" : ""}`}
              onClick={() => activateTransformMode("rotate")}
              title="Rotate mode (r)"
              type="button"
            >
              Rotate (r)
            </button>
            <button
              class={`viewer-tool-button ${transformMode === "translate" ? "is-active" : ""}`}
              onClick={() => activateTransformMode("translate")}
              title="Move mode (t)"
              type="button"
            >
              Move (t)
            </button>
            {selectedTarget !== "plane" ? (
              <button
                class="viewer-tool-button"
                onClick={focusSelectionAndToggleLayFlat}
                title="Show or hide lay-flat face candidates (f)"
                type="button"
              >
                {isLayFlatMode ? "Hide Faces (f)" : "Lay Flat (f)"}
              </button>
            ) : null}
            {selectedTarget === "mesh" ? (
              <button
                class="viewer-tool-button"
                onClick={handleDropSelectedMeshToBuildplate}
                title="Drop the selected mesh straight onto the buildplate"
                type="button"
              >
                Drop to Plate
              </button>
            ) : null}
            <button
              class="viewer-tool-button"
              onClick={selectedTarget === "plane" ? props.onResetPlaneOrientation : props.onResetOrientation}
              title={selectedTarget === "plane"
                ? "Reset the cut plane rotation"
                : "Reset to the original loaded orientation"}
              type="button"
            >
              {selectedTarget === "plane" ? "Reset Plane" : "Reset Orientation"}
            </button>
            <button
              class="viewer-tool-button"
              onClick={handleResetCamera}
              title="Refit the camera to the model"
              type="button"
            >
              Fit Camera
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function syncInteractionDecorations(
  runtime: ViewerRuntime,
  selected: boolean,
  layFlatMode: boolean,
) {
  runtime.faceCandidateHolder.visible = selected && layFlatMode && runtime.candidateTargets.length > 0;
  if (!runtime.faceCandidateHolder.visible) {
    setHoveredCandidate(runtime, null);
  }
}

function syncTransformControls(
  runtime: ViewerRuntime,
  selectedTarget: SceneSelectionTarget,
  selectedSceneObject: Object3D | null,
  mode: TransformMode,
  alignmentMode: TransformAlignmentMode,
) {
  runtime.transformControls.enabled = selectedTarget !== null && selectedSceneObject !== null;
  if (!selectedTarget || !selectedSceneObject) {
    runtime.transformControls.detach();
    setRotationSnap(runtime, false);
    return;
  }

  runtime.transformControls.setMode(mode);
  applyTransformAlignmentMode(runtime, alignmentMode);
  const transformControls = runtime.transformControls as TransformControlsImpl & {
    object?: Object3D | null;
  };
  if (transformControls.object !== selectedSceneObject) {
    runtime.transformControls.attach(selectedSceneObject);
  }
  syncTransformControlsMatrices(runtime, selectedSceneObject);
}

function applyTransformAlignmentMode(
  runtime: ViewerRuntime,
  alignmentMode: TransformAlignmentMode,
) {
  const space = alignmentMode === "world" ? "world" : "local";
  const transformControls = runtime.transformControls as TransformControlsImpl & {
    setSpace?: (value: "local" | "world") => void;
    space?: "local" | "world";
  };
  if (typeof transformControls.setSpace === "function") {
    transformControls.setSpace(space);
  }
  transformControls.space = space;
}

function refreshSelectableObjects(runtime: ViewerRuntime) {
  const selectableObjects: Object3D[] = [];

  tagSelectableObjects(runtime.modelHolder, "mesh", selectableObjects);
  tagSelectableObjects(runtime.planeHolder, "plane", selectableObjects);

  runtime.selectableObjects = selectableObjects;
}

function tagSelectableObjects(
  root: Object3D,
  selectionTarget: Exclude<SceneSelectionTarget, null>,
  selectableObjects: Object3D[],
) {
  root.traverse((child) => {
    if (!isSelectableRenderable(child) || isPassiveHelperObject(child)) {
      return;
    }

    child.userData.selectionTarget = selectionTarget;
    child.layers.enable(SELECTABLE_LAYER);
    selectableObjects.push(child);
  });
}

function isSelectableRenderable(object: Object3D): boolean {
  return (
    "isMesh" in object
    || "isLine" in object
    || "isLineLoop" in object
    || "isLineSegments" in object
  );
}

function getSelectionTargetForObject(object: Object3D): SceneSelectionTarget {
  let current: Object3D | null = object;
  while (current) {
    const selectionTarget = current.userData.selectionTarget as SceneSelectionTarget | undefined;
    if (selectionTarget) {
      return selectionTarget;
    }
    current = current.parent;
  }
  return null;
}

function isPassiveHelperObject(object: Object3D): boolean {
  let current: Object3D | null = object;
  while (current) {
    if (current.userData.helperOnly) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function isObjectInteractable(object: Object3D): boolean {
  let current: Object3D | null = object;
  while (current) {
    if (!current.visible) {
      return false;
    }
    current = current.parent;
  }
  return true;
}

function getSelectedSceneObject(
  runtime: ViewerRuntime,
  selectedTarget: Exclude<SceneSelectionTarget, null>,
) {
  return selectedTarget === "plane" ? runtime.planeTransformGroup : runtime.modelTransformGroup;
}

function pickViewportTargetAtPoint(
  runtime: ViewerRuntime,
  clientX: number,
  clientY: number,
  container: HTMLDivElement,
  cameraMode: CameraMode,
): "empty" | "gizmo" | "selectable" {
  setRayFromPointer(runtime, clientX, clientY, container, cameraMode);
  const activeCamera = cameraMode === "top" ? runtime.topCamera : runtime.camera;
  runtime.gizmoRaycaster.setFromCamera(runtime.pointerNdc, activeCamera);

  const attachedTransformObject = (runtime.transformControls as TransformControlsImpl & {
    object?: Object3D | null;
  }).object;
  const gizmoHit = runtime.transformControls.enabled && attachedTransformObject
    ? runtime.gizmoRaycaster
      .intersectObject(runtime.transformHelper, true)
      .find((hit) => isObjectInteractable(hit.object))
    : null;
  if (gizmoHit) {
    return "gizmo";
  }

  if (pickSelectableObjectAtPoint(runtime, clientX, clientY, container, cameraMode)) {
    return "selectable";
  }

  return "empty";
}

function getTransformControlsHelper(runtime: ViewerRuntime) {
  return (runtime.transformControls as TransformControlsImpl & {
    getHelper?: () => Object3D | null;
  }).getHelper?.() ?? runtime.transformHelper ?? null;
}

function isTransformControlsDragging(runtime: ViewerRuntime) {
  return Boolean((runtime.transformControls as TransformControlsImpl & {
    dragging?: boolean;
  }).dragging);
}

function pickSelectableObjectAtPoint(
  runtime: ViewerRuntime,
  clientX: number,
  clientY: number,
  container: HTMLDivElement,
  cameraMode: CameraMode,
): Object3D | null {
  setRayFromPointer(runtime, clientX, clientY, container, cameraMode);
  runtime.raycaster.layers.set(SELECTABLE_LAYER);
  return runtime.raycaster
    .intersectObjects(runtime.selectableObjects, true)
    .find((hit) => isObjectInteractable(hit.object) && getSelectionTargetForObject(hit.object) !== null)
    ?.object ?? null;
}

function requestRender(runtime: ViewerRuntime, cameraMode: CameraMode) {
  const width = runtime.renderer.domElement.clientWidth || 1;
  const height = runtime.renderer.domElement.clientHeight || 1;
  runtime.renderer.setScissorTest(false);
  runtime.renderer.setViewport(0, 0, width, height);
  runtime.renderer.render(
    runtime.scene,
    cameraMode === "top" ? runtime.topCamera : runtime.camera,
  );
}

function syncTransformControlsMatrices(
  runtime: ViewerRuntime,
  selectedSceneObject: Object3D | null,
) {
  selectedSceneObject?.updateMatrixWorld(true);
  getTransformControlsHelper(runtime)?.updateMatrixWorld(true);
  runtime.scene.updateMatrixWorld(true);
}

function setRotationSnap(runtime: ViewerRuntime | null, enabled: boolean) {
  if (!runtime || !runtime.transformControls.enabled || runtime.transformControls.mode !== "rotate") {
    return;
  }

  const snapValue = enabled ? runtime.THREE.MathUtils.degToRad(ROTATION_SNAP_DEGREES) : null;
  const transformControls = runtime.transformControls as TransformControlsImpl & {
    rotationSnap?: number | null;
    setRotationSnap?: (value: number | null) => void;
  };
  if (typeof transformControls.setRotationSnap === "function") {
    transformControls.setRotationSnap(snapValue);
    return;
  }
  transformControls.rotationSnap = snapValue;
}

function setRayFromPointer(
  runtime: ViewerRuntime,
  clientX: number,
  clientY: number,
  container: HTMLDivElement,
  cameraMode: CameraMode,
) {
  const rect = container.getBoundingClientRect();
  runtime.pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  runtime.pointerNdc.y = -(((clientY - rect.top) / rect.height) * 2 - 1);
  const activeCamera = cameraMode === "top" ? runtime.topCamera : runtime.camera;
  runtime.raycaster.setFromCamera(runtime.pointerNdc, activeCamera);
}

function updateOverlayPlacement(
  runtime: ViewerRuntime,
  translation: [number, number, number],
) {
  runtime.overlayPlacementGroup.position.set(translation[0], translation[1], 0);
}

function planeTranslationFromGroup(
  planeTransformGroup: import("three").Group,
  planeAnchorLocal: [number, number, number] | null,
): [number, number, number] {
  if (!planeAnchorLocal) {
    return [0, 0, 0];
  }

  return [
    normalizeTranslation(planeTransformGroup.position.x - planeAnchorLocal[0]),
    normalizeTranslation(planeTransformGroup.position.y - planeAnchorLocal[1]),
    normalizeTranslation(planeTransformGroup.position.z - planeAnchorLocal[2]),
  ];
}

function applyLayFlatCandidate(runtime: ViewerRuntime, candidate: FlatFaceCandidate) {
  const { THREE, modelTransformGroup } = runtime;
  const currentQuaternion = modelTransformGroup.quaternion.clone();
  const currentNormal = new THREE.Vector3(...candidate.normal).normalize().applyQuaternion(currentQuaternion);
  const targetNormal = new THREE.Vector3(0, 0, -1);
  const correction = new THREE.Quaternion().setFromUnitVectors(currentNormal, targetNormal);
  modelTransformGroup.quaternion.copy(correction.multiply(currentQuaternion));
  modelTransformGroup.rotation.setFromQuaternion(modelTransformGroup.quaternion, "XYZ");
  syncPlacementToPlate(
    THREE,
    runtime.modelConversionGroup,
    modelTransformGroup,
    runtime.modelHolder,
    translationFromGroup(modelTransformGroup),
  );
}

function buildFaceCandidateMarkers(runtime: ViewerRuntime) {
  clearGroup(runtime.faceCandidateHolder);
  runtime.candidateTargets = [];

  const { THREE } = runtime;
  for (const candidate of runtime.flatFaceCandidates) {
    const normal = new THREE.Vector3(...candidate.normal).normalize();
    const centroid = new THREE.Vector3(...candidate.centroid);
    const offset = centroid.clone().addScaledVector(normal, 0.55);

    const group = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(FACE_MARKER_RADIUS * 0.66, FACE_MARKER_RADIUS, 32),
      new THREE.MeshBasicMaterial({
        color: 0x3b82f6,
        depthWrite: false,
        opacity: 0.95,
        side: THREE.DoubleSide,
        transparent: true,
      }),
    );
    const core = new THREE.Mesh(
      new THREE.CircleGeometry(FACE_MARKER_RADIUS * 0.62, 32),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        depthWrite: false,
        opacity: 0.96,
        side: THREE.DoubleSide,
        transparent: true,
      }),
    );

    group.position.copy(offset);
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    group.userData.candidate = candidate;

    ring.userData.candidate = candidate;
    ring.userData.baseColor = 0x3b82f6;
    ring.userData.hoverColor = 0xef4444;
    ring.layers.enable(HELPER_LAYER);
    core.userData.candidate = candidate;
    core.userData.baseColor = 0xffffff;
    core.userData.hoverColor = 0xfca5a5;
    core.layers.enable(HELPER_LAYER);
    group.add(ring);
    group.add(core);
    runtime.faceCandidateHolder.add(group);
    runtime.candidateTargets.push(ring, core);
  }

  runtime.faceCandidateHolder.visible = false;
}

function setHoveredCandidate(runtime: ViewerRuntime, nextHovered: Mesh | null) {
  if (runtime.hoveredCandidate === nextHovered) {
    return;
  }

  if (runtime.hoveredCandidate) {
    highlightCandidate(runtime.hoveredCandidate, false);
  }
  runtime.hoveredCandidate = nextHovered;
  if (runtime.hoveredCandidate) {
    highlightCandidate(runtime.hoveredCandidate, true);
  }
}

function highlightCandidate(mesh: Mesh, hovered: boolean) {
  const material = mesh.material as Material & {
    color?: { set: (value: number) => void };
    opacity?: number;
  };
  mesh.scale.setScalar(hovered ? 1.22 : 1);
  if (material.color?.set) {
    material.color.set(
      hovered ? Number(mesh.userData.hoverColor ?? 0xef4444) : Number(mesh.userData.baseColor ?? 0x3b82f6),
    );
  }
  if (typeof material.opacity === "number") {
    material.opacity = hovered ? 1 : 0.95;
  }
}

function updateProjectionOverlay(
  runtime: ViewerRuntime,
  enabled: boolean,
  projectionLayers: PreviewOutlineLayer[],
  highlightedProjectionRings: RingSet2D[] | null,
  offsetRings: RingSet2D[] | null,
  originalCenter: Vector3,
  translation: [number, number, number],
) {
  clearGroup(runtime.projectionHolder);
  if (!enabled) {
    return;
  }

  const overlay = createProjectionOverlay(
    runtime.THREE,
    projectionLayers,
    highlightedProjectionRings,
    offsetRings,
    originalCenter,
  );
  if (overlay) {
    runtime.projectionHolder.add(overlay);
  }
  updateOverlayPlacement(runtime, translation);
}

function updateSectionPlaneOverlay(
  runtime: ViewerRuntime,
  mesh: PreparedMesh | null,
  enabled: boolean,
  planeState: PlaneState | null,
  projectionLayers: PreviewOutlineLayer[],
  highlightedProjectionRings: RingSet2D[] | null,
  offsetRings: RingSet2D[] | null,
) {
  clearGroup(runtime.planeHolder);
  if (!mesh || !enabled || !planeState) {
    runtime.planeHolder.visible = false;
    return;
  }

  const planeVisual = createSectionPlaneVisual(runtime.THREE, mesh);
  runtime.planeHolder.add(planeVisual);
  const overlay = createProjectionOverlay(
    runtime.THREE,
    projectionLayers,
    highlightedProjectionRings,
    offsetRings,
    null,
  );
  if (overlay) {
    overlay.userData.helperOnly = true;
    runtime.planeHolder.add(overlay);
  }
  runtime.planeHolder.visible = true;

  runtime.planeConversionGroup.position.copy(runtime.modelConversionGroup.position);
  applyPlaneStateToGroup(runtime.THREE, runtime.planeTransformGroup, planeState);
  applyTranslation(runtime.planeTransformGroup, [
    planeState.originWorld[0] - mesh.centroid[0],
    planeState.originWorld[1] - mesh.centroid[1],
    planeState.originWorld[2] - mesh.centroid[2],
  ]);
}

function applyPlaneStateToGroup(
  THREE: typeof import("three"),
  group: import("three").Group,
  planeState: PlaneState,
) {
  const basisX = new THREE.Vector3(...planeState.basisUWorld).normalize();
  const basisY = new THREE.Vector3(...planeState.basisVWorld).normalize();
  const basisZ = new THREE.Vector3(...planeState.normalWorld).normalize();
  const matrix = new THREE.Matrix4().makeBasis(basisX, basisY, basisZ);
  group.quaternion.setFromRotationMatrix(matrix);
  group.rotation.setFromQuaternion(group.quaternion, "XYZ");
}

function updateModelClippingState(
  runtime: ViewerRuntime,
  mesh: PreparedMesh | null,
  enabled: boolean,
  planeState: PlaneState | null,
  originalCenter: Vector3 | null,
) {
  const clippingPlane = enabled && mesh && planeState && originalCenter
    ? createViewerClipPlane(runtime, planeState, originalCenter)
    : null;

  runtime.modelHolder.traverse((child) => {
    if (!("isMesh" in child) || !child.isMesh) {
      return;
    }

    const meshNode = child as Mesh;
    const materials = Array.isArray(meshNode.material) ? meshNode.material : [meshNode.material];
    for (const material of materials) {
      const clippingMaterial = material as Material & {
        clipShadows?: boolean;
        clippingPlanes?: import("three").Plane[] | null;
        needsUpdate?: boolean;
      };
      clippingMaterial.clippingPlanes = clippingPlane ? [clippingPlane] : [];
      clippingMaterial.clipShadows = Boolean(clippingPlane);
      clippingMaterial.needsUpdate = true;
    }
  });
}

function createViewerClipPlane(
  runtime: ViewerRuntime,
  planeState: PlaneState,
  originalCenter: Vector3,
) {
  const planePointLocal = new runtime.THREE.Vector3(
    planeState.originWorld[0] - originalCenter.x,
    planeState.originWorld[1] - originalCenter.y,
    planeState.originWorld[2] - originalCenter.z,
  );
  const planePointWorld = runtime.modelConversionGroup.localToWorld(planePointLocal);
  const planeNormalWorld = new runtime.THREE.Vector3(...planeState.normalWorld)
    .applyQuaternion(runtime.modelConversionGroup.quaternion)
    .normalize();

  return new runtime.THREE.Plane().setFromNormalAndCoplanarPoint(planeNormalWorld, planePointWorld);
}

function createSectionPlaneVisual(
  THREE: typeof import("three"),
  mesh: PreparedMesh,
) {
  const group = new THREE.Group();
  const planeSize = Math.max(mesh.extents[0], mesh.extents[1], mesh.extents[2], 40) * 1.35;

  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(planeSize, planeSize),
    new THREE.MeshBasicMaterial({
      color: 0x8c9a8b,
      depthWrite: false,
      opacity: 0.12,
      side: THREE.DoubleSide,
      transparent: true,
    }),
  );
  fill.userData.selectionStyle = {
    baseColor: 0x8c9a8b,
    baseOpacity: 0.12,
    selectedColor: 0x556b5d,
    selectedOpacity: 0.22,
  };
  group.add(fill);

  const border = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-planeSize / 2, -planeSize / 2, 0.02),
      new THREE.Vector3(planeSize / 2, -planeSize / 2, 0.02),
      new THREE.Vector3(planeSize / 2, planeSize / 2, 0.02),
      new THREE.Vector3(-planeSize / 2, planeSize / 2, 0.02),
    ]),
    new THREE.LineBasicMaterial({
      color: 0x6c7a69,
      depthTest: false,
      opacity: 0.86,
      transparent: true,
    }),
  );
  border.userData.selectionStyle = {
    baseColor: 0x6c7a69,
    baseOpacity: 0.86,
    selectedColor: 0x34463b,
    selectedOpacity: 1,
  };
  border.renderOrder = 4;
  group.add(border);

  const crossHair = new THREE.Group();
  crossHair.add(
    new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-planeSize * 0.12, 0, 0.025),
        new THREE.Vector3(planeSize * 0.12, 0, 0.025),
      ]),
      new THREE.LineBasicMaterial({ color: 0x7b8577, depthTest: false, opacity: 0.8, transparent: true }),
    ),
  );
  crossHair.add(
    new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, -planeSize * 0.12, 0.025),
        new THREE.Vector3(0, planeSize * 0.12, 0.025),
      ]),
      new THREE.LineBasicMaterial({ color: 0x7b8577, depthTest: false, opacity: 0.8, transparent: true }),
    ),
  );
  crossHair.traverse((child) => {
    child.userData.selectionStyle = {
      baseColor: 0x7b8577,
      baseOpacity: 0.8,
      selectedColor: 0x34463b,
      selectedOpacity: 1,
    };
  });
  crossHair.renderOrder = 4;
  group.add(crossHair);

  return group;
}

function createBuildPlate(THREE: typeof import("three"), plateSize: number) {
  const group = new THREE.Group();
  const half = plateSize / 2;

  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(plateSize, plateSize),
    new THREE.MeshStandardMaterial({ color: 0x2a2d25, roughness: 0.88, metalness: 0.04 }),
  );
  plate.receiveShadow = true;
  plate.rotation.x = -Math.PI / 2;
  group.add(plate);

  const grid = new THREE.GridHelper(plateSize, 20, 0x666d5f, 0x40463d);
  group.add(grid);

  group.add(
    new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-half, 0, -half),
        new THREE.Vector3(half, 0, -half),
        new THREE.Vector3(half, 0, half),
        new THREE.Vector3(-half, 0, half),
        new THREE.Vector3(-half, 0, -half),
      ]),
      new THREE.LineBasicMaterial({ color: 0x8a917f }),
    ),
  );

  return group;
}

function buildAxisGizmo(
  THREE: typeof import("three"),
  origin: Vector3,
) {
  const group = new THREE.Group();
  group.position.copy(origin);

  const axes: [Vector3, number, string][] = [
    [new THREE.Vector3(1, 0, 0), 0xff3333, "X"],
    [new THREE.Vector3(0, 1, 0), 0x33dd33, "Z"],
    [new THREE.Vector3(0, 0, -1), 0x3399ff, "Y"],
  ];

  for (const [direction, color, label] of axes) {
    group.add(
      new THREE.ArrowHelper(
        direction,
        new THREE.Vector3(0, 0, 0),
        AXIS_LENGTH,
        color,
        AXIS_HEAD_LENGTH,
        AXIS_HEAD_WIDTH,
      ),
    );

    const sprite = makeAxisLabel(THREE, label, `#${color.toString(16).padStart(6, "0")}`);
    sprite.position.copy(direction.clone().multiplyScalar(AXIS_LENGTH + 6));
    group.add(sprite);
  }

  group.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(2, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    ),
  );

  return group;
}

function makeAxisLabel(
  THREE: typeof import("three"),
  text: string,
  color: string,
) {
  const canvas = document.createElement("canvas");
  canvas.width = 112;
  canvas.height = 112;
  const context = canvas.getContext("2d");
  if (!context) {
    return new THREE.Sprite();
  }

  context.fillStyle = color;
  context.beginPath();
  context.arc(56, 56, 38, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#ffffff";
  context.font = "700 48px 'IBM Plex Mono'";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 56, 58);

  const material = new THREE.SpriteMaterial({
    depthTest: false,
    map: new THREE.CanvasTexture(canvas),
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(9, 9, 1);
  return sprite;
}

function createProjectionOverlay(
  THREE: typeof import("three"),
  projectionLayers: PreviewOutlineLayer[],
  highlightedProjectionRings: RingSet2D[] | null,
  offsetRings: RingSet2D[] | null,
  originalCenter: Vector3 | null,
) {
  if (!projectionLayers.length && !highlightedProjectionRings?.length && !offsetRings?.length) {
    return null;
  }

  const group = new THREE.Group();

  if (projectionLayers.length) {
    for (const projectionLayer of projectionLayers) {
      addOutlineLayer(group, THREE, projectionLayer.rings, originalCenter, {
        color: toThreeHex(THREE, projectionLayer.color),
        dashed: Boolean(offsetRings?.length),
        opacity: projectionLayer.dimmed ? 0.28 : 0.96,
        zOffset: projectionLayer.dimmed ? 0.17 : 0.18,
      });
    }
  }

  if (highlightedProjectionRings?.length) {
    addOutlineLayer(group, THREE, highlightedProjectionRings, originalCenter, {
      color: 0xf8fafc,
      dashed: false,
      opacity: 1,
      zOffset: 0.205,
    });
  }

  if (offsetRings?.length) {
    addOutlineLayer(group, THREE, offsetRings, originalCenter, {
      color: 0x16a34a,
      dashed: false,
      opacity: 0.98,
      zOffset: 0.24,
    });
  }

  return group;
}

function addOutlineLayer(
  group: import("three").Group,
  THREE: typeof import("three"),
  rings: RingSet2D[],
  originalCenter: Vector3 | null,
  options: {
    color: number;
    dashed: boolean;
    opacity: number;
    zOffset: number;
  },
) {
  for (const ringSet of rings) {
    addRingLoop(group, THREE, ringSet.exterior, originalCenter, options);
    for (const hole of ringSet.holes) {
      addRingLoop(group, THREE, hole, originalCenter, options);
    }
  }
}

function addRingLoop(
  group: import("three").Group,
  THREE: typeof import("three"),
  points: [number, number][],
  originalCenter: Vector3 | null,
  options: {
    color: number;
    dashed: boolean;
    opacity: number;
    zOffset: number;
  },
) {
  if (points.length < 3) {
    return;
  }

  const loopPoints = points.map(
    ([x, y]) => new THREE.Vector3(
      x - (originalCenter?.x ?? 0),
      y - (originalCenter?.y ?? 0),
      options.zOffset,
    ),
  );
  loopPoints.push(loopPoints[0].clone());

  const geometry = new THREE.BufferGeometry().setFromPoints(loopPoints);
  const material = options.dashed
    ? new THREE.LineDashedMaterial({
      color: options.color,
      dashSize: 2.2,
      depthTest: false,
      gapSize: 1.5,
      opacity: options.opacity,
      transparent: true,
    })
    : new THREE.LineBasicMaterial({
      color: options.color,
      depthTest: false,
      opacity: options.opacity,
      transparent: true,
    });
  const line = new THREE.Line(geometry, material);
  if ("computeLineDistances" in line && typeof line.computeLineDistances === "function") {
    line.computeLineDistances();
  }
  line.renderOrder = 5;
  group.add(line);
}

function toThreeHex(THREE: typeof import("three"), value: string): number {
  return new THREE.Color(value).getHex();
}

function prepareViewerObject(object3d: Object3D, THREE: typeof import("three")) {
  object3d.traverse((child) => {
    if (!("isMesh" in child) || !child.isMesh) {
      return;
    }

    const mesh = child as Mesh;
    if (!mesh.geometry.getAttribute("normal")) {
      mesh.geometry.computeVertexNormals();
    }

    mesh.material = cloneMaterial(mesh.material, THREE);
  });
}

function cloneMaterial(
  material: Material | Material[],
  THREE: typeof import("three"),
): Material | Material[] {
  if (Array.isArray(material)) {
    return material.map((entry) => cloneMaterial(entry, THREE) as Material);
  }

  const cloned = material.clone();
  const withOpacity = cloned as Material & {
    depthWrite?: boolean;
    emissive?: { getHex?: () => number; set?: (value: number) => void };
    emissiveIntensity?: number;
    opacity?: number;
    transparent?: boolean;
    userData: Record<string, unknown>;
  };
  withOpacity.userData = {
    ...withOpacity.userData,
    baseEmissive: withOpacity.emissive?.getHex?.() ?? 0,
    baseEmissiveIntensity: withOpacity.emissiveIntensity ?? 0,
    baseOpacity: withOpacity.opacity ?? 1,
  };
  withOpacity.transparent = Boolean(withOpacity.transparent || (withOpacity.opacity ?? 1) < 1);
  withOpacity.depthWrite = true;
  return cloned;
}

function enableMeshShadows(object3d: Object3D) {
  object3d.traverse((child) => {
    if (!("isMesh" in child) || !child.isMesh) {
      return;
    }

    const mesh = child as Mesh;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
}

function setModelProjectionState(object3d: Object3D, hasProjection: boolean) {
  const opacityFactor = hasProjection ? PROJECTION_MODEL_ALPHA : 1;

  object3d.traverse((child) => {
    if (!("isMesh" in child) || !child.isMesh) {
      return;
    }

    const mesh = child as Mesh;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      const withOpacity = material as Material & {
        depthWrite?: boolean;
        opacity?: number;
        transparent?: boolean;
        userData?: Record<string, unknown>;
      };
      const baseOpacity = Number(withOpacity.userData?.baseOpacity ?? withOpacity.opacity ?? 1);
      withOpacity.opacity = baseOpacity * opacityFactor;
      withOpacity.transparent = opacityFactor < 0.999 || baseOpacity < 1;
      withOpacity.depthWrite = opacityFactor > 0.7;
    }
  });
}

function setModelSelectionState(
  THREE: typeof import("three"),
  object3d: Object3D,
  selected: boolean,
) {
  object3d.traverse((child) => {
    if (!("isMesh" in child) || !child.isMesh) {
      return;
    }

    const mesh = child as Mesh;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      const standardMaterial = material as Material & {
        emissive?: { set: (value: number) => void };
        emissiveIntensity?: number;
        userData?: Record<string, unknown>;
      };
      if (!standardMaterial.userData) {
        standardMaterial.userData = {};
      }
      if (standardMaterial.emissive?.set) {
        const baseEmissive = Number(standardMaterial.userData.baseEmissive ?? 0);
        const baseIntensity = Number(standardMaterial.userData.baseEmissiveIntensity ?? 0);
        standardMaterial.emissive.set(selected ? 0x60a5fa : baseEmissive);
        standardMaterial.emissiveIntensity = selected ? 0.34 : baseIntensity;
      }
    }

    for (const childNode of [...mesh.children]) {
      if (childNode.name === SELECTION_OUTLINE_NAME) {
        mesh.remove(childNode);
        disposeObject3D(childNode);
      }
    }

    if (!selected) {
      return;
    }

    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry, 18),
      new THREE.LineBasicMaterial({
        color: 0xbfdbfe,
        depthWrite: false,
        opacity: 0.9,
        transparent: true,
      }),
    );
    outline.name = SELECTION_OUTLINE_NAME;
    outline.userData.helperOnly = true;
    outline.layers.enable(HELPER_LAYER);
    outline.renderOrder = 6;
    mesh.add(outline);
  });
}

function setPlaneSelectionState(
  object3d: Object3D,
  selected: boolean,
) {
  object3d.traverse((child) => {
    const selectionStyle = child.userData.selectionStyle as
      | {
        baseColor: number;
        baseOpacity: number;
        selectedColor: number;
        selectedOpacity: number;
      }
      | undefined;
    if (!selectionStyle) {
      return;
    }

    const materialValue = "material" in child
      ? (child as Mesh).material
      : null;
    const materials = !materialValue
      ? []
      : Array.isArray(materialValue)
        ? materialValue
        : [materialValue];

    for (const material of materials) {
      const styledMaterial = material as Material & {
        color?: { set: (value: number) => void };
        opacity?: number;
        transparent?: boolean;
      };
      styledMaterial.color?.set(selected ? selectionStyle.selectedColor : selectionStyle.baseColor);
      if (typeof styledMaterial.opacity === "number") {
        styledMaterial.opacity = selected ? selectionStyle.selectedOpacity : selectionStyle.baseOpacity;
      }
      styledMaterial.transparent = true;
    }
  });
}

function applyRotation(
  THREE: typeof import("three"),
  transformGroup: import("three").Group,
  rotationDegrees: [number, number, number],
) {
  transformGroup.rotation.set(
    THREE.MathUtils.degToRad(rotationDegrees[0]),
    THREE.MathUtils.degToRad(rotationDegrees[1]),
    THREE.MathUtils.degToRad(rotationDegrees[2]),
  );
}

function applyTranslation(
  transformGroup: import("three").Group,
  translation: [number, number, number],
) {
  transformGroup.position.set(translation[0], translation[1], translation[2]);
}

function syncPlacementToPlate(
  _THREE: typeof import("three"),
  modelConversionGroup: import("three").Group,
  transformGroup: import("three").Group,
  _boundsTarget: Object3D,
  translation: [number, number, number],
) {
  transformGroup.position.set(translation[0], translation[1], translation[2]);
  modelConversionGroup.position.set(0, 0, 0);
  transformGroup.updateMatrixWorld(true);
  modelConversionGroup.updateMatrixWorld(true);
}

function getWorldUpAxis(runtime: ViewerRuntime): "x" | "y" | "z" {
  return runtime.worldUpAxis;
}

function getBedPlaneWorld(runtime: ViewerRuntime): { axis: "x" | "y" | "z"; bedZWorld: number } {
  return {
    axis: getWorldUpAxis(runtime),
    bedZWorld: runtime.bedZWorld,
  };
}

function computeSelectionOrSceneWorldBounds(
  THREE: typeof import("three"),
  target: Object3D,
) {
  updateObjectWorldMatrices(target);
  const bounds = new THREE.Box3();
  const childBounds = new THREE.Box3();
  let hasRenderable = false;

  target.traverse((child) => {
    if (!child.visible || isPassiveHelperObject(child)) {
      return;
    }

    const geometry = getRenderableGeometry(child);
    if (!geometry) {
      return;
    }

    if (!geometry.boundingBox) {
      geometry.computeBoundingBox();
    }
    if (!geometry.boundingBox) {
      return;
    }

    childBounds.copy(geometry.boundingBox).applyMatrix4(child.matrixWorld);
    if (!hasRenderable) {
      bounds.copy(childBounds);
      hasRenderable = true;
      return;
    }
    bounds.union(childBounds);
  });

  return hasRenderable ? bounds : bounds.makeEmpty();
}

function computeVisibleMeshWorldBounds(
  THREE: typeof import("three"),
  target: Object3D,
) {
  updateObjectWorldMatrices(target);
  const bounds = new THREE.Box3();
  const childBounds = new THREE.Box3();
  let hasRenderable = false;

  target.traverse((child) => {
    if (!child.visible || isPassiveHelperObject(child)) {
      return;
    }

    const geometry = getMeshGeometry(child);
    if (!geometry) {
      return;
    }

    if (!geometry.boundingBox) {
      geometry.computeBoundingBox();
    }
    if (!geometry.boundingBox) {
      return;
    }

    childBounds.copy(geometry.boundingBox).applyMatrix4(child.matrixWorld);
    if (!hasRenderable) {
      bounds.copy(childBounds);
      hasRenderable = true;
      return;
    }
    bounds.union(childBounds);
  });

  return hasRenderable ? bounds : bounds.makeEmpty();
}

function updateObjectWorldMatrices(target: Object3D) {
  const worldMatrixTarget = target as Object3D & {
    updateWorldMatrix?: (updateParents: boolean, updateChildren: boolean) => void;
  };
  if (typeof worldMatrixTarget.updateWorldMatrix === "function") {
    worldMatrixTarget.updateWorldMatrix(true, true);
    return;
  }

  let root: Object3D = target;
  while (root.parent) {
    root = root.parent;
  }
  root.updateMatrixWorld(true);
}

function getRenderableGeometry(object: Object3D): BufferGeometry | null {
  const renderable = object as Object3D & {
    geometry?: BufferGeometry;
    isLine?: boolean;
    isLineLoop?: boolean;
    isLineSegments?: boolean;
    isMesh?: boolean;
  };
  if (
    !renderable.isMesh
    && !renderable.isLine
    && !renderable.isLineLoop
    && !renderable.isLineSegments
  ) {
    return null;
  }
  return renderable.geometry ?? null;
}

function getMeshGeometry(object: Object3D): BufferGeometry | null {
  const meshObject = object as Object3D & {
    geometry?: BufferGeometry;
    isMesh?: boolean;
  };
  if (!meshObject.isMesh) {
    return null;
  }
  return meshObject.geometry ?? null;
}

function getBoundsMinOnAxis(
  bounds: import("three").Box3,
  axis: "x" | "y" | "z",
) {
  switch (axis) {
    case "x":
      return bounds.min.x;
    case "z":
      return bounds.min.z;
    default:
      return bounds.min.y;
  }
}

function getWorldAxisVector(
  THREE: typeof import("three"),
  axis: "x" | "y" | "z",
  value: number,
) {
  return new THREE.Vector3(
    axis === "x" ? value : 0,
    axis === "y" ? value : 0,
    axis === "z" ? value : 0,
  );
}

function translateObjectAlongWorldAxis(
  runtime: ViewerRuntime,
  object: Object3D,
  axis: "x" | "y" | "z",
  delta: number,
) {
  if (Math.abs(delta) < 1e-9) {
    return;
  }

  const worldDelta = getWorldAxisVector(runtime.THREE, axis, delta);
  if (!object.parent) {
    object.position.add(worldDelta);
    return;
  }

  updateObjectWorldMatrices(object.parent);
  const worldStart = new runtime.THREE.Vector3();
  const localStart = new runtime.THREE.Vector3();
  const localEnd = new runtime.THREE.Vector3();
  object.getWorldPosition(worldStart);
  localStart.copy(worldStart);
  localEnd.copy(worldStart).add(worldDelta);
  object.parent.worldToLocal(localStart);
  object.parent.worldToLocal(localEnd);
  object.position.add(localEnd.sub(localStart));
}

function dropObjectToBed(
  target: Object3D,
  runtime: ViewerRuntime,
  transformObject: Object3D = target,
) {
  const { axis, bedZWorld } = getBedPlaneWorld(runtime);
  const bounds = computeVisibleMeshWorldBounds(runtime.THREE, target);
  if (bounds.isEmpty()) {
    return 0;
  }

  const minUp = getBoundsMinOnAxis(bounds, axis);
  const dropDelta = bedZWorld - minUp;
  translateObjectAlongWorldAxis(runtime, transformObject, axis, dropDelta);
  updateObjectWorldMatrices(target);
  return dropDelta;
}

function setBedPlanePoint(
  position: Vector3,
  axis: "x" | "y" | "z",
  bedZWorld: number,
  firstAxisValue: number,
  secondAxisValue: number,
) {
  switch (axis) {
    case "x":
      position.set(bedZWorld, firstAxisValue, secondAxisValue);
      return;
    case "z":
      position.set(firstAxisValue, secondAxisValue, bedZWorld);
      return;
    default:
      position.set(firstAxisValue, bedZWorld, secondAxisValue);
  }
}

function resetBuildPlateLayout(runtime: ViewerRuntime | null) {
  if (!runtime) {
    return;
  }

  const { axis, bedZWorld } = getBedPlaneWorld(runtime);
  const half = BUILD_PLATE_SIZE_MM / 2;

  setBedPlanePoint(runtime.buildPlate.position, axis, bedZWorld, 0, 0);
  runtime.buildPlate.scale.setScalar(1);
  runtime.buildPlate.updateMatrixWorld(true);
  setBedPlanePoint(
    runtime.axisGizmo.position,
    axis,
    bedZWorld,
    -half + AXIS_GIZMO_INSET_MM,
    half - AXIS_GIZMO_INSET_MM,
  );
  runtime.axisGizmo.updateMatrixWorld(true);
}

function fitCamera(
  THREE: typeof import("three"),
  camera: import("three").PerspectiveCamera,
  controls: OrbitControlsImpl,
  object3d: Object3D,
  plateSize: number,
) {
  const bounds = buildCameraFitBounds(THREE, object3d, plateSize);
  if (bounds.isEmpty()) {
    return;
  }

  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z, plateSize);
  const distance = maxDimension * 1.8;
  camera.position.set(center.x + (distance * 0.7), center.y + (distance * 0.7), center.z + (distance * 0.7));
  controls.target.copy(center);
  controls.update();
}

function fitTopCamera(
  THREE: typeof import("three"),
  camera: OrthographicCamera,
  controls: OrbitControlsImpl,
  object3d: Object3D,
  width: number,
  height: number,
  plateSize: number,
) {
  const bounds = computeSelectionOrSceneWorldBounds(THREE, object3d);
  const size = bounds.isEmpty()
    ? new THREE.Vector3(TOP_VIEW_MIN_SPAN, TOP_VIEW_MIN_SPAN, TOP_VIEW_MIN_SPAN)
    : bounds.getSize(new THREE.Vector3());
  const center = bounds.isEmpty()
    ? new THREE.Vector3(0, 0, 0)
    : bounds.getCenter(new THREE.Vector3());
  const aspect = Math.max(width, 1) / Math.max(height, 1);
  const { spanHeight, spanWidth } = computeTopViewSpan(size.x, size.z, aspect, TOP_VIEW_MIN_SPAN);

  camera.left = -spanWidth / 2;
  camera.right = spanWidth / 2;
  camera.top = spanHeight / 2;
  camera.bottom = -spanHeight / 2;
  camera.near = 0.1;
  camera.far = Math.max(size.y + 1200, 2000);
  camera.position.set(center.x, center.y + Math.max(size.y + 140, plateSize * 0.45), center.z);
  camera.up.set(0, 0, -1);
  camera.lookAt(center.x, center.y, center.z);
  controls.target.copy(center);
  controls.update();
  camera.updateProjectionMatrix();
}

function buildCameraFitBounds(
  THREE: typeof import("three"),
  object3d: Object3D,
  plateSize: number,
) {
  const bounds = computeSelectionOrSceneWorldBounds(THREE, object3d);
  const half = plateSize / 2;
  const bedBounds = new THREE.Box3(
    new THREE.Vector3(-half, 0, -half),
    new THREE.Vector3(half, 0, half),
  );

  if (bounds.isEmpty()) {
    return bedBounds;
  }

  return bounds.union(bedBounds);
}

function centerTopCameraOnRings(
  runtime: ViewerRuntime,
  rings: RingSet2D[],
  originalCenter: Vector3,
  translation: [number, number, number],
) {
  const bounds = boundsFromRings(rings);
  if (!bounds) {
    return;
  }

  const localCenter = new runtime.THREE.Vector3(
    ((bounds.minX + bounds.maxX) * 0.5) - originalCenter.x + translation[0],
    ((bounds.minY + bounds.maxY) * 0.5) - originalCenter.y + translation[1],
    0,
  );
  const worldCenter = runtime.overlayConversionGroup.localToWorld(localCenter);
  const aspect = Math.max(runtime.renderer.domElement.clientWidth, 1) / Math.max(runtime.renderer.domElement.clientHeight, 1);
  const { spanHeight, spanWidth } = computeTopViewSpan(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, aspect, 0);
  const currentDistance = Math.abs(runtime.topCamera.position.y - runtime.topControls.target.y);

  runtime.topCamera.left = -spanWidth / 2;
  runtime.topCamera.right = spanWidth / 2;
  runtime.topCamera.top = spanHeight / 2;
  runtime.topCamera.bottom = -spanHeight / 2;
  runtime.topCamera.position.set(worldCenter.x, worldCenter.y + Math.max(currentDistance, 140), worldCenter.z);
  runtime.topControls.target.copy(worldCenter);
  runtime.topCamera.lookAt(worldCenter.x, worldCenter.y, worldCenter.z);
  runtime.topControls.update();
  runtime.topCamera.updateProjectionMatrix();
}

function computeTopViewSpan(
  contentWidth: number,
  contentHeight: number,
  aspect: number,
  minSpan: number,
) {
  let spanWidth = Math.max(contentWidth, minSpan) * (1 + (TOP_VIEW_FIT_PADDING * 2));
  let spanHeight = Math.max(contentHeight, minSpan) * (1 + (TOP_VIEW_FIT_PADDING * 2));

  if ((spanWidth / Math.max(spanHeight, 0.001)) > aspect) {
    spanHeight = spanWidth / Math.max(aspect, 0.001);
  } else {
    spanWidth = spanHeight * Math.max(aspect, 0.001);
  }

  return {
    spanHeight,
    spanWidth,
  };
}

function boundsFromRings(
  rings: RingSet2D[],
): { maxX: number; maxY: number; minX: number; minY: number } | null {
  const points = rings.flatMap((ring) => [...ring.exterior, ...ring.holes.flatMap((hole) => hole)]);
  if (!points.length) {
    return null;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  return { maxX, maxY, minX, minY };
}

function clearGroup(group: Object3D) {
  while (group.children.length > 0) {
    const child = group.children[0];
    group.remove(child);
    disposeObject3D(child);
  }
}

function disposeObject3D(object: Object3D) {
  object.traverse((child) => {
    const maybeMesh = child as Mesh & {
      geometry?: { dispose?: () => void };
      material?: { dispose?: () => void } | { dispose?: () => void }[];
    };

    maybeMesh.geometry?.dispose?.();
    if (Array.isArray(maybeMesh.material)) {
      maybeMesh.material.forEach((material) => material.dispose?.());
    } else {
      maybeMesh.material?.dispose?.();
    }
  });
}

function normalizeDegrees(value: number) {
  let normalized = ((value + 180) % 360 + 360) % 360 - 180;
  if (Math.abs(normalized) < 0.01) {
    normalized = 0;
  }
  return normalized;
}

function rotationFromGroup(
  THREE: typeof import("three"),
  transformGroup: import("three").Group,
): [number, number, number] {
  const euler = new THREE.Euler().setFromQuaternion(transformGroup.quaternion, "XYZ");
  return [
    normalizeDegrees(THREE.MathUtils.radToDeg(euler.x)),
    normalizeDegrees(THREE.MathUtils.radToDeg(euler.y)),
    normalizeDegrees(THREE.MathUtils.radToDeg(euler.z)),
  ];
}

function translationFromGroup(
  transformGroup: import("three").Group,
): [number, number, number] {
  return [
    normalizeTranslation(transformGroup.position.x),
    normalizeTranslation(transformGroup.position.y),
    normalizeTranslation(transformGroup.position.z),
  ];
}

function normalizeTranslationVector(
  translation: [number, number, number],
): [number, number, number] {
  return translation.map(normalizeTranslation) as [number, number, number];
}

function areNumberTriplesClose(
  left: [number, number, number],
  right: [number, number, number],
): boolean {
  return left.every((value, index) => Math.abs(value - right[index]) < 0.001);
}

function normalizeTranslation(value: number) {
  return Math.abs(value) < 0.001 ? 0 : Number(value.toFixed(2));
}
