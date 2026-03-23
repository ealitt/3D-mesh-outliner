import type { BufferGeometry, Group, Material, Mesh, Object3D } from "three";
import type { MeshFileType, PreparedMesh } from "./types";

export function detectMeshFileType(fileName: string): MeshFileType | null {
  const extension = fileName.split(".").pop()?.toLowerCase();
  switch (extension) {
    case "3mf":
      return "3mf";
    case "glb":
      return "glb";
    case "obj":
      return "obj";
    case "ply":
      return "ply";
    case "stl":
      return "stl";
    default:
      return null;
  }
}

export async function prepareMeshFile(file: File): Promise<PreparedMesh> {
  const fileType = detectMeshFileType(file.name);
  if (!fileType) {
    throw new Error("Unsupported file type. Use STL, OBJ, PLY, GLB, or 3MF.");
  }

  const arrayBuffer = await file.arrayBuffer();
  const object3d = await parseMeshBuffer(fileType, arrayBuffer);
  object3d.name = file.name;

  const { extents, meshCount, triangleCount } = await summarizeObject(object3d);

  return {
    arrayBuffer,
    extents,
    fileName: file.name,
    fileType,
    meshCount,
    object3d,
    triangleCount,
  };
}

async function parseMeshBuffer(fileType: MeshFileType, arrayBuffer: ArrayBuffer): Promise<Object3D> {
  const THREE = await import("three");

  switch (fileType) {
    case "stl": {
      const { STLLoader } = await import("three/examples/jsm/loaders/STLLoader.js");
      const geometry = new STLLoader().parse(arrayBuffer);
      return finalizeObject(createGroupFromGeometry(geometry, THREE), THREE);
    }
    case "ply": {
      const { PLYLoader } = await import("three/examples/jsm/loaders/PLYLoader.js");
      const geometry = new PLYLoader().parse(arrayBuffer);
      return finalizeObject(createGroupFromGeometry(geometry, THREE), THREE);
    }
    case "obj": {
      const { OBJLoader } = await import("three/examples/jsm/loaders/OBJLoader.js");
      const text = new TextDecoder().decode(arrayBuffer);
      const object = new OBJLoader().parse(text);
      return finalizeObject(object, THREE);
    }
    case "glb": {
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      const object = await new Promise<Object3D>((resolve, reject) => {
        new GLTFLoader().parse(arrayBuffer, "", (gltf) => resolve(gltf.scene), reject);
      });
      return finalizeObject(object, THREE);
    }
    case "3mf": {
      const { ThreeMFLoader } = await import("three/examples/jsm/loaders/3MFLoader.js");
      const object = new ThreeMFLoader().parse(arrayBuffer);
      return finalizeObject(object, THREE);
    }
  }
}

function createGroupFromGeometry(
  geometry: BufferGeometry,
  THREE: typeof import("three"),
): Group {
  const group = new THREE.Group();
  const hasVertexColors = Boolean(geometry.getAttribute("color"));
  if (!geometry.getAttribute("normal")) {
    geometry.computeVertexNormals();
  }

  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: hasVertexColors ? "#fffdf9" : "#d6a05e",
      metalness: 0.1,
      roughness: 0.82,
      side: THREE.DoubleSide,
      vertexColors: hasVertexColors,
    }),
  );
  group.add(mesh);
  return group;
}

function finalizeObject(object3d: Object3D, THREE: typeof import("three")): Object3D {
  object3d.updateMatrixWorld(true);
  object3d.traverse((child) => {
    if (!("isMesh" in child) || !child.isMesh) {
      return;
    }

    const mesh = child as Mesh;
    if (!mesh.geometry.getAttribute("normal")) {
      mesh.geometry.computeVertexNormals();
    }

    const nextMaterial = createPreviewMaterial(mesh, THREE);
    mesh.material = nextMaterial;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
  return object3d;
}

function createPreviewMaterial(mesh: Mesh, THREE: typeof import("three")): Material {
  const sourceMaterial = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  const materialWithColor = sourceMaterial as Material & {
    color?: { getHexString(): string };
    opacity?: number;
    transparent?: boolean;
  };
  const hasVertexColors = Boolean(mesh.geometry.getAttribute("color"));
  const color =
    materialWithColor?.color
      ? materialWithColor.color.getHexString()
      : hasVertexColors
        ? "fffdf9"
        : "d6a05e";

  return new THREE.MeshStandardMaterial({
    color: `#${color}`,
    metalness: 0.12,
    opacity: materialWithColor?.opacity ?? 1,
    roughness: 0.78,
    side: THREE.DoubleSide,
    transparent: materialWithColor?.transparent ?? false,
    vertexColors: hasVertexColors,
  });
}

async function summarizeObject(object3d: Object3D) {
  const THREE = await import("three");
  const bounds = new THREE.Box3().setFromObject(object3d);
  const size = bounds.isEmpty() ? new THREE.Vector3(0, 0, 0) : bounds.getSize(new THREE.Vector3());

  let meshCount = 0;
  let triangleCount = 0;

  object3d.traverse((child) => {
    if (!("isMesh" in child) || !child.isMesh) {
      return;
    }

    meshCount += 1;
    const geometry = (child as Mesh).geometry;
    const position = geometry.getAttribute("position");
    triangleCount += Math.floor((position?.count ?? 0) / 3);
  });

  return {
    extents: [size.x, size.y, size.z] as [number, number, number],
    meshCount,
    triangleCount,
  };
}
