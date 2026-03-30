use wasm_bindgen::prelude::*;

use crate::cleanup::{
    apply_keep_mode, apply_min_area, normalize_final_polygons, polygons_to_shapes, shapes_to_polygons,
    simplify_polygons,
};
use crate::export_types::PolygonRecord;
use crate::math3d::{build_projection_basis, build_projection_basis_from_frame, ProjectionBasis, Vec3};
use crate::polygon_ops::{offset_shapes, scale_shapes, union_polygon_shapes, union_projected_triangles};
use crate::projection::{project_triangles, project_vertices, slice_mesh_on_plane};
use crate::sorting::{polygon_area_abs, sort_holes, sort_polygons};
use crate::transforms::{rotate_vector_degrees, surface_centroid, transform_vertices, validate_mesh_inputs};
use crate::types::{
    JoinStyle, OffsetOptions, OffsetStage, ProcessOptions, ProcessResultDto, ProjectionMode, RingSetDto,
};
use crate::units::resolve_unit_scale;

#[wasm_bindgen]
pub fn process_mesh(
    positions: Vec<f64>,
    indices: Vec<u32>,
    options: JsValue,
) -> Result<JsValue, JsValue> {
    let parsed: ProcessOptions =
        serde_wasm_bindgen::from_value(options).map_err(|error| js_error(error.to_string()))?;
    let result = process_mesh_native(&positions, &indices, &parsed).map_err(js_error)?;
    serde_wasm_bindgen::to_value(&result).map_err(|error| js_error(error.to_string()))
}

#[wasm_bindgen]
pub fn offset_rings(rings: JsValue, options: JsValue) -> Result<JsValue, JsValue> {
    let parsed_rings: Vec<RingSetDto> =
        serde_wasm_bindgen::from_value(rings).map_err(|error| js_error(error.to_string()))?;
    let parsed_options: OffsetOptions =
        serde_wasm_bindgen::from_value(options).map_err(|error| js_error(error.to_string()))?;
    let result = offset_rings_native(&parsed_rings, &parsed_options).map_err(js_error)?;
    serde_wasm_bindgen::to_value(&result).map_err(|error| js_error(error.to_string()))
}

#[wasm_bindgen]
pub fn union_rings(rings: JsValue, units: JsValue) -> Result<JsValue, JsValue> {
    let parsed_rings: Vec<RingSetDto> =
        serde_wasm_bindgen::from_value(rings).map_err(|error| js_error(error.to_string()))?;
    let parsed_units: Option<String> =
        serde_wasm_bindgen::from_value(units).map_err(|error| js_error(error.to_string()))?;
    let result = union_rings_native(&parsed_rings, parsed_units).map_err(js_error)?;
    serde_wasm_bindgen::to_value(&result).map_err(|error| js_error(error.to_string()))
}

pub fn process_mesh_native(
    positions: &[f64],
    indices: &[u32],
    options: &ProcessOptions,
) -> Result<ProcessResultDto, String> {
    validate_mesh_inputs(positions, indices)?;
    if !options.scale.is_finite() || options.scale <= 0.0 {
        return Err("Scale must be greater than zero.".to_string());
    }

    let mut warnings = Vec::new();
    let (unit_scale, units, unit_warnings) =
        resolve_unit_scale(options.source_units.as_deref(), options.output_units.as_deref());
    warnings.extend(unit_warnings);

    let transformed = transform_vertices(
        positions,
        indices,
        unit_scale,
        options.rotation_degrees,
        options.rotation_origin,
        options.translation,
    );
    let (mut polygons, overlay_scale) = match options.projection_mode {
        ProjectionMode::Silhouette => {
            let basis = build_projection_basis(options.direction, options.origin)?;
            let projected = project_vertices(&transformed, &basis, options.snap_grid);
            warnings.extend(projected.warnings.clone());

            let (triangles, degenerate_count) = project_triangles(&projected, indices);
            if triangles.is_empty() {
                warnings.push("Projection produced no closed 2D regions.".to_string());
            }
            if degenerate_count == indices.len() / 3 && !indices.is_empty() {
                warnings.push("All projected triangles were degenerate after projection.".to_string());
            }

            let unioned = union_projected_triangles(
                &triangles,
                projected.overlay_scale,
                options.union_batch_size,
            )?;
            (shapes_to_polygons(unioned), projected.overlay_scale)
        }
        ProjectionMode::PlaneCut => {
            let plane_basis = resolve_plane_cut_basis(&transformed, indices, options)?;
            let plane_section = slice_mesh_on_plane(&transformed, indices, &plane_basis, options.snap_grid);
            warnings.extend(plane_section.warnings);
            (plane_section.polygons, plane_section.overlay_scale)
        }
    };

    polygons = apply_keep_mode(polygons, options.keep_mode);
    polygons = apply_min_area(polygons, options.min_area);
    if !indices.is_empty() && polygons.is_empty() {
        warnings.push("Cleanup removed all projected regions.".to_string());
    }

    if options.simplify_tolerance > 0.0 {
        polygons = simplify_polygons(polygons, options.simplify_tolerance);
        polygons = apply_keep_mode(polygons, options.keep_mode);
        polygons = apply_min_area(polygons, options.min_area);
    }

    let processed = apply_scale_and_offset(
        polygons,
        options.scale,
        options.offset_distance,
        options.offset_stage,
        options.join_style,
        overlay_scale,
        &mut warnings,
    )?;

    let final_polygons = normalize_final_polygons(processed);
    let (area, bounds, ring_sets) = serialize_polygons(final_polygons);

    let body_count = ring_sets.len();
    Ok(ProcessResultDto {
        rings: ring_sets,
        bounds,
        area,
        units,
        body_count,
        warnings: dedupe_warnings(warnings),
    })
}

