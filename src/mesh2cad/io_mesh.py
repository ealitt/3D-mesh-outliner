from __future__ import annotations

from io import BytesIO
from os import PathLike
from pathlib import Path

import trimesh

from .types import LoadedMesh, MeshInput


def _normalized_file_type(mesh_input: MeshInput, file_type: str | None = None) -> str | None:
    if file_type:
        return file_type.lstrip(".").lower()
    if isinstance(mesh_input, (str, PathLike)):
        suffix = Path(mesh_input).suffix.lstrip(".").lower()
        return suffix or None
    return None


def load_mesh(mesh_input: MeshInput, file_type: str | None = None) -> LoadedMesh:
    warnings: list[str] = []
    normalized_type = _normalized_file_type(mesh_input, file_type=file_type)

    file_obj: str | BytesIO
    if isinstance(mesh_input, (bytes, bytearray, memoryview)):
        if normalized_type is None:
            raise ValueError("file_type is required when loading mesh bytes.")
        file_obj = BytesIO(bytes(mesh_input))
    else:
        file_obj = mesh_input  # type: ignore[assignment]

    try:
        scene = trimesh.load_scene(file_obj=file_obj, file_type=normalized_type)
    except Exception as exc:  # pragma: no cover - trimesh error shape varies by loader
        raise ValueError(f"Failed to load mesh input: {exc}") from exc

    mesh_geometries = [
        geometry
        for geometry in scene.geometry.values()
        if isinstance(geometry, trimesh.Trimesh)
    ]
    dropped = len(scene.geometry) - len(mesh_geometries)
    if dropped:
        warnings.append(
            f"Dropped {dropped} non-mesh geometries while flattening the loaded scene."
        )
    if not mesh_geometries:
        raise ValueError("Loaded input contained no mesh geometry.")

    mesh = scene.to_mesh()
    if not isinstance(mesh, trimesh.Trimesh):
        raise ValueError("Loaded input could not be flattened into a Trimesh object.")
    if mesh.faces is None or len(mesh.faces) == 0:
        raise ValueError("Loaded mesh contained no faces.")

    if len(mesh_geometries) > 1:
        warnings.append(f"Merged {len(mesh_geometries)} mesh bodies into one projection mesh.")

    source_format = normalized_type or getattr(getattr(scene, "source", None), "file_type", None)
    mesh.metadata.update(scene.metadata)
    if source_format:
        mesh.metadata["source_format"] = source_format
    mesh.metadata["source_geometry_count"] = len(mesh_geometries)
    if isinstance(mesh_input, (str, PathLike)):
        mesh.metadata["source_path"] = str(Path(mesh_input))

    return LoadedMesh(mesh=mesh, source_format=source_format, warnings=warnings)
