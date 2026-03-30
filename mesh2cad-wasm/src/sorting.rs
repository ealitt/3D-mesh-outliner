use crate::export_types::{Point2, PolygonRecord};
use crate::math3d::signed_area;

pub fn sort_polygons(polygons: &mut [PolygonRecord]) {
    polygons.sort_by(|left, right| polygon_sort_key(left).cmp(&polygon_sort_key(right)));
}

pub fn sort_holes(holes: &mut [Vec<Point2>]) {
    holes.sort_by(|left, right| ring_sort_key(left).cmp(&ring_sort_key(right)));
}

pub fn polygon_sort_key(polygon: &PolygonRecord) -> SortKey {
    let (centroid_x, centroid_y) = ring_centroid(&polygon.exterior);
    let (min_x, min_y, _, _) = ring_bounds(&polygon.exterior);
    SortKey {
        area: sortable_float(-polygon_area_abs(polygon)),
        centroid_x: sortable_float(centroid_x),
        centroid_y: sortable_float(centroid_y),
        min_x: sortable_float(min_x),
        min_y: sortable_float(min_y),
    }
}

pub fn ring_sort_key(ring: &[Point2]) -> SortKey {
    let (centroid_x, centroid_y) = ring_centroid(ring);
    let (min_x, min_y, _, _) = ring_bounds(ring);
    SortKey {
        area: sortable_float(-signed_area(ring).abs()),
        centroid_x: sortable_float(centroid_x),
        centroid_y: sortable_float(centroid_y),
        min_x: sortable_float(min_x),
        min_y: sortable_float(min_y),
    }
}

pub fn polygon_area_abs(polygon: &PolygonRecord) -> f64 {
    let exterior = signed_area(&polygon.exterior).abs();
    let holes = polygon
        .holes
        .iter()
        .map(|hole| signed_area(hole).abs())
        .sum::<f64>();
    exterior - holes
}

pub fn ring_centroid(ring: &[Point2]) -> (f64, f64) {
    let area = signed_area(ring);
    if ring.is_empty() {
        return (0.0, 0.0);
    }

    if area.abs() <= 1e-18 {
        let sum_x = ring.iter().map(|point| point[0]).sum::<f64>();
        let sum_y = ring.iter().map(|point| point[1]).sum::<f64>();
        return (sum_x / ring.len() as f64, sum_y / ring.len() as f64);
    }

    let mut cx = 0.0;
    let mut cy = 0.0;
    for (index, point) in ring.iter().enumerate() {
        let next = ring[(index + 1) % ring.len()];
        let cross = (point[0] * next[1]) - (next[0] * point[1]);
        cx += (point[0] + next[0]) * cross;
        cy += (point[1] + next[1]) * cross;
    }

    let factor = 1.0 / (6.0 * area);
    (cx * factor, cy * factor)
}

pub fn ring_bounds(ring: &[Point2]) -> (f64, f64, f64, f64) {
    if ring.is_empty() {
        return (0.0, 0.0, 0.0, 0.0);
    }

    let mut min_x = f64::INFINITY;
    let mut min_y = f64::INFINITY;
    let mut max_x = f64::NEG_INFINITY;
    let mut max_y = f64::NEG_INFINITY;
    for [x, y] in ring {
        min_x = min_x.min(*x);
        min_y = min_y.min(*y);
        max_x = max_x.max(*x);
        max_y = max_y.max(*y);
    }
    (min_x, min_y, max_x, max_y)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct SortKey {
    area: i64,
    centroid_x: i64,
    centroid_y: i64,
    min_x: i64,
    min_y: i64,
}

fn sortable_float(value: f64) -> i64 {
    (value * 1_000_000_000_000_f64).round() as i64
}
