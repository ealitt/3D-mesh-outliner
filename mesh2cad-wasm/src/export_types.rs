pub type Point2 = [f64; 2];
pub type Shape2 = Vec<Vec<Point2>>;
pub type Shapes2 = Vec<Shape2>;

#[derive(Debug, Clone, PartialEq)]
pub struct PolygonRecord {
    pub exterior: Vec<Point2>,
    pub holes: Vec<Vec<Point2>>,
}

#[derive(Debug, Clone)]
pub struct ProjectedMesh {
    pub vertices: Vec<Point2>,
    pub bounds: [f64; 4],
    pub grid: f64,
    pub overlay_scale: f64,
    pub epsilon_area: f64,
    pub warnings: Vec<String>,
}
