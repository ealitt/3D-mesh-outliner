use approx::assert_abs_diff_eq;
use mesh2cad_wasm::{
    offset_rings_native,
    process_mesh_native,
    union_rings_native,
    types::{JoinStyle, KeepMode, OffsetOptions, OffsetStage, ProcessOptions, ProjectionMode, RingSetDto},
};

fn default_options() -> ProcessOptions {
    ProcessOptions {
        projection_mode: ProjectionMode::Silhouette,
        direction: [0.0, 0.0, 1.0],
        origin: None,
        source_units: Some("mm".to_string()),
        output_units: Some("mm".to_string()),
        plane_origin: None,
        plane_normal: None,
        plane_basis_u: None,
        plane_basis_v: None,
        plane_rotation_degrees: [0.0, 0.0, 0.0],
        plane_translation: [0.0, 0.0, 0.0],
        rotation_degrees: [0.0, 0.0, 0.0],
        rotation_origin: None,
        translation: [0.0, 0.0, 0.0],
        scale: 1.0,
        offset_distance: 0.0,
        offset_stage: OffsetStage::PostScale,
        join_style: JoinStyle::Round,
        keep_mode: KeepMode::OuterOnly,
        min_area: 0.0,
        simplify_tolerance: 0.0,
        snap_grid: None,
        union_batch_size: 4096,
    }
}

#[test]
fn flat_square_plate_projects_to_square() {
    let (positions, indices) = square_plate_mesh(10.0, 10.0, 1.0);
    let result = process_mesh_native(&positions, &indices, &default_options()).unwrap();

    assert_eq!(result.rings.len(), 1);
    assert!(result.rings[0].holes.is_empty());
    assert_abs_diff_eq!(result.area, 100.0, epsilon = 1e-6);
    assert_abs_diff_eq!(result.bounds[0], 0.0, epsilon = 1e-6);
    assert_abs_diff_eq!(result.bounds[1], 0.0, epsilon = 1e-6);
    assert_abs_diff_eq!(result.bounds[2], 10.0, epsilon = 1e-6);
    assert_abs_diff_eq!(result.bounds[3], 10.0, epsilon = 1e-6);
}

#[test]
fn cube_top_view_projects_to_square() {
    let (positions, indices) = box_mesh(10.0, 10.0, 10.0, [0.0, 0.0, 0.0]);
    let result = process_mesh_native(&positions, &indices, &default_options()).unwrap();

    assert_eq!(result.rings.len(), 1);
    assert!(result.rings[0].holes.is_empty());
    assert_abs_diff_eq!(result.area, 100.0, epsilon = 1e-6);
}

#[test]
fn cube_plane_cut_projects_to_square_section() {
    let (positions, indices) = box_mesh(10.0, 10.0, 10.0, [0.0, 0.0, 0.0]);
    let mut options = default_options();
    options.projection_mode = ProjectionMode::PlaneCut;

    let result = process_mesh_native(&positions, &indices, &options).unwrap();

    assert_eq!(result.rings.len(), 1);
    assert!(result.rings[0].holes.is_empty());
    assert_abs_diff_eq!(result.area, 100.0, epsilon = 1e-6);
    assert_abs_diff_eq!(result.bounds[0], -5.0, epsilon = 1e-6);
    assert_abs_diff_eq!(result.bounds[1], -5.0, epsilon = 1e-6);
    assert_abs_diff_eq!(result.bounds[2], 5.0, epsilon = 1e-6);
    assert_abs_diff_eq!(result.bounds[3], 5.0, epsilon = 1e-6);
}

#[test]
fn plane_cut_translation_can_miss_mesh_cleanly() {
    let (positions, indices) = box_mesh(10.0, 10.0, 10.0, [0.0, 0.0, 0.0]);
    let mut options = default_options();
    options.projection_mode = ProjectionMode::PlaneCut;
    options.plane_translation = [0.0, 0.0, 25.0];

    let result = process_mesh_native(&positions, &indices, &options).unwrap();

    assert!(result.rings.is_empty());
    assert!(result
        .warnings
        .iter()
        .any(|warning| warning.contains("Plane cut produced no closed 2D regions")));
}

