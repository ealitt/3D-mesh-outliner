import type { PreparedMesh } from "./types";

export type Vector3Tuple = [number, number, number];

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

export function dropMeshToBuildplate(
  mesh: Pick<PreparedMesh, "centroid" | "positions">,
  options: {
    bedZ?: number;
    rotationDegrees: Vector3Tuple;
    rotationOrigin?: Vector3Tuple | null;
    translation: Vector3Tuple;
  },
): { appliedOffset: number; translation: Vector3Tuple } {
  const bedZ = options.bedZ ?? 0;
  const minZ = getLowestTransformedMeshZ(mesh, options);
  if (!Number.isFinite(minZ)) {
    return {
      appliedOffset: 0,
      translation: [...options.translation] as Vector3Tuple,
    };
  }

  const appliedOffset = bedZ - minZ;
  return {
    appliedOffset,
    translation: [
      options.translation[0],
      options.translation[1],
      options.translation[2] + appliedOffset,
    ],
  };
}

export function getLowestTransformedMeshZ(
  mesh: Pick<PreparedMesh, "centroid" | "positions">,
  options: {
    rotationDegrees: Vector3Tuple;
    rotationOrigin?: Vector3Tuple | null;
    translation: Vector3Tuple;
  },
): number {
  if (!mesh.positions.length) {
    return options.translation[2];
  }

  const rotationOrigin = options.rotationOrigin ?? mesh.centroid;
  const rotation = buildEulerRotation(options.rotationDegrees);
  let minZ = Number.POSITIVE_INFINITY;

  for (let index = 0; index < mesh.positions.length; index += 3) {
    const transformed = transformPointAroundOrigin(
      [
        mesh.positions[index] ?? 0,
        mesh.positions[index + 1] ?? 0,
        mesh.positions[index + 2] ?? 0,
      ],
      rotationOrigin,
      rotation,
      options.translation,
    );
    minZ = Math.min(minZ, transformed[2]);
  }

  return minZ;
}

function buildEulerRotation(
  rotationDegrees: Vector3Tuple,
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
  value: Vector3Tuple,
): Vector3Tuple {
  const [x, y, z] = value;
  return [
    (rotation.m11 * x) + (rotation.m12 * y) + (rotation.m13 * z),
    (rotation.m21 * x) + (rotation.m22 * y) + (rotation.m23 * z),
    (rotation.m31 * x) + (rotation.m32 * y) + (rotation.m33 * z),
  ];
}

function transformPointAroundOrigin(
  point: Vector3Tuple,
  origin: Vector3Tuple,
  rotation: EulerRotationMatrix,
  translation: Vector3Tuple,
): Vector3Tuple {
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
