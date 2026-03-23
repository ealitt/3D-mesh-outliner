import { useEffect, useRef } from "preact/hooks";
import type { PreparedMesh } from "../lib/types";

export function ModelViewer(props: { mesh: PreparedMesh | null }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const currentMesh = props.mesh;
    if (!currentMesh || !containerRef.current) {
      return;
    }

    let cleanup = () => {};
    let disposed = false;

    void (async () => {
      const THREE = await import("three");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      if (disposed || !containerRef.current) {
        return;
      }

      const container = containerRef.current;
      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color("#1b1612");
      scene.fog = new THREE.Fog("#1b1612", 24, 90);

      const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 1000);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.maxDistance = 400;
      controls.minDistance = 0.2;

      const ambientLight = new THREE.HemisphereLight("#fff6df", "#0e0b09", 1.35);
      const keyLight = new THREE.DirectionalLight("#fff4d8", 1.4);
      keyLight.position.set(8, 9, 7);
      const rimLight = new THREE.DirectionalLight("#f7b267", 0.8);
      rimLight.position.set(-6, 4, -8);
      scene.add(ambientLight, keyLight, rimLight);

      const grid = new THREE.GridHelper(12, 24, "#6f5d4e", "#2b241d");
      const axes = new THREE.AxesHelper(1.6);
      scene.add(grid, axes);

      const model = currentMesh.object3d.clone(true);
      scene.add(model);

      const bounds = new THREE.Box3().setFromObject(model);
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      model.position.sub(center);

      const diagonal = Math.max(size.length(), 1);
      const gridSpan = Math.max(size.x, size.z, 1.25);
      grid.scale.setScalar(gridSpan);
      camera.position.set(diagonal * 1.25, diagonal * 0.8, diagonal * 1.1);
      controls.target.set(0, 0, 0);
      controls.update();

      const render = () => {
        if (disposed) {
          return;
        }
        controls.update();
        renderer.render(scene, camera);
      };

      const resize = () => {
        if (!container.isConnected) {
          return;
        }
        const width = container.clientWidth || 1;
        const height = container.clientHeight || 1;
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        render();
      };

      renderer.setAnimationLoop(render);
      container.replaceChildren(renderer.domElement);

      const resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(container);
      resize();

      cleanup = () => {
        resizeObserver.disconnect();
        renderer.setAnimationLoop(null);
        controls.dispose();
        renderer.dispose();
        container.replaceChildren();
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, [props.mesh]);

  return (
    <div class="viewer-shell">
      {props.mesh ? null : (
        <div class="viewer-placeholder">
          <p class="viewer-placeholder-title">3D upload preview</p>
          <p class="viewer-placeholder-copy">
            Drop in a mesh and this panel becomes an orbitable inspection view.
          </p>
        </div>
      )}
      <div class="h-full w-full" ref={containerRef} />
    </div>
  );
}