#[test]
fn explicit_plane_origin_is_used_for_plane_cut_frame() {
    let (positions, indices) = box_mesh(10.0, 10.0, 10.0, [10.0, 0.0, 0.0]);
    let mut options = default_options();
    options.projection_mode = ProjectionMode::PlaneCut;
    options.plane_origin = Some([0.0, 0.0, 0.0]);

    let result = process_mesh_native(&positions, &indices, &options).unwrap();

    assert_eq!(result.rings.len(), 1);
    assert_abs_diff_eq!(result.bounds[0], 10.0, epsilon = 1e-6);
    assert_abs_diff_eq!(result.bounds[1], 0.0, epsilon = 1e-6);
    assert_abs_diff_eq!(result.bounds[2], 20.0, epsilon = 1e-6);
    assert_abs_diff_eq!(result.bounds[3], 10.0, epsilon = 1e-6);
}

#[test]
fn explicit_plane_frame_axes_drive_plane_local_slice_coordinates() {
    let (positions, indices) = box_mesh(10.0, 10.0, 10.0, [0.0, 0.0, 0.0]);
    let mut options = default_options();
    options.projection_mode = ProjectionMode::PlaneCut;
    options.plane_origin = Some([5.0, 5.0, 5.0]);
    options.plane_normal = Some([1.0, 0.0, 0.0]);
    options.plane_basis_u = Some([0.0, 1.0, 0.0]);
    options.plane_basis_v = Some([0.0, 0.0, 1.0]);

    let result = process_mesh_native(&positions, &indices, &options).unwrap();

    assert_eq!(result.rings.len(), 1);
    assert_abs_diff_eq!(result.area, 100.0, epsilon = 1e-6);
    assert_abs_diff_eq!(result.bounds[0], -5.0, epsilon = 1e-6);
    assert_abs_diff_eq!(result.bounds[1], -5.0, epsilon = 1e-6);
    assert_abs_diff_eq!(result.bounds[2], 5.0, epsilon = 1e-6);
    assert_abs_diff_eq!(result.bounds[3], 5.0, epsilon = 1e-6);
}

#[test]
fn plane_cut_defaults_to_transformed_mesh_center() {
    let (positions, indices) = box_mesh(10.0, 10.0, 10.0, [0.0, 0.0, 0.0]);
    let mut options = default_options();
    options.projection_mode = ProjectionMode::PlaneCut;
    options.translation = [0.0, 0.0, 6.0];

    let result = process_mesh_native(&positions, &indices, &options).unwrap();

    assert_eq!(result.rings.len(), 1);
    assert_abs_diff_eq!(result.area, 100.0, epsilon = 1e-6);
}

#[test]
fn rotated_prism_keeps_area_and_updates_bounds() {
    let (positions, indices) = box_mesh(10.0, 4.0, 6.0, [0.0, 0.0, 0.0]);
    let mut options = default_options();
    options.rotation_degrees = [0.0, 0.0, 45.0];

    let result = process_mesh_native(&positions, &indices, &options).unwrap();

    assert_abs_diff_eq!(result.area, 40.0, epsilon = 1e-4);
    assert_abs_diff_eq!(result.bounds[2] - result.bounds[0], 9.899494936, epsilon = 1e-4);
    assert_abs_diff_eq!(result.bounds[3] - result.bounds[1], 9.899494936, epsilon = 1e-4);
}

#[test]
fn explicit_rotation_origin_is_respected() {
    let (positions, indices) = box_mesh(4.0, 4.0, 6.0, [10.0, 0.0, 0.0]);
    let mut options = default_options();
    options.rotation_degrees = [0.0, 0.0, 90.0];
    options.rotation_origin = Some([0.0, 0.0, 0.0]);

    let result = process_mesh_native(&positions, &indices, &options).unwrap();

    assert_abs_diff_eq!(result.bounds[0], -4.0, epsilon = 1e-6);
    assert_abs_diff_eq!(result.bounds[1], 10.0, epsilon = 1e-6);
    assert_abs_diff_eq!(result.bounds[2], 0.0, epsilon = 1e-6);
    assert_abs_diff_eq!(result.bounds[3], 14.0, epsilon = 1e-6);
}

#[test]
fn through_hole_survives_when_keep_all_is_requested() {
    let (positions, indices) = through_hole_plate_mesh();
    let mut options = default_options();
    options.keep_mode = KeepMode::All;

    let result = process_mesh_native(&positions, &indices, &options).unwrap();

    assert_eq!(result.rings.len(), 1);
    assert_eq!(result.rings[0].holes.len(), 1);
    assert_abs_diff_eq!(result.area, 84.0, epsilon = 1e-5);
}

