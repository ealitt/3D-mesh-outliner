use std::collections::{HashMap, HashSet};

use crate::cleanup::rings_to_polygons;
use crate::export_types::{Point2, PolygonRecord, ProjectedMesh, Shapes2};
use crate::math3d::{bbox_from_points, project_point, signed_area, transform_point_to_plane_local, ProjectionBasis, Vec3};

pub struct PlaneSection {
    pub overlay_scale: f64,
    pub polygons: Vec<PolygonRecord>,
    pub warnings: Vec<String>,
}

pub fn project_vertices(
    vertices: &[Vec3],
    basis: &ProjectionBasis,
    snap_grid: Option<f64>,
) -> ProjectedMesh {
    let projected_vertices = vertices
        .iter()
        .copied()
        .map(|vertex| project_point(vertex, basis))
        .collect::<Vec<_>>();

    let bounds = bbox_from_points(&projected_vertices);
    let span_x = bounds[2] - bounds[0];
    let span_y = bounds[3] - bounds[1];
    let span = span_x.max(span_y).max(1.0);
    let requested_grid = snap_grid
        .filter(|value| value.is_finite() && *value > 0.0)
        .unwrap_or(span * 1e-8);
    let overlay_scale = compute_overlay_scale(bounds, requested_grid);
    let resolved_grid = 1.0 / overlay_scale;
    let epsilon_area = span * span * 1e-18;

    let mut warnings = Vec::new();
    if resolved_grid > requested_grid * 1.000_000_1 {
        warnings.push(
            "Projection precision was relaxed slightly to fit the fixed overlay range."
                .to_string(),
        );
    }

    ProjectedMesh {
        vertices: projected_vertices,
        bounds,
        grid: resolved_grid,
        overlay_scale,
        epsilon_area,
        warnings,
    }
}

pub fn project_triangles(projected: &ProjectedMesh, indices: &[u32]) -> (Shapes2, usize) {
    let mut triangles = Vec::with_capacity(indices.len() / 3);
    let mut degenerate_count = 0;

    for chunk in indices.chunks_exact(3) {
        let a = projected.vertices[chunk[0] as usize];
        let b = projected.vertices[chunk[1] as usize];
        let c = projected.vertices[chunk[2] as usize];

        let qa = quantize_point(a, projected.grid);
        let qb = quantize_point(b, projected.grid);
        let qc = quantize_point(c, projected.grid);
        if qa == qb || qb == qc || qa == qc {
            degenerate_count += 1;
            continue;
        }

        let mut contour = vec![qa, qb, qc];
        let area = signed_area(&contour);
        if !area.is_finite() || area.abs() <= projected.epsilon_area {
            degenerate_count += 1;
            continue;
        }

        if area < 0.0 {
            contour.swap(1, 2);
        }
        triangles.push(vec![contour]);
    }

    (triangles, degenerate_count)
}

