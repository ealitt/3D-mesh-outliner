import type { BufferGeometry, Group, Material, Mesh, Object3D } from "three";
import { collectFlatFaceCandidates } from "./flat-face-candidates";
import type { MeshFileType, PreparedMesh, PreparedMeshBody } from "./types";

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
  const meshId = globalThis.crypto?.randomUUID?.() ?? `${file.name}-${Date.now()}-${Math.random()}`;

  const defaultRotationDegrees = await computeDefaultRotationDegrees(object3d);
  const bodies = await extractIndexedBodies(object3d, file.name, meshId);
  const { indices, positions } = combineBodies(bodies);
  const centroid = computeMeshCentroid(positions, indices);
  const { extents, meshCount, triangleCount } = await summarizeObject(object3d);

  return {
    arrayBuffer,
    bodies,
    centroid,
    defaultRotationDegrees,
    extents,
    fileName: file.name,
    fileType,
    id: meshId,
    indices,
    meshCount,
    object3d,
    positions,
    triangleCount,
  };
}

export async function computeDefaultRotationDegrees(
  object3d: Object3D,
): Promise<[number, number, number]> {
  const THREE = await import("three");
  const workingRoot = new THREE.Group();
  const workingCopy = object3d.clone(true);
  workingRoot.add(workingCopy);
  workingRoot.updateMatrixWorld(true);

  const candidates = collectFlatFaceCandidates(THREE, workingRoot);
  if (candidates.length === 0) {
    return [0, 0, 0];
  }

  const worldUp = new THREE.Vector3(0, 0, 1);
  const worldDown = new THREE.Vector3(0, 0, -1);
  const best = [...candidates].sort((left, right) => {
    const areaDelta = right.area - left.area;
    if (Math.abs(areaDelta) > 1e-6) {
      return areaDelta;
    }

    const leftNormal = new THREE.Vector3(...left.normal).normalize();
    const rightNormal = new THREE.Vector3(...right.normal).normalize();
    const leftAngle = Math.min(leftNormal.angleTo(worldUp), leftNormal.angleTo(worldDown));
    const rightAngle = Math.min(rightNormal.angleTo(worldUp), rightNormal.angleTo(worldDown));
    return leftAngle - rightAngle;
  })[0];

  const currentNormal = new THREE.Vector3(...best.normal).normalize();
  const downAngle = currentNormal.angleTo(worldDown);
  const upAngle = currentNormal.angleTo(worldUp);
  const targetNormal = downAngle <= upAngle ? worldDown : worldUp;
  const correction = new THREE.Quaternion().setFromUnitVectors(currentNormal, targetNormal);
  const euler = new THREE.Euler().setFromQuaternion(correction, "XYZ");

  return [
    normalizeDegrees(THREE.MathUtils.radToDeg(euler.x)),
    normalizeDegrees(THREE.MathUtils.radToDeg(euler.y)),
    normalizeDegrees(THREE.MathUtils.radToDeg(euler.z)),
  ];
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
      color: hasVertexColors ? "#eef4ff" : "#5b8def",
      metalness: 0.08,
      roughness: 0.68,
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
        ? "eef4ff"
        : "5b8def";

  return new THREE.MeshStandardMaterial({
    color: normalizePreviewColor(color, hasVertexColors),
    metalness: 0.08,
    opacity: materialWithColor?.opacity ?? 1,
    roughness: 0.64,
    side: THREE.DoubleSide,
    transparent: materialWithColor?.transparent ?? false,
    vertexColors: hasVertexColors,
  });
}

function normalizePreviewColor(color: string, hasVertexColors: boolean): string {
  if (hasVertexColors) {
    return `#${color}`;
  }

  const normalized = color.toLowerCase();
  if (normalized === "ffffff" || normalized === "fffdf9" || normalized === "f5f5f5") {
    return "#5b8def";
  }
  return `#${normalized}`;
}

function normalizeDegrees(value: number): number {
  let normalized = ((value + 180) % 360 + 360) % 360 - 180;
  if (Math.abs(normalized) < 0.01) {
    normalized = 0;
  }
  return normalized;
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
    const index = geometry.getIndex();
    triangleCount += index
      ? Math.floor(index.count / 3)
      : Math.floor((position?.count ?? 0) / 3);
  });

  return {
    extents: [size.x, size.y, size.z] as [number, number, number],
    meshCount,
    triangleCount,
  };
}