#[test]
fn outer_only_drops_holes() {
    let (positions, indices) = through_hole_plate_mesh();
    let result = process_mesh_native(&positions, &indices, &default_options()).unwrap();

    assert_eq!(result.rings.len(), 1);
    assert!(result.rings[0].holes.is_empty());
    assert_abs_diff_eq!(result.area, 100.0, epsilon = 1e-5);
}

#[test]
fn disconnected_bodies_support_keep_modes() {
    let (positions, indices) = disconnected_boxes_mesh();

    let mut all_options = default_options();
    all_options.keep_mode = KeepMode::All;
    let all = process_mesh_native(&positions, &indices, &all_options).unwrap();
    assert_eq!(all.rings.len(), 2);

    let mut largest_options = default_options();
    largest_options.keep_mode = KeepMode::Largest;
    let largest = process_mesh_native(&positions, &indices, &largest_options).unwrap();
    assert_eq!(largest.rings.len(), 1);
    assert_abs_diff_eq!(largest.area, 16.0, epsilon = 1e-6);
}

#[test]
fn negative_offset_can_collapse_geometry() {
    let (positions, indices) = square_plate_mesh(1.0, 1.0, 1.0);
    let mut options = default_options();
    options.offset_distance = -1.0;

    let result = process_mesh_native(&positions, &indices, &options).unwrap();

    assert!(result.rings.is_empty());
    assert!(result
        .warnings
        .iter()
        .any(|warning| warning.contains("Offset collapsed")));
}

#[test]
fn unit_conversion_rescales_output() {
    let (positions, indices) = square_plate_mesh(1.0, 1.0, 1.0);
    let mut options = default_options();
    options.source_units = Some("in".to_string());
    options.output_units = Some("mm".to_string());

    let result = process_mesh_native(&positions, &indices, &options).unwrap();

    assert_eq!(result.units.as_deref(), Some("mm"));
    assert_abs_diff_eq!(result.bounds[2], 25.4, epsilon = 1e-6);
    assert_abs_diff_eq!(result.bounds[3], 25.4, epsilon = 1e-6);
}

#[test]
fn invalid_inputs_are_rejected() {
    let options = default_options();
    assert!(process_mesh_native(&[0.0, 0.0], &[0, 1, 2], &options).is_err());
    assert!(process_mesh_native(&[0.0, 0.0, 0.0], &[0, 1], &options).is_err());

    let mut invalid_scale = default_options();
    invalid_scale.scale = 0.0;
    assert!(process_mesh_native(&[0.0, 0.0, 0.0], &[0, 0, 0], &invalid_scale).is_err());

    let mut invalid_direction = default_options();
    invalid_direction.direction = [0.0, 0.0, 0.0];
    assert!(process_mesh_native(&[0.0, 0.0, 0.0], &[0, 0, 0], &invalid_direction).is_err());
}

#[test]
fn processing_is_deterministic() {
    let (positions, indices) = through_hole_plate_mesh();
    let mut options = default_options();
    options.keep_mode = KeepMode::All;

    let first = process_mesh_native(&positions, &indices, &options).unwrap();
    let second = process_mesh_native(&positions, &indices, &options).unwrap();

    assert_eq!(first.rings, second.rings);
    assert_eq!(first.bounds, second.bounds);
    assert_eq!(first.warnings, second.warnings);
}

#[test]
fn offset_rings_native_fast_path_preserves_original_outline() {
    let rings = vec![RingSetDto {
        exterior: vec![[0.0, 0.0], [10.0, 0.0], [10.0, 8.0], [0.0, 8.0]],
        holes: Vec::new(),
    }];
    let options = OffsetOptions {
        offset_distance: 0.0,
        join_style: JoinStyle::Round,
        units: Some("mm".to_string()),
    };

    let result = offset_rings_native(&rings, &options).unwrap();

    assert_eq!(result.rings, rings);
    assert_eq!(result.body_count, 1);
    assert_abs_diff_eq!(result.area, 80.0, epsilon = 1e-6);
}

