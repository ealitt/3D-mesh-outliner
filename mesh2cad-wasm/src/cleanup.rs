use crate::export_types::{Point2, PolygonRecord, Shape2, Shapes2};
use crate::math3d::signed_area;
use crate::sorting::{polygon_area_abs, ring_bounds, ring_sort_key, sort_holes, sort_polygons};
use crate::types::KeepMode;

const SNAP_EPSILON: f64 = 1e-12;

pub fn shapes_to_polygons(shapes: Shapes2) -> Vec<PolygonRecord> {
    let mut polygons = Vec::with_capacity(shapes.len());
    for shape in shapes {
        if let Some(polygon) = normalize_shape(shape) {
            polygons.push(polygon);
        }
    }
    sort_polygons(&mut polygons);
    polygons
}

pub fn polygons_to_shapes(polygons: &[PolygonRecord]) -> Shapes2 {
    polygons
        .iter()
        .map(|polygon| {
            let mut shape = Vec::with_capacity(1 + polygon.holes.len());
            shape.push(polygon.exterior.clone());
            shape.extend(polygon.holes.iter().cloned());
            shape
        })
        .collect()
}

pub fn apply_keep_mode(mut polygons: Vec<PolygonRecord>, keep_mode: KeepMode) -> Vec<PolygonRecord> {
    sort_polygons(&mut polygons);
    match keep_mode {
        KeepMode::All => polygons,
        KeepMode::Largest => polygons.into_iter().take(1).collect(),
        KeepMode::OuterOnly => {
            let mut selected = Vec::new();
            for polygon in polygons {
                let shell = PolygonRecord {
                    exterior: polygon.exterior,
                    holes: Vec::new(),
                };
                if selected
                    .iter()
                    .any(|existing: &PolygonRecord| {
                        shell_within_shell(&shell.exterior, &existing.exterior)
                    })
                {
                    continue;
                }
                selected.push(shell);
            }
            selected
        }
    }
}

pub fn apply_min_area(polygons: Vec<PolygonRecord>, min_area: f64) -> Vec<PolygonRecord> {
    if min_area <= 0.0 {
        return polygons;
    }
    polygons
        .into_iter()
        .filter(|polygon| polygon_area_abs(polygon) >= min_area)
        .collect()
}

pub fn simplify_polygons(polygons: Vec<PolygonRecord>, tolerance: f64) -> Vec<PolygonRecord> {
    if tolerance <= 0.0 {
        return polygons;
    }

    let mut simplified = Vec::with_capacity(polygons.len());
    for polygon in polygons {
        if let Some(next) = simplify_polygon(polygon, tolerance) {
            simplified.push(next);
        }
    }
    sort_polygons(&mut simplified);
    simplified
}

pub fn normalize_final_polygons(polygons: Vec<PolygonRecord>) -> Vec<PolygonRecord> {
    let mut normalized = polygons
        .into_iter()
        .filter_map(|polygon| {
            normalize_shape({
                let mut shape = Vec::with_capacity(1 + polygon.holes.len());
                shape.push(polygon.exterior);
                shape.extend(polygon.holes);
                shape
            })
        })
        .collect::<Vec<_>>();
    sort_polygons(&mut normalized);
    normalized
}

pub fn rings_to_polygons(rings: Vec<Vec<Point2>>) -> Vec<PolygonRecord> {
    let mut normalized = rings
        .into_iter()
        .filter_map(|ring| normalize_ring(&ring, false))
        .collect::<Vec<_>>();
    normalized.sort_by(|left, right| ring_sort_key(left).cmp(&ring_sort_key(right)));

    let mut parents = vec![None; normalized.len()];
    let mut depths = vec![0usize; normalized.len()];
    for index in 0..normalized.len() {
        let sample = normalized[index].first().copied();
        if let Some(sample_point) = sample {
            for candidate in 0..index {
                if point_in_ring_or_on_boundary(sample_point, &normalized[candidate]) {
                    parents[index] = Some(candidate);
                    depths[index] = depths[candidate] + 1;
                    break;
                }
            }
        }
    }

    let mut shell_lookup = vec![None; normalized.len()];
    let mut polygons = Vec::new();
    for index in 0..normalized.len() {
        if depths[index] % 2 == 0 {
            let polygon_index = polygons.len();
            polygons.push(PolygonRecord {
                exterior: normalized[index].clone(),
                holes: Vec::new(),
            });
            shell_lookup[index] = Some(polygon_index);
            continue;
        }

        let mut ancestor = parents[index];
        while let Some(parent) = ancestor {
            if depths[parent] % 2 == 0 {
                if let Some(polygon_index) = shell_lookup[parent] {
                    if let Some(hole) = normalize_ring(&normalized[index], true) {
                        polygons[polygon_index].holes.push(hole);
                    }
                }
                break;
            }
            ancestor = parents[parent];
        }
    }

    for polygon in &mut polygons {
        sort_holes(&mut polygon.holes);
    }
    sort_polygons(&mut polygons);
    polygons
}

fn normalize_shape(shape: Shape2) -> Option<PolygonRecord> {
    let mut contours = shape.into_iter();
    let exterior = normalize_ring(&contours.next()?, false)?;
    let mut holes = contours
        .filter_map(|ring| normalize_ring(&ring, true))
        .collect::<Vec<_>>();
    sort_holes(&mut holes);
    Some(PolygonRecord { exterior, holes })
}