async function extractIndexedMesh(
  object3d: Object3D,
): Promise<{ indices: Uint32Array; positions: Float64Array }> {
  const bodies = await extractIndexedBodies(object3d);
  return combineBodies(bodies);
}

async function extractIndexedBodies(
  object3d: Object3D,
  fileName = "Mesh",
  meshId = "mesh",
): Promise<PreparedMeshBody[]> {
  const bodies: PreparedMeshBody[] = [];
  let meshIndex = 0;

  object3d.updateMatrixWorld(true);
  object3d.traverse((child) => {
    if (!("isMesh" in child) || !child.isMesh) {
      return;
    }

    const mesh = child as Mesh;
    const geometry = mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrixWorld);
    const position = geometry.getAttribute("position");
    if (!position) {
      geometry.dispose();
      return;
    }

    const positions: number[] = [];
    for (let index = 0; index < position.count; index += 1) {
      positions.push(position.getX(index), position.getY(index), position.getZ(index));
    }

    const indices: number[] = [];
    const index = geometry.getIndex();
    if (index) {
      for (let item = 0; item < index.count; item += 1) {
        indices.push(index.getX(item));
      }
    } else {
      for (let item = 0; item < position.count; item += 1) {
        indices.push(item);
      }
    }

    meshIndex += 1;
    bodies.push({
      id: `${meshId}-body-${meshIndex}`,
      indices: new Uint32Array(indices),
      name: mesh.name?.trim() || `Mesh ${meshIndex}`,
      positions: new Float64Array(positions),
      triangleCount: Math.floor(indices.length / 3),
    });
    geometry.dispose();
  });

  return bodies;
}

function combineBodies(
  bodies: PreparedMeshBody[],
): { indices: Uint32Array; positions: Float64Array } {
  const positions: number[] = [];
  const indices: number[] = [];

  for (const body of bodies) {
    const vertexOffset = positions.length / 3;
    for (const value of body.positions) {
      positions.push(value);
    }
    for (const index of body.indices) {
      indices.push(vertexOffset + index);
    }
  }

  return {
    indices: new Uint32Array(indices),
    positions: new Float64Array(positions),
  };
}

function computeMeshCentroid(
  positions: Float64Array,
  indices: Uint32Array,
): [number, number, number] {
  if (positions.length < 3) {
    return [0, 0, 0];
  }

  let weightedX = 0;
  let weightedY = 0;
  let weightedZ = 0;
  let totalWeight = 0;

  for (let index = 0; index + 2 < indices.length; index += 3) {
    const ia = indices[index] * 3;
    const ib = indices[index + 1] * 3;
    const ic = indices[index + 2] * 3;

    const ax = positions[ia];
    const ay = positions[ia + 1];
    const az = positions[ia + 2];
    const bx = positions[ib];
    const by = positions[ib + 1];
    const bz = positions[ib + 2];
    const cx = positions[ic];
    const cy = positions[ic + 1];
    const cz = positions[ic + 2];

    const abx = bx - ax;
    const aby = by - ay;
    const abz = bz - az;
    const acx = cx - ax;
    const acy = cy - ay;
    const acz = cz - az;

    const crossX = (aby * acz) - (abz * acy);
    const crossY = (abz * acx) - (abx * acz);
    const crossZ = (abx * acy) - (aby * acx);
    const area = 0.5 * Math.hypot(crossX, crossY, crossZ);
    if (area <= 1e-12) {
      continue;
    }

    weightedX += ((ax + bx + cx) / 3) * area;
    weightedY += ((ay + by + cy) / 3) * area;
    weightedZ += ((az + bz + cz) / 3) * area;
    totalWeight += area;
  }

  if (totalWeight > 1e-12) {
    return [
      weightedX / totalWeight,
      weightedY / totalWeight,
      weightedZ / totalWeight,
    ];
  }

  let sumX = 0;
  let sumY = 0;
  let sumZ = 0;
  const vertexCount = positions.length / 3;
  for (let index = 0; index < positions.length; index += 3) {
    sumX += positions[index];
    sumY += positions[index + 1];
    sumZ += positions[index + 2];
  }

  return [
    sumX / vertexCount,
    sumY / vertexCount,
    sumZ / vertexCount,
  ];
}
