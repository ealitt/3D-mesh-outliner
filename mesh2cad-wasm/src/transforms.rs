use crate::math3d::Vec3;

pub fn validate_mesh_inputs(positions: &[f64], indices: &[u32]) -> Result<(), String> {
    if positions.len() % 3 != 0 {
        return Err("Positions must contain xyz triplets.".to_string());
    }
    if indices.len() % 3 != 0 {
        return Err("Indices must contain triangle triplets.".to_string());
    }

    let vertex_count = positions.len() / 3;
    for index in indices {
        if (*index as usize) >= vertex_count {
            return Err("Indices reference vertices outside the provided position buffer.".to_string());
        }
    }

    Ok(())
}

pub fn transform_vertices(
    positions: &[f64],
    indices: &[u32],
    unit_scale: f64,
    rotation_degrees: [f64; 3],
    rotation_origin: Option<[f64; 3]>,
    translation: [f64; 3],
) -> Vec<Vec3> {
    let mut vertices = positions_to_vertices(positions);
    for vertex in &mut vertices {
        *vertex = *vertex * unit_scale;
    }

    let center = rotation_origin
        .map(|origin| Vec3::from_array(origin) * unit_scale)
        .unwrap_or_else(|| surface_centroid(&vertices, indices));
    let translation = Vec3::from_array(translation);
    let rotation = EulerRotation::from_degrees(rotation_degrees);

    for vertex in &mut vertices {
        let local = *vertex - center;
        let rotated = rotation.apply(local);
        *vertex = center + rotated + translation;
    }

    vertices
}

pub fn surface_centroid(vertices: &[Vec3], indices: &[u32]) -> Vec3 {
    surface_centroid_impl(vertices, indices)
}

pub fn rotate_vector_degrees(value: Vec3, rotation_degrees: [f64; 3]) -> Vec3 {
    EulerRotation::from_degrees(rotation_degrees).apply(value)
}

fn positions_to_vertices(positions: &[f64]) -> Vec<Vec3> {
    let mut vertices = Vec::with_capacity(positions.len() / 3);
    for chunk in positions.chunks_exact(3) {
        vertices.push(Vec3 {
            x: chunk[0],
            y: chunk[1],
            z: chunk[2],
        });
    }
    vertices
}

fn surface_centroid_impl(vertices: &[Vec3], indices: &[u32]) -> Vec3 {
    if vertices.is_empty() {
        return Vec3::ZERO;
    }

    let mut weighted = Vec3::ZERO;
    let mut total_area = 0.0;

    for chunk in indices.chunks_exact(3) {
        let a = vertices[chunk[0] as usize];
        let b = vertices[chunk[1] as usize];
        let c = vertices[chunk[2] as usize];
        let ab = b - a;
        let ac = c - a;
        let cross = ab.cross(ac);
        let area = 0.5 * cross.length();
        if !area.is_finite() || area <= 1e-12 {
            continue;
        }

        weighted = weighted + ((a + b + c) * (area / 3.0));
        total_area += area;
    }

    if total_area > 1e-12 {
        return weighted / total_area;
    }

    let mut sum = Vec3::ZERO;
    for vertex in vertices.iter().copied() {
        sum = sum + vertex;
    }
    sum / vertices.len() as f64
}

struct EulerRotation {
    m11: f64,
    m12: f64,
    m13: f64,
    m21: f64,
    m22: f64,
    m23: f64,
    m31: f64,
    m32: f64,
    m33: f64,
}

impl EulerRotation {
    fn from_degrees(degrees: [f64; 3]) -> Self {
        let x = degrees[0].to_radians();
        let y = degrees[1].to_radians();
        let z = degrees[2].to_radians();

        let (a, b) = (x.cos(), x.sin());
        let (c, d) = (y.cos(), y.sin());
        let (e, f) = (z.cos(), z.sin());

        Self {
            m11: c * e,
            m12: -c * f,
            m13: d,
            m21: (a * f) + (b * e * d),
            m22: (a * e) - (b * f * d),
            m23: -b * c,
            m31: (b * f) - (a * e * d),
            m32: (b * e) + (a * f * d),
            m33: a * c,
        }
    }

    fn apply(&self, value: Vec3) -> Vec3 {
        Vec3 {
            x: (self.m11 * value.x) + (self.m12 * value.y) + (self.m13 * value.z),
            y: (self.m21 * value.x) + (self.m22 * value.y) + (self.m23 * value.z),
            z: (self.m31 * value.x) + (self.m32 * value.y) + (self.m33 * value.z),
        }
    }
}
