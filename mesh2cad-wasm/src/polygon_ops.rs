use core::f64::consts::PI;

use i_overlay::core::fill_rule::FillRule;
use i_overlay::core::overlay_rule::OverlayRule;
use i_overlay::float::overlay::{FloatOverlay, OverlayOptions};
use i_overlay::mesh::outline::offset::OutlineOffset;
use i_overlay::mesh::style::{LineJoin, OutlineStyle};

use crate::export_types::Shapes2;
use crate::types::JoinStyle;

pub fn union_projected_triangles(
    triangles: &[crate::export_types::Shape2],
    overlay_scale: f64,
    batch_size: usize,
) -> Result<Shapes2, String> {
    if triangles.is_empty() {
        return Ok(Vec::new());
    }

    let empty: Shapes2 = Vec::new();
    let mut accumulator: Shapes2 = Vec::new();
    let chunk_size = batch_size.max(1);

    for batch in triangles.chunks(chunk_size) {
        let batch_shapes = batch.to_vec();
        let batch_union = simplify_subject_fixed_scale(&batch_shapes, &empty, overlay_scale)?;
        accumulator = if accumulator.is_empty() {
            batch_union
        } else {
            union_shapes_fixed_scale(&accumulator, &batch_union, overlay_scale)?
        };
    }

    Ok(accumulator)
}

pub fn union_polygon_shapes(
    shapes: &Shapes2,
    overlay_scale: f64,
    batch_size: usize,
) -> Result<Shapes2, String> {
    if shapes.is_empty() {
        return Ok(Vec::new());
    }

    let empty: Shapes2 = Vec::new();
    let mut accumulator: Shapes2 = Vec::new();
    let chunk_size = batch_size.max(1);

    for batch in shapes.chunks(chunk_size) {
        let batch_shapes = batch.to_vec();
        let batch_union = simplify_subject_fixed_scale(&batch_shapes, &empty, overlay_scale)?;
        accumulator = if accumulator.is_empty() {
            batch_union
        } else {
            union_shapes_fixed_scale(&accumulator, &batch_union, overlay_scale)?
        };
    }

    Ok(accumulator)
}

pub fn scale_shapes(shapes: &Shapes2, scale: f64) -> Shapes2 {
    if (scale - 1.0).abs() <= f64::EPSILON {
        return shapes.clone();
    }

    shapes
        .iter()
        .map(|shape| {
            shape
                .iter()
                .map(|ring| {
                    ring.iter()
                        .map(|point| [point[0] * scale, point[1] * scale])
                        .collect::<Vec<_>>()
                })
                .collect::<Vec<_>>()
        })
        .collect()
}

pub fn offset_shapes(shapes: &Shapes2, distance: f64, join_style: JoinStyle, overlay_scale: f64) -> Result<Shapes2, String> {
    if shapes.is_empty() || distance.abs() <= f64::EPSILON {
        return Ok(shapes.clone());
    }

    let style = OutlineStyle::new(distance).line_join(map_join_style(join_style));
    shapes
        .outline_fixed_scale(&style, overlay_scale)
        .map_err(|error| format!("Offset operation failed: {error:?}"))
}

fn simplify_subject_fixed_scale(
    subject: &Shapes2,
    empty: &Shapes2,
    overlay_scale: f64,
) -> Result<Shapes2, String> {
    FloatOverlay::with_subj_and_clip_fixed_scale_custom(
        subject,
        empty,
        overlay_options(),
        Default::default(),
        overlay_scale,
    )
    .map_err(|error| format!("Triangle union failed: {error:?}"))?
    .overlay(OverlayRule::Subject, FillRule::NonZero)
    .pipe(Ok)
}

fn union_shapes_fixed_scale(
    left: &Shapes2,
    right: &Shapes2,
    overlay_scale: f64,
) -> Result<Shapes2, String> {
    FloatOverlay::with_subj_and_clip_fixed_scale_custom(
        left,
        right,
        overlay_options(),
        Default::default(),
        overlay_scale,
    )
    .map_err(|error| format!("Batch union failed: {error:?}"))?
    .overlay(OverlayRule::Union, FillRule::NonZero)
    .pipe(Ok)
}

fn overlay_options() -> OverlayOptions<f64> {
    OverlayOptions {
        clean_result: true,
        ..Default::default()
    }
}

fn map_join_style(join_style: JoinStyle) -> LineJoin<f64> {
    match join_style {
        JoinStyle::Round => LineJoin::Round(PI / 18.0),
        JoinStyle::Mitre => LineJoin::Miter(PI * 0.01),
        JoinStyle::Bevel => LineJoin::Bevel,
    }
}

trait Pipe: Sized {
    fn pipe<T>(self, f: impl FnOnce(Self) -> T) -> T {
        f(self)
    }
}

impl<T> Pipe for T {}
