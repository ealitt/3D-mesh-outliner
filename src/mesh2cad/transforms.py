from __future__ import annotations

import math

import trimesh

from .types import Point3D


def apply_mesh_pose(
    mesh: trimesh.Trimesh,
    rotation_degrees: Point3D,
    translation: Point3D,
) -> trimesh.Trimesh:
    rotation = tuple(float(value) for value in rotation_degrees)
    offset = tuple(float(value) for value in translation)

    if _is_identity_rotation(rotation) and _is_identity_translation(offset):
        return mesh.copy()

    transformed = mesh.copy()
    transformed.metadata = dict(mesh.metadata)

    if not _is_identity_rotation(rotation):
        center = transformed.bounds.mean(axis=0)
        rx, ry, rz = (math.radians(value) for value in rotation)
        rotation_matrix = trimesh.transformations.euler_matrix(rx, ry, rz, axes="sxyz")
        to_origin = trimesh.transformations.translation_matrix(-center)
        from_origin = trimesh.transformations.translation_matrix(center)
        transform = trimesh.transformations.concatenate_matrices(
            from_origin,
            rotation_matrix,
            to_origin,
        )
        transformed.apply_transform(transform)
        transformed.metadata["rotation_degrees"] = rotation

    if not _is_identity_translation(offset):
        transformed.apply_translation(offset)
        transformed.metadata["translation"] = offset
    return transformed


def apply_mesh_rotation(mesh: trimesh.Trimesh, rotation_degrees: Point3D) -> trimesh.Trimesh:
    rotation = tuple(float(value) for value in rotation_degrees)
    if _is_identity_rotation(rotation):
        return mesh.copy()

    rotated = mesh.copy()
    center = rotated.bounds.mean(axis=0)

    rx, ry, rz = (math.radians(value) for value in rotation)
    rotation_matrix = trimesh.transformations.euler_matrix(rx, ry, rz, axes="sxyz")
    to_origin = trimesh.transformations.translation_matrix(-center)
    from_origin = trimesh.transformations.translation_matrix(center)
    transform = trimesh.transformations.concatenate_matrices(
        from_origin,
        rotation_matrix,
        to_origin,
    )

    rotated.apply_transform(transform)
    rotated.metadata = dict(mesh.metadata)
    rotated.metadata["rotation_degrees"] = rotation
    return rotated


def apply_mesh_translation(mesh: trimesh.Trimesh, translation: Point3D) -> trimesh.Trimesh:
    offset = tuple(float(value) for value in translation)
    if _is_identity_translation(offset):
        return mesh.copy()

    translated = mesh.copy()
    translated.apply_translation(offset)
    translated.metadata = dict(mesh.metadata)
    translated.metadata["translation"] = offset
    return translated


def _is_identity_rotation(rotation_degrees: Point3D) -> bool:
    return all(math.isclose(value, 0.0, abs_tol=1e-9) for value in rotation_degrees)


def _is_identity_translation(translation: Point3D) -> bool:
    return all(math.isclose(value, 0.0, abs_tol=1e-9) for value in translation)
