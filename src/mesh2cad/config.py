from __future__ import annotations

VIEW_PRESETS: dict[str, tuple[float, float, float]] = {
    "top": (0.0, 0.0, 1.0),
    "bottom": (0.0, 0.0, -1.0),
    "front": (0.0, -1.0, 0.0),
    "back": (0.0, 1.0, 0.0),
    "left": (-1.0, 0.0, 0.0),
    "right": (1.0, 0.0, 0.0),
}

DEFAULT_EMPTY_BOUNDS: tuple[float, float, float, float] = (0.0, 0.0, 0.0, 0.0)
DEFAULT_SVG_BOUNDS: tuple[float, float, float, float] = (0.0, 0.0, 1.0, 1.0)
PROJECTION_RETRY_APAD_FACTOR: float = 1e-6
NUMERIC_SNAP_EPSILON: float = 1e-12