pub fn slice_mesh_on_plane(
    vertices: &[Vec3],
    indices: &[u32],
    basis: &ProjectionBasis,
    snap_grid: Option<f64>,
) -> PlaneSection {
    let epsilon = plane_slice_epsilon(vertices);
    let mut coplanar_triangles = 0usize;
    let mut raw_segments = Vec::new();

    for chunk in indices.chunks_exact(3) {
        let a = transform_point_to_plane_local(vertices[chunk[0] as usize], basis);
        let b = transform_point_to_plane_local(vertices[chunk[1] as usize], basis);
        let c = transform_point_to_plane_local(vertices[chunk[2] as usize], basis);
        let da = a.z;
        let db = b.z;
        let dc = c.z;

        if da.abs() <= epsilon && db.abs() <= epsilon && dc.abs() <= epsilon {
            coplanar_triangles += 1;
            continue;
        }

        if let Some([start, end]) = triangle_plane_segment(a, b, c, da, db, dc, epsilon) {
            raw_segments.push([[start.x, start.y], [end.x, end.y]]);
        }
    }

    let mut warnings = Vec::new();
    if coplanar_triangles > 0 {
        warnings.push("Coplanar triangles on the cut plane were skipped.".to_string());
    }
    if raw_segments.is_empty() {
        warnings.push("Plane cut produced no closed 2D regions.".to_string());
        return PlaneSection {
            overlay_scale: 1.0,
            polygons: Vec::new(),
            warnings,
        };
    }

    let segment_points = raw_segments
        .iter()
        .flat_map(|segment| [segment[0], segment[1]])
        .collect::<Vec<_>>();
    let bounds = bbox_from_points(&segment_points);
    let span_x = bounds[2] - bounds[0];
    let span_y = bounds[3] - bounds[1];
    let span = span_x.max(span_y).max(1.0);
    let requested_grid = snap_grid
        .filter(|value| value.is_finite() && *value > 0.0)
        .unwrap_or(span * 1e-8);
    let overlay_scale = compute_overlay_scale(bounds, requested_grid);
    let resolved_grid = 1.0 / overlay_scale;
    if resolved_grid > requested_grid * 1.000_000_1 {
        warnings.push(
            "Projection precision was relaxed slightly to fit the fixed overlay range."
                .to_string(),
        );
    }

    let mut segment_counts = HashMap::<SegmentKey, usize>::new();
    let mut point_lookup = HashMap::<PointKey, Point2>::new();
    for [start, end] in raw_segments {
        let qa = quantize_point(start, resolved_grid);
        let qb = quantize_point(end, resolved_grid);
        if nearly_same_point(qa, qb, resolved_grid) {
            continue;
        }

        let key_a = PointKey::from_point(qa, resolved_grid);
        let key_b = PointKey::from_point(qb, resolved_grid);
        if key_a == key_b {
            continue;
        }

        point_lookup.entry(key_a).or_insert(qa);
        point_lookup.entry(key_b).or_insert(qb);
        *segment_counts
            .entry(SegmentKey::new(key_a, key_b))
            .or_insert(0) += 1;
    }

    let unique_segments = segment_counts
        .into_iter()
        .filter_map(|(segment, count)| if count % 2 == 1 { Some(segment) } else { None })
        .collect::<Vec<_>>();
    let (rings, open_paths) = trace_closed_loops(&unique_segments, &point_lookup);
    if open_paths > 0 {
        warnings.push("Plane cut dropped open contour segments that could not be closed.".to_string());
    }

    let polygons = rings_to_polygons(rings);
    if polygons.is_empty() {
        warnings.push("Plane cut produced no closed 2D regions.".to_string());
    }

    PlaneSection {
        overlay_scale,
        polygons,
        warnings,
    }
}

fn quantize_point(point: [f64; 2], grid: f64) -> [f64; 2] {
    [
        quantize_value(point[0], grid),
        quantize_value(point[1], grid),
    ]
}

fn plane_slice_epsilon(vertices: &[Vec3]) -> f64 {
    if vertices.is_empty() {
        return 1e-9;
    }

    let mut min_x = f64::INFINITY;
    let mut min_y = f64::INFINITY;
    let mut min_z = f64::INFINITY;
    let mut max_x = f64::NEG_INFINITY;
    let mut max_y = f64::NEG_INFINITY;
    let mut max_z = f64::NEG_INFINITY;
    for vertex in vertices {
        min_x = min_x.min(vertex.x);
        min_y = min_y.min(vertex.y);
        min_z = min_z.min(vertex.z);
        max_x = max_x.max(vertex.x);
        max_y = max_y.max(vertex.y);
        max_z = max_z.max(vertex.z);
    }

    let diagonal = ((max_x - min_x).powi(2) + (max_y - min_y).powi(2) + (max_z - min_z).powi(2))
        .sqrt()
        .max(1.0);
    diagonal * 1e-9
}

fn triangle_plane_segment(
    a: Vec3,
    b: Vec3,
    c: Vec3,
    da: f64,
    db: f64,
    dc: f64,
    epsilon: f64,
) -> Option<[Vec3; 2]> {
    let mut points = Vec::with_capacity(4);
    collect_edge_plane_hits(a, b, da, db, epsilon, &mut points);
    collect_edge_plane_hits(b, c, db, dc, epsilon, &mut points);
    collect_edge_plane_hits(c, a, dc, da, epsilon, &mut points);
    dedupe_points(&mut points, epsilon * 8.0);

    if points.len() == 2 {
        Some([points[0], points[1]])
    } else {
        None
    }
}

