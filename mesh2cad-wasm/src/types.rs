use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum KeepMode {
    All,
    Largest,
    OuterOnly,
}

impl Default for KeepMode {
    fn default() -> Self {
        Self::OuterOnly
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProjectionMode {
    PlaneCut,
    Silhouette,
}

impl Default for ProjectionMode {
    fn default() -> Self {
        Self::Silhouette
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OffsetStage {
    PreScale,
    PostScale,
}

impl Default for OffsetStage {
    fn default() -> Self {
        Self::PostScale
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum JoinStyle {
    Round,
    Mitre,
    Bevel,
}

impl Default for JoinStyle {
    fn default() -> Self {
        Self::Round
    }
}

fn default_direction() -> [f64; 3] {
    [0.0, 0.0, 1.0]
}

fn default_rotation() -> [f64; 3] {
    [0.0, 0.0, 0.0]
}

fn default_rotation_origin() -> Option<[f64; 3]> {
    None
}

fn default_plane_rotation() -> [f64; 3] {
    [0.0, 0.0, 0.0]
}

fn default_plane_translation() -> [f64; 3] {
    [0.0, 0.0, 0.0]
}

fn default_plane_origin() -> Option<[f64; 3]> {
    None
}

fn default_plane_normal() -> Option<[f64; 3]> {
    None
}

fn default_plane_basis() -> Option<[f64; 3]> {
    None
}

fn default_translation() -> [f64; 3] {
    [0.0, 0.0, 0.0]
}

fn default_output_units() -> Option<String> {
    Some("mm".to_string())
}

fn default_scale() -> f64 {
    1.0
}

fn default_offset_distance() -> f64 {
    0.0
}

fn default_min_area() -> f64 {
    0.0
}

fn default_simplify_tolerance() -> f64 {
    0.0
}

fn default_union_batch_size() -> usize {
    4096
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessOptions {
    #[serde(default)]
    pub projection_mode: ProjectionMode,
    #[serde(default = "default_direction")]
    pub direction: [f64; 3],
    #[serde(default)]
    pub origin: Option<[f64; 3]>,
    #[serde(default)]
    pub source_units: Option<String>,
    #[serde(default = "default_output_units")]
    pub output_units: Option<String>,
    #[serde(default = "default_rotation")]
    pub rotation_degrees: [f64; 3],
    #[serde(default = "default_rotation_origin")]
    pub rotation_origin: Option<[f64; 3]>,
    #[serde(default = "default_plane_rotation")]
    pub plane_rotation_degrees: [f64; 3],
    #[serde(default = "default_plane_origin")]
    pub plane_origin: Option<[f64; 3]>,
    #[serde(default = "default_plane_normal")]
    pub plane_normal: Option<[f64; 3]>,
    #[serde(default = "default_plane_basis")]
    pub plane_basis_u: Option<[f64; 3]>,
    #[serde(default = "default_plane_basis")]
    pub plane_basis_v: Option<[f64; 3]>,
    #[serde(default = "default_plane_translation")]
    pub plane_translation: [f64; 3],
    #[serde(default = "default_translation")]
    pub translation: [f64; 3],
    #[serde(default = "default_scale")]
    pub scale: f64,
    #[serde(default = "default_offset_distance")]
    pub offset_distance: f64,
    #[serde(default)]
    pub offset_stage: OffsetStage,
    #[serde(default)]
    pub join_style: JoinStyle,
    #[serde(default)]
    pub keep_mode: KeepMode,
    #[serde(default = "default_min_area")]
    pub min_area: f64,
    #[serde(default = "default_simplify_tolerance")]
    pub simplify_tolerance: f64,
    #[serde(default)]
    pub snap_grid: Option<f64>,
    #[serde(default = "default_union_batch_size")]
    pub union_batch_size: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OffsetOptions {
    #[serde(default = "default_offset_distance")]
    pub offset_distance: f64,
    #[serde(default)]
    pub join_style: JoinStyle,
    #[serde(default)]
    pub units: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RingSetDto {
    pub exterior: Vec<[f64; 2]>,
    pub holes: Vec<Vec<[f64; 2]>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessResultDto {
    pub rings: Vec<RingSetDto>,
    pub bounds: [f64; 4],
    pub area: f64,
    pub units: Option<String>,
    pub body_count: usize,
    pub warnings: Vec<String>,
}
