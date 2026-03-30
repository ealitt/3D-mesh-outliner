use crate::export_types::Point2;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Vec3 {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

impl Vec3 {
    pub const ZERO: Self = Self {
        x: 0.0,
        y: 0.0,
        z: 0.0,
    };

    pub fn from_array(value: [f64; 3]) -> Self {
        Self {
            x: value[0],
            y: value[1],
            z: value[2],
        }
    }

    pub fn to_array(self) -> [f64; 3] {
        [self.x, self.y, self.z]
    }

    pub fn dot(self, other: Self) -> f64 {
        self.x * other.x + self.y * other.y + self.z * other.z
    }

    pub fn cross(self, other: Self) -> Self {
        Self {
            x: self.y * other.z - self.z * other.y,
            y: self.z * other.x - self.x * other.z,
            z: self.x * other.y - self.y * other.x,
        }
    }

    pub fn length(self) -> f64 {
        self.dot(self).sqrt()
    }

    pub fn normalized(self) -> Result<Self, String> {
        let length = self.length();
        if !length.is_finite() || length <= f64::EPSILON {
            return Err("Direction must contain a non-zero X, Y, Z vector.".to_string());
        }
        Ok(self / length)
    }

    pub fn nearly_zero(self) -> bool {
        self.length() <= 1e-12
    }
}

impl core::ops::Add for Vec3 {
    type Output = Self;

    fn add(self, rhs: Self) -> Self::Output {
        Self {
            x: self.x + rhs.x,
            y: self.y + rhs.y,
            z: self.z + rhs.z,
        }
    }
}

impl core::ops::Sub for Vec3 {
    type Output = Self;

    fn sub(self, rhs: Self) -> Self::Output {
        Self {
            x: self.x - rhs.x,
            y: self.y - rhs.y,
            z: self.z - rhs.z,
        }
    }
}

impl core::ops::Mul<f64> for Vec3 {
    type Output = Self;

    fn mul(self, rhs: f64) -> Self::Output {
        Self {
            x: self.x * rhs,
            y: self.y * rhs,
            z: self.z * rhs,
        }
    }
}

impl core::ops::Div<f64> for Vec3 {
    type Output = Self;

    fn div(self, rhs: f64) -> Self::Output {
        Self {
            x: self.x / rhs,
            y: self.y / rhs,
            z: self.z / rhs,
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct ProjectionBasis {
    pub origin: Vec3,
    pub normal: Vec3,
    pub u: Vec3,
    pub v: Vec3,
}

pub fn build_projection_basis(
    direction: [f64; 3],
    origin: Option<[f64; 3]>,
) -> Result<ProjectionBasis, String> {
    let normal = Vec3::from_array(direction).normalized()?;
    let (u, v) = stable_plane_axes(normal)?;

    Ok(ProjectionBasis {
        origin: origin.map(Vec3::from_array).unwrap_or(Vec3::ZERO),
        normal,
        u,
        v,
    })
}

pub fn build_projection_basis_from_frame(
    origin: [f64; 3],
    normal: [f64; 3],
    basis_u: Option<[f64; 3]>,
    basis_v: Option<[f64; 3]>,
) -> Result<ProjectionBasis, String> {
    let origin = Vec3::from_array(origin);
    let normal = Vec3::from_array(normal).normalized()?;

    let (u, v) = match (basis_u, basis_v) {
        (Some(u), Some(v)) => orthonormalize_plane_axes(normal, Vec3::from_array(u), Vec3::from_array(v))?,
        (Some(u), None) => {
            let u = orthogonalize_axis(normal, Vec3::from_array(u))?;
            let v = normal.cross(u).normalized()?;
            (u, v)
        }
        (None, Some(v)) => {
            let v = orthogonalize_axis(normal, Vec3::from_array(v))?;
            let u = v.cross(normal).normalized()?;
            (u, normal.cross(u).normalized()?)
        }
        (None, None) => stable_plane_axes(normal)?,
    };

    Ok(ProjectionBasis { origin, normal, u, v })
}

pub fn project_point(point: Vec3, basis: &ProjectionBasis) -> Point2 {
    let shifted = point - basis.origin;
    [shifted.dot(basis.u), shifted.dot(basis.v)]
}

pub fn transform_point_to_plane_local(point: Vec3, basis: &ProjectionBasis) -> Vec3 {
    let shifted = point - basis.origin;
    Vec3 {
        x: shifted.dot(basis.u),
        y: shifted.dot(basis.v),
        z: shifted.dot(basis.normal),
    }
}

pub fn signed_area(points: &[Point2]) -> f64 {
    if points.len() < 3 {
        return 0.0;
    }

    let mut area = 0.0;
    for (index, [x0, y0]) in points.iter().enumerate() {
        let [x1, y1] = points[(index + 1) % points.len()];
        area += (x0 * y1) - (x1 * y0);
    }
    area * 0.5
}

pub fn bbox_from_points(points: &[Point2]) -> [f64; 4] {
    if points.is_empty() {
        return [0.0, 0.0, 0.0, 0.0];
    }

    let mut min_x = f64::INFINITY;
    let mut min_y = f64::INFINITY;
    let mut max_x = f64::NEG_INFINITY;
    let mut max_y = f64::NEG_INFINITY;

    for [x, y] in points {
        min_x = min_x.min(*x);
        min_y = min_y.min(*y);
        max_x = max_x.max(*x);
        max_y = max_y.max(*y);
    }

    [min_x, min_y, max_x, max_y]
}

fn stable_plane_axes(normal: Vec3) -> Result<(Vec3, Vec3), String> {
    let helper = if normal.z.abs() < 0.9 {
        Vec3 {
            x: 0.0,
            y: 0.0,
            z: 1.0,
        }
    } else {
        Vec3 {
            x: 0.0,
            y: 1.0,
            z: 0.0,
        }
    };
    let u = helper.cross(normal).normalized()?;
    let v = normal.cross(u).normalized()?;
    Ok((u, v))
}

fn orthogonalize_axis(normal: Vec3, axis: Vec3) -> Result<Vec3, String> {
    let orthogonal = axis - (normal * axis.dot(normal));
    if orthogonal.nearly_zero() {
        return stable_plane_axes(normal).map(|(u, _)| u);
    }
    orthogonal.normalized()
}

fn orthonormalize_plane_axes(normal: Vec3, basis_u: Vec3, basis_v: Vec3) -> Result<(Vec3, Vec3), String> {
    let u = orthogonalize_axis(normal, basis_u)?;
    let mut v = basis_v - (normal * basis_v.dot(normal)) - (u * basis_v.dot(u));
    if v.nearly_zero() {
        v = normal.cross(u);
    }
    let v = v.normalized()?;
    let u = v.cross(normal).normalized()?;
    Ok((u, normal.cross(u).normalized()?))
}