#[test]
fn union_rings_native_merges_overlapping_rings() {
    let rings = vec![
        RingSetDto {
            exterior: vec![[0.0, 0.0], [4.0, 0.0], [4.0, 4.0], [0.0, 4.0]],
            holes: Vec::new(),
        },
        RingSetDto {
            exterior: vec![[2.0, 0.0], [6.0, 0.0], [6.0, 4.0], [2.0, 4.0]],
            holes: Vec::new(),
        },
    ];

    let result = union_rings_native(&rings, Some("mm".to_string())).unwrap();

    assert_eq!(result.rings.len(), 1);
    assert_abs_diff_eq!(result.area, 24.0, epsilon = 1e-6);
}

#[test]
fn mitre_offset_falls_back_to_bevel_when_needed() {
    let rings = vec![RingSetDto {
        exterior: vec![
            [0.0, 0.0],
            [6.0, 0.0],
            [6.0, 0.1],
            [0.2, 0.1],
            [0.2, 6.0],
            [0.0, 6.0],
        ],
        holes: Vec::new(),
    }];
    let options = OffsetOptions {
        offset_distance: 0.4,
        join_style: JoinStyle::Mitre,
        units: Some("mm".to_string()),
    };

    let result = offset_rings_native(&rings, &options).unwrap();

    assert!(!result.rings.is_empty());
}

fn square_plate_mesh(width: f64, depth: f64, height: f64) -> (Vec<f64>, Vec<u32>) {
    box_mesh(width, depth, height, [0.0, 0.0, 0.0])
}

fn disconnected_boxes_mesh() -> (Vec<f64>, Vec<u32>) {
    let (mut left_positions, mut left_indices) = box_mesh(4.0, 4.0, 2.0, [0.0, 0.0, 0.0]);
    let (right_positions, right_indices) = box_mesh(2.0, 2.0, 2.0, [8.0, 0.0, 0.0]);

    let vertex_offset = (left_positions.len() / 3) as u32;
    left_positions.extend(right_positions);
    left_indices.extend(right_indices.into_iter().map(|index| index + vertex_offset));

    (left_positions, left_indices)
}

fn through_hole_plate_mesh() -> (Vec<f64>, Vec<u32>) {
    let mut positions = Vec::new();
    let mut indices = Vec::new();

    add_prism(
        &mut positions,
        &mut indices,
        0.0,
        0.0,
        3.0,
        10.0,
        1.0,
    );
    add_prism(
        &mut positions,
        &mut indices,
        7.0,
        0.0,
        10.0,
        10.0,
        1.0,
    );
    add_prism(
        &mut positions,
        &mut indices,
        3.0,
        7.0,
        7.0,
        10.0,
        1.0,
    );
    add_prism(
        &mut positions,
        &mut indices,
        3.0,
        0.0,
        7.0,
        3.0,
        1.0,
    );

    (positions, indices)
}

fn add_prism(
    positions: &mut Vec<f64>,
    indices: &mut Vec<u32>,
    min_x: f64,
    min_y: f64,
    max_x: f64,
    max_y: f64,
    height: f64,
) {
    let (next_positions, next_indices) =
        box_mesh(max_x - min_x, max_y - min_y, height, [min_x, min_y, 0.0]);
    let vertex_offset = (positions.len() / 3) as u32;
    positions.extend(next_positions);
    indices.extend(next_indices.into_iter().map(|index| index + vertex_offset));
}

fn box_mesh(
    width: f64,
    depth: f64,
    height: f64,
    origin: [f64; 3],
) -> (Vec<f64>, Vec<u32>) {
    let [ox, oy, oz] = origin;
    let vertices = [
        [ox, oy, oz],
        [ox + width, oy, oz],
        [ox + width, oy + depth, oz],
        [ox, oy + depth, oz],
        [ox, oy, oz + height],
        [ox + width, oy, oz + height],
        [ox + width, oy + depth, oz + height],
        [ox, oy + depth, oz + height],
    ];

    let positions = vertices.into_iter().flatten().collect::<Vec<_>>();
    let indices = vec![
        0, 1, 2, 0, 2, 3, // bottom
        4, 6, 5, 4, 7, 6, // top
        0, 4, 5, 0, 5, 1, // front
        1, 5, 6, 1, 6, 2, // right
        2, 6, 7, 2, 7, 3, // back
        3, 7, 4, 3, 4, 0, // left
    ];

    (positions, indices)
}
