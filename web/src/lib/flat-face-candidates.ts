import type { Mesh, Object3D } from "three";

export interface FlatFaceCandidate {
  area: number;
  centroid: [number, number, number];
  id: string;
  normal: [number, number, number];
}

type TriangleRecord = {
  area: number;
  centroid: [number, number, number];
  normal: [number, number, number];
  planeOffset: number;
};

const ANGLE_TOLERANCE_DEGREES = 12;
const DEFAULT_MAX_CANDIDATES = 18;
const DEFAULT_MIN_AREA_RATIO = 0.0125;

export function collectFlatFaceCandidates(
  THREE: typeof import("three"),
  object3d: Object3D,
): FlatFaceCandidate[] {
  object3d.updateMatrixWorld(true);

  const bounds = new THREE.Box3().setFromObject(object3d);
  const span = bounds.isEmpty()
    ? 1
    : Math.max(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, bounds.max.z - bounds.min.z, 1);
  const areaFloor = Math.max(span * span * 1e-8, 1e-8);
  const planeTolerance = Math.max(span * 0.004, 0.08);
  const normalTolerance = Math.cos(THREE.MathUtils.degToRad(ANGLE_TOLERANCE_DEGREES));
  const edgeQuantization = Math.max(span * 1e-4, 1e-4);

  const triangles: TriangleRecord[] = [];
  const edgeMap = new Map<string, number[]>();
  let totalArea = 0;

  object3d.traverse((child) => {
    if (!("isMesh" in child) || !child.isMesh) {
      return;
    }

    const mesh = child as Mesh;
    const position = mesh.geometry.getAttribute("position");
    if (!position) {
      return;
    }

    const index = mesh.geometry.getIndex();
    const triangleCount = index ? index.count / 3 : position.count / 3;
    const triangle = new THREE.Triangle();
    const normal = new THREE.Vector3();
    const centroid = new THREE.Vector3();
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();

    for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
      const indexOffset = triangleIndex * 3;
      const ia = index ? index.getX(indexOffset) : indexOffset;
      const ib = index ? index.getX(indexOffset + 1) : indexOffset + 1;
      const ic = index ? index.getX(indexOffset + 2) : indexOffset + 2;

      a.fromBufferAttribute(position, ia).applyMatrix4(mesh.matrixWorld);
      b.fromBufferAttribute(position, ib).applyMatrix4(mesh.matrixWorld);
      c.fromBufferAttribute(position, ic).applyMatrix4(mesh.matrixWorld);

      triangle.set(a, b, c);
      triangle.getNormal(normal);
      const area = triangle.getArea();
      if (!Number.isFinite(area) || area <= areaFloor || normal.lengthSq() <= 1e-12) {
        continue;
      }

      centroid.copy(a).add(b).add(c).multiplyScalar(1 / 3);
      totalArea += area;

      const triangleId = triangles.length;
      triangles.push({
        area,
        centroid: [centroid.x, centroid.y, centroid.z],
        normal: [normal.x, normal.y, normal.z],
        planeOffset: normal.dot(centroid),
      });

      const keys = [
        edgeKey(a, b, edgeQuantization),
        edgeKey(b, c, edgeQuantization),
        edgeKey(c, a, edgeQuantization),
      ];
      for (const key of keys) {
        const group = edgeMap.get(key);
        if (group) {
          group.push(triangleId);
        } else {
          edgeMap.set(key, [triangleId]);
        }
      }
    }
  });

  if (triangles.length === 0 || totalArea <= 0) {
    return [];
  }

  const adjacency = Array.from({ length: triangles.length }, () => new Set<number>());
  for (const shared of edgeMap.values()) {
    if (shared.length < 2) {
      continue;
    }
    for (let index = 0; index < shared.length; index += 1) {
      for (let other = index + 1; other < shared.length; other += 1) {
        adjacency[shared[index]].add(shared[other]);
        adjacency[shared[other]].add(shared[index]);
      }
    }
  }

  const visited = new Set<number>();
  const minimumArea = Math.max(totalArea * DEFAULT_MIN_AREA_RATIO, areaFloor);
  const candidates: FlatFaceCandidate[] = [];

  for (let triangleIndex = 0; triangleIndex < triangles.length; triangleIndex += 1) {
    if (visited.has(triangleIndex)) {
      continue;
    }

    const queue = [triangleIndex];
    visited.add(triangleIndex);
    const patch: number[] = [];

    while (queue.length > 0) {
      const currentIndex = queue.pop()!;
      patch.push(currentIndex);
      const current = triangles[currentIndex];

      for (const neighborIndex of adjacency[currentIndex]) {
        if (visited.has(neighborIndex)) {
          continue;
        }

        const neighbor = triangles[neighborIndex];
        if (
          dot(current.normal, neighbor.normal) < normalTolerance
          || Math.abs(current.planeOffset - neighbor.planeOffset) > planeTolerance
        ) {
          continue;
        }

        visited.add(neighborIndex);
        queue.push(neighborIndex);
      }
    }

    let area = 0;
    let centroidX = 0;
    let centroidY = 0;
    let centroidZ = 0;
    let normalX = 0;
    let normalY = 0;
    let normalZ = 0;

    for (const index of patch) {
      const triangle = triangles[index];
      area += triangle.area;
      centroidX += triangle.centroid[0] * triangle.area;
      centroidY += triangle.centroid[1] * triangle.area;
      centroidZ += triangle.centroid[2] * triangle.area;
      normalX += triangle.normal[0] * triangle.area;
      normalY += triangle.normal[1] * triangle.area;
      normalZ += triangle.normal[2] * triangle.area;
    }

    if (area < minimumArea) {
      continue;
    }

    const normalized = normalizeVector([normalX, normalY, normalZ]);
    candidates.push({
      area,
      centroid: [centroidX / area, centroidY / area, centroidZ / area],
      id: `${triangleIndex}:${patch.length}`,
      normal: normalized,
    });
  }

  return candidates
    .sort((left, right) => right.area - left.area)
    .slice(0, DEFAULT_MAX_CANDIDATES);
}

function edgeKey(
  left: import("three").Vector3,
  right: import("three").Vector3,
  quantization: number,
): string {
  const a = vectorKey(left, quantization);
  const b = vectorKey(right, quantization);
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function vectorKey(vector: import("three").Vector3, quantization: number): string {
  return [
    quantize(vector.x, quantization),
    quantize(vector.y, quantization),
    quantize(vector.z, quantization),
  ].join(",");
}

function quantize(value: number, step: number): number {
  if (!Number.isFinite(value) || step <= 0) {
    return 0;
  }
  return Math.round(value / step) * step;
}

function dot(left: [number, number, number], right: [number, number, number]): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function normalizeVector(
  vector: [number, number, number],
): [number, number, number] {
  const length = Math.hypot(vector[0], vector[1], vector[2]) || 1;
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}
