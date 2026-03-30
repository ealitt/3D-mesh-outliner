pub fn resolve_unit_scale(
    source_units: Option<&str>,
    output_units: Option<&str>,
) -> (f64, Option<String>, Vec<String>) {
    let output = output_units.and_then(normalize_unit_name).unwrap_or("mm");
    let source = source_units.and_then(normalize_unit_name).unwrap_or("mm");

    let source_scale = unit_factor_mm(source);
    let output_scale = unit_factor_mm(output);

    (source_scale / output_scale, Some(output.to_string()), Vec::new())
}

pub fn normalize_unit_name(value: &str) -> Option<&'static str> {
    match value.trim().to_ascii_lowercase().as_str() {
        "mm" | "millimeter" | "millimeters" => Some("mm"),
        "cm" | "centimeter" | "centimeters" => Some("cm"),
        "m" | "meter" | "meters" => Some("m"),
        "in" | "inch" | "inches" => Some("in"),
        "ft" | "foot" | "feet" => Some("foot"),
        "yd" | "yard" | "yards" => Some("yard"),
        _ => None,
    }
}

fn unit_factor_mm(value: &str) -> f64 {
    match value {
        "mm" => 1.0,
        "cm" => 10.0,
        "m" => 1000.0,
        "in" => 25.4,
        "foot" => 304.8,
        "yard" => 914.4,
        _ => 1.0,
    }
}