pub fn offset_rings_native(
    rings: &[RingSetDto],
    options: &OffsetOptions,
) -> Result<ProcessResultDto, String> {
    let polygons = rings
        .iter()
        .map(|ring| PolygonRecord {
            exterior: ring.exterior.clone(),
            holes: ring.holes.clone(),
        })
        .collect::<Vec<_>>();
    if options.offset_distance.abs() <= f64::EPSILON {
        let final_polygons = normalize_final_polygons(polygons);
        let (area, bounds, ring_sets) = serialize_polygons(final_polygons);
        let body_count = ring_sets.len();
        return Ok(ProcessResultDto {
            rings: ring_sets,
            bounds,
            area,
            units: options.units.clone(),
            body_count,
            warnings: Vec::new(),
        });
    }

    let shapes = polygons_to_shapes(&polygons);
    let overlay_scale = compute_overlay_scale_from_polygons(&polygons);

    let mut warnings = Vec::new();
    let offset_shapes = match offset_shapes(
        &shapes,
        options.offset_distance,
        options.join_style,
        overlay_scale,
    ) {
        Ok(result) => result,
        Err(error) if options.join_style == JoinStyle::Mitre => {
            warnings.push("Mitre offset failed for this geometry; fell back to bevel joins.".to_string());
            offset_shapes(&shapes, options.offset_distance, JoinStyle::Bevel, overlay_scale)
                .map_err(|fallback_error| format!("{error}; bevel fallback also failed: {fallback_error}"))?
        }
        Err(error) => return Err(error),
    };
    if !shapes.is_empty() && offset_shapes.is_empty() && options.offset_distance.abs() > f64::EPSILON {
        warnings.push("Offset collapsed the projected region to empty geometry.".to_string());
    }

    let final_polygons = normalize_final_polygons(shapes_to_polygons(offset_shapes));
    let (area, bounds, ring_sets) = serialize_polygons(final_polygons);
    let body_count = ring_sets.len();

    Ok(ProcessResultDto {
        rings: ring_sets,
        bounds,
        area,
        units: options.units.clone(),
        body_count,
        warnings,
    })
}

pub fn union_rings_native(
    rings: &[RingSetDto],
    units: Option<String>,
) -> Result<ProcessResultDto, String> {
    let polygons = rings
        .iter()
        .map(|ring| PolygonRecord {
            exterior: ring.exterior.clone(),
            holes: ring.holes.clone(),
        })
        .collect::<Vec<_>>();

    let shapes = polygons_to_shapes(&polygons);
    let overlay_scale = compute_overlay_scale_from_polygons(&polygons);
    let merged_shapes = union_polygon_shapes(&shapes, overlay_scale, 4096)?;
    let final_polygons = normalize_final_polygons(shapes_to_polygons(merged_shapes));
    let (area, bounds, ring_sets) = serialize_polygons(final_polygons);
    let body_count = ring_sets.len();

    Ok(ProcessResultDto {
        rings: ring_sets,
        bounds,
        area,
        units,
        body_count,
        warnings: Vec::new(),
    })
}

fn resolve_plane_cut_basis(
    transformed: &[Vec3],
    indices: &[u32],
    options: &ProcessOptions,
) -> Result<ProjectionBasis, String> {
    if let (Some(origin), Some(normal)) = (options.plane_origin, options.plane_normal) {
        return build_projection_basis_from_frame(
            origin,
            normal,
            options.plane_basis_u,
            options.plane_basis_v,
        );
    }

    let transformed_centroid = surface_centroid(transformed, indices);
    let plane_origin = options
        .plane_origin
        .map(Vec3::from_array)
        .unwrap_or_else(|| transformed_centroid + Vec3::from_array(options.plane_translation));
    let plane_normal = options
        .plane_normal
        .map(Vec3::from_array)
        .unwrap_or_else(|| rotate_vector_degrees(Vec3::from_array([0.0, 0.0, 1.0]), options.plane_rotation_degrees));

    build_projection_basis_from_frame(
        plane_origin.to_array(),
        plane_normal.to_array(),
        options.plane_basis_u,
        options.plane_basis_v,
    )
}