fn collect_edge_plane_hits(
    start: Vec3,
    end: Vec3,
    start_distance: f64,
    end_distance: f64,
    epsilon: f64,
    output: &mut Vec<Vec3>,
) {
    let start_on_plane = start_distance.abs() <= epsilon;
    let end_on_plane = end_distance.abs() <= epsilon;
    if start_on_plane {
        output.push(start);
    }
    if end_on_plane {
        output.push(end);
    }

    let crosses_plane =
        (start_distance > epsilon && end_distance < -epsilon)
            || (start_distance < -epsilon && end_distance > epsilon);
    if crosses_plane {
        let t = start_distance / (start_distance - end_distance);
        output.push(start + ((end - start) * t));
    }
}

fn dedupe_points(points: &mut Vec<Vec3>, epsilon: f64) {
    let mut unique: Vec<Vec3> = Vec::with_capacity(points.len());
    for point in points.iter().copied() {
        if unique.iter().any(|existing| (*existing - point).length() <= epsilon) {
            continue;
        }
        unique.push(point);
    }
    *points = unique;
}

fn nearly_same_point(left: Point2, right: Point2, epsilon: f64) -> bool {
    (left[0] - right[0]).abs() <= epsilon && (left[1] - right[1]).abs() <= epsilon
}

fn trace_closed_loops(
    segments: &[SegmentKey],
    point_lookup: &HashMap<PointKey, Point2>,
) -> (Vec<Vec<Point2>>, usize) {
    let mut adjacency = HashMap::<PointKey, Vec<PointKey>>::new();
    let mut unused = HashSet::<SegmentKey>::new();
    for segment in segments.iter().copied() {
        adjacency.entry(segment.a).or_default().push(segment.b);
        adjacency.entry(segment.b).or_default().push(segment.a);
        unused.insert(segment);
    }

    let mut open_paths = 0usize;
    let mut rings = Vec::new();
    for segment in segments.iter().copied() {
        if !unused.remove(&segment) {
            continue;
        }

        let mut ring = vec![point_lookup[&segment.a], point_lookup[&segment.b]];
        let mut previous = segment.a;
        let mut current = segment.b;
        let mut closed = false;

        loop {
            if current == segment.a {
                closed = true;
                break;
            }

            let Some(neighbors) = adjacency.get(&current) else {
                break;
            };

            let mut next = None;
            for neighbor in neighbors.iter().copied() {
                if neighbor == previous {
                    continue;
                }
                let candidate = SegmentKey::new(current, neighbor);
                if unused.remove(&candidate) {
                    next = Some(neighbor);
                    break;
                }
            }

            let Some(next_point) = next else {
                break;
            };

            previous = current;
            current = next_point;
            if current != segment.a {
                ring.push(point_lookup[&current]);
            }
        }

        if closed && ring.len() >= 3 {
            rings.push(ring);
        } else {
            open_paths += 1;
        }
    }

    (rings, open_paths)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
struct PointKey {
    x: i64,
    y: i64,
}

impl PointKey {
    fn from_point(point: Point2, grid: f64) -> Self {
        Self {
            x: (point[0] / grid).round() as i64,
            y: (point[1] / grid).round() as i64,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct SegmentKey {
    a: PointKey,
    b: PointKey,
}

impl SegmentKey {
    fn new(left: PointKey, right: PointKey) -> Self {
        if left <= right {
            Self { a: left, b: right }
        } else {
            Self { a: right, b: left }
        }
    }
}

fn quantize_value(value: f64, grid: f64) -> f64 {
    if !value.is_finite() || !grid.is_finite() || grid <= 0.0 {
        return value;
    }
    (value / grid).round() * grid
}

fn compute_overlay_scale(bounds: [f64; 4], requested_grid: f64) -> f64 {
    let half_width = (bounds[2] - bounds[0]) * 0.5;
    let half_height = (bounds[3] - bounds[1]) * 0.5;
    let half_span = half_width.max(half_height);
    if half_span <= f64::EPSILON {
        return 1.0 / requested_grid.max(1.0);
    }

    let safe_scale = 2f64.powf(29.0 - half_span.log2().trunc());
    let requested_scale = 1.0 / requested_grid.max(f64::MIN_POSITIVE);
    requested_scale.min(safe_scale).max(1.0)
}