fn simplify_polygon(polygon: PolygonRecord, tolerance: f64) -> Option<PolygonRecord> {
    let mut shape = Vec::with_capacity(1 + polygon.holes.len());
    shape.push(simplify_ring(&polygon.exterior, tolerance));
    shape.extend(polygon.holes.iter().map(|hole| simplify_ring(hole, tolerance)));
    normalize_shape(shape)
}

fn normalize_ring(points: &[Point2], clockwise: bool) -> Option<Vec<Point2>> {
    let mut cleaned = remove_duplicate_vertices(points);
    if cleaned.len() < 3 {
        return None;
    }

    cleaned = remove_collinear_vertices(&cleaned);
    if cleaned.len() < 3 {
        return None;
    }

    let area = signed_area(&cleaned);
    if !area.is_finite() || area.abs() <= 1e-18 {
        return None;
    }

    if clockwise && area > 0.0 {
        cleaned.reverse();
    }
    if !clockwise && area < 0.0 {
        cleaned.reverse();
    }

    for point in &mut cleaned {
        if point[0].abs() < SNAP_EPSILON {
            point[0] = 0.0;
        }
        if point[1].abs() < SNAP_EPSILON {
            point[1] = 0.0;
        }
    }

    Some(cleaned)
}

fn remove_duplicate_vertices(points: &[Point2]) -> Vec<Point2> {
    let mut cleaned = Vec::with_capacity(points.len());
    for point in points.iter().copied() {
        let snapped = [snap_value(point[0]), snap_value(point[1])];
        if cleaned.last().copied() != Some(snapped) {
            cleaned.push(snapped);
        }
    }
    if cleaned.first() == cleaned.last() {
        cleaned.pop();
    }
    cleaned
}

fn remove_collinear_vertices(points: &[Point2]) -> Vec<Point2> {
    if points.len() <= 3 {
        return points.to_vec();
    }

    let mut output = Vec::with_capacity(points.len());
    for index in 0..points.len() {
        let prev = points[(index + points.len() - 1) % points.len()];
        let curr = points[index];
        let next = points[(index + 1) % points.len()];
        if point_line_distance(curr, prev, next) <= SNAP_EPSILON {
            continue;
        }
        output.push(curr);
    }

    if output.len() < 3 {
        points.to_vec()
    } else {
        output
    }
}

fn simplify_ring(points: &[Point2], tolerance: f64) -> Vec<Point2> {
    let mut simplified = points.to_vec();
    if simplified.len() <= 3 {
        return simplified;
    }

    loop {
        let mut removed = false;
        if simplified.len() <= 3 {
            break;
        }

        let mut next = Vec::with_capacity(simplified.len());
        for index in 0..simplified.len() {
            let prev = simplified[(index + simplified.len() - 1) % simplified.len()];
            let curr = simplified[index];
            let next_point = simplified[(index + 1) % simplified.len()];
            if point_line_distance(curr, prev, next_point) <= tolerance && simplified.len() - next.len() > 3 {
                removed = true;
                continue;
            }
            next.push(curr);
        }

        if !removed || next.len() < 3 {
            break;
        }
        simplified = next;
    }

    simplified
}

fn shell_within_shell(candidate: &[Point2], container: &[Point2]) -> bool {
    candidate
        .iter()
        .copied()
        .all(|point| point_in_ring_or_on_boundary(point, container))
}

fn point_in_ring_or_on_boundary(point: Point2, ring: &[Point2]) -> bool {
    let (min_x, min_y, max_x, max_y) = ring_bounds(ring);
    if point[0] < min_x - SNAP_EPSILON
        || point[0] > max_x + SNAP_EPSILON
        || point[1] < min_y - SNAP_EPSILON
        || point[1] > max_y + SNAP_EPSILON
    {
        return false;
    }

    let mut inside = false;
    for index in 0..ring.len() {
        let a = ring[index];
        let b = ring[(index + 1) % ring.len()];
        if point_on_segment(point, a, b) {
            return true;
        }

        let intersects = ((a[1] > point[1]) != (b[1] > point[1]))
            && (point[0]
                < ((b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1] + f64::EPSILON)) + a[0]);
        if intersects {
            inside = !inside;
        }
    }

    inside
}

fn point_on_segment(point: Point2, start: Point2, end: Point2) -> bool {
    let cross = ((end[0] - start[0]) * (point[1] - start[1]))
        - ((end[1] - start[1]) * (point[0] - start[0]));
    if cross.abs() > SNAP_EPSILON {
        return false;
    }

    let dot = ((point[0] - start[0]) * (point[0] - end[0]))
        + ((point[1] - start[1]) * (point[1] - end[1]));
    dot <= SNAP_EPSILON
}

fn point_line_distance(point: Point2, start: Point2, end: Point2) -> f64 {
    let dx = end[0] - start[0];
    let dy = end[1] - start[1];
    if dx.abs() < SNAP_EPSILON && dy.abs() < SNAP_EPSILON {
        return ((point[0] - start[0]).powi(2) + (point[1] - start[1]).powi(2)).sqrt();
    }

    let numerator = ((point[0] - start[0]) * dy) - ((point[1] - start[1]) * dx);
    numerator.abs() / (dx * dx + dy * dy).sqrt()
}

fn snap_value(value: f64) -> f64 {
    if value.abs() < SNAP_EPSILON {
        0.0
    } else {
        value
    }
}
