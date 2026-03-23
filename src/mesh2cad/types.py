from __future__ import annotations

from dataclasses import dataclass
from os import PathLike
from typing import IO, Literal, TypeAlias

KeepMode = Literal["all", "largest", "outer_only"]
OffsetStage = Literal["pre_scale", "post_scale"]
JoinStyle = Literal["round", "mitre", "bevel"]

Point2D: TypeAlias = tuple[float, float]
Point3D: TypeAlias = tuple[float, float, float]
MeshInput: TypeAlias = str | PathLike[str] | bytes | bytearray | memoryview | IO[bytes]


@dataclass(slots=True)
class ProjectionSpec:
    direction: Point3D
    origin: Point3D | None = None
    precise: bool = True
    ignore_sign: bool = False
    apad: float | None = None
    rpad: float | None = None
    tol_dot: float | None = None


@dataclass(slots=True)
class ProcessSpec:
    source_units: str | None = None
    output_units: str = "mm"
    scale: float = 1.0
    offset_distance: float = 0.0
    offset_stage: OffsetStage = "post_scale"
    keep_mode: KeepMode = "largest"
    min_area: float = 0.0
    simplify_tolerance: float = 0.0
    join_style: JoinStyle = "round"


@dataclass(slots=True)
class ExportSpec:
    write_svg: bool = True
    write_dxf: bool = True
    svg_stroke_width: float = 0.1
    include_hatch: bool = False
    dxf_layer_outline: str = "OUTLINE"
    dxf_layer_holes: str = "HOLES"
    dxf_layer_hatch: str = "FILL"


@dataclass(slots=True)
class RingSet:
    exterior: list[Point2D]
    holes: list[list[Point2D]]


@dataclass(slots=True)
class PipelineResult:
    svg_text: str | None
    dxf_bytes: bytes | None
    area: float
    bounds: tuple[float, float, float, float]
    warnings: list[str]
    body_count: int = 0
    units: str | None = None


@dataclass(slots=True)
class LoadedMesh:
    mesh: object
    source_format: str | None
    warnings: list[str]