fn apply_scale_and_offset(
    polygons: Vec<PolygonRecord>,
    scale: f64,
    offset_distance: f64,
    offset_stage: OffsetStage,
    join_style: crate::types::JoinStyle,
    overlay_scale: f64,
    warnings: &mut Vec<String>,
) -> Result<Vec<PolygonRecord>, String> {
    if (scale - 1.0).abs() <= f64::EPSILON && offset_distance.abs() <= f64::EPSILON {
        return Ok(polygons);
    }

    let shapes = polygons_to_shapes(&polygons);
    let processed_shapes = match offset_stage {
        OffsetStage::PreScale => {
            let offset = offset_shapes(&shapes, offset_distance, join_style, overlay_scale)?;
            if !shapes.is_empty() && offset.is_empty() && offset_distance.abs() > f64::EPSILON {
                warnings.push("Offset collapsed the projected region to empty geometry.".to_string());
            }
            scale_shapes(&offset, scale)
        }
        OffsetStage::PostScale => {
            let scaled = scale_shapes(&shapes, scale);
            let scaled_overlay = overlay_scale / scale.max(f64::MIN_POSITIVE);
            let offset = offset_shapes(&scaled, offset_distance, join_style, scaled_overlay)?;
            if !scaled.is_empty() && offset.is_empty() && offset_distance.abs() > f64::EPSILON {
                warnings.push("Offset collapsed the projected region to empty geometry.".to_string());
            }
            offset
        }
    };

    Ok(shapes_to_polygons(processed_shapes))
}

fn serialize_polygons(polygons: Vec<PolygonRecord>) -> (f64, [f64; 4], Vec<RingSetDto>) {
    let mut sorted = polygons;
    sort_polygons(&mut sorted);

    let mut rings = Vec::with_capacity(sorted.len());
    let mut area = 0.0;
    let mut bounds = [0.0, 0.0, 0.0, 0.0];
    let mut seeded_bounds = false;

    for polygon in sorted {
        area += polygon_area_abs(&polygon);
        let (min_x, min_y, max_x, max_y) = polygon_bounds(&polygon);
        if !seeded_bounds {
            bounds = [min_x, min_y, max_x, max_y];
            seeded_bounds = true;
        } else {
            bounds[0] = bounds[0].min(min_x);
            bounds[1] = bounds[1].min(min_y);
            bounds[2] = bounds[2].max(max_x);
            bounds[3] = bounds[3].max(max_y);
        }

        let mut holes = polygon.holes;
        sort_holes(&mut holes);
        rings.push(RingSetDto {
            exterior: polygon.exterior,
            holes,
        });
    }

    (area, bounds, rings)
}

fn polygon_bounds(polygon: &PolygonRecord) -> (f64, f64, f64, f64) {
    let mut min_x = f64::INFINITY;
    let mut min_y = f64::INFINITY;
    let mut max_x = f64::NEG_INFINITY;
    let mut max_y = f64::NEG_INFINITY;

    for point in polygon
        .exterior
        .iter()
        .chain(polygon.holes.iter().flat_map(|hole| hole.iter()))
    {
        min_x = min_x.min(point[0]);
        min_y = min_y.min(point[1]);
        max_x = max_x.max(point[0]);
        max_y = max_y.max(point[1]);
    }

    if !min_x.is_finite() {
        (0.0, 0.0, 0.0, 0.0)
    } else {
        (min_x, min_y, max_x, max_y)
    }
}

fn dedupe_warnings(warnings: Vec<String>) -> Vec<String> {
    let mut seen = std::collections::BTreeSet::new();
    let mut deduped = Vec::new();
    for warning in warnings {
        if seen.insert(warning.clone()) {
            deduped.push(warning);
        }
    }
    deduped
}

fn compute_overlay_scale_from_polygons(polygons: &[PolygonRecord]) -> f64 {
    let mut bounds = [0.0, 0.0, 0.0, 0.0];
    let mut seeded = false;
    for polygon in polygons {
        let polygon_bounds = polygon_bounds(polygon);
        if !seeded {
            bounds = [
                polygon_bounds.0,
                polygon_bounds.1,
                polygon_bounds.2,
                polygon_bounds.3,
            ];
            seeded = true;
        } else {
            bounds[0] = bounds[0].min(polygon_bounds.0);
            bounds[1] = bounds[1].min(polygon_bounds.1);
            bounds[2] = bounds[2].max(polygon_bounds.2);
            bounds[3] = bounds[3].max(polygon_bounds.3);
        }
    }

    let span = (bounds[2] - bounds[0]).max(bounds[3] - bounds[1]).max(1.0);
    let requested_grid = span * 1e-8;
    let half_span = ((bounds[2] - bounds[0]) * 0.5).max((bounds[3] - bounds[1]) * 0.5);
    if half_span <= f64::EPSILON {
        return 1.0 / requested_grid.max(1.0);
    }

    let safe_scale = 2f64.powf(29.0 - half_span.log2().trunc());
    let requested_scale = 1.0 / requested_grid.max(f64::MIN_POSITIVE);
    requested_scale.min(safe_scale).max(1.0)
}

fn js_error(message: String) -> JsValue {
    JsValue::from_str(&message)
}
