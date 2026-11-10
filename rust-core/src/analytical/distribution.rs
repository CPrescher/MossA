//! Derivatives of the literal four-pole xVBF approximation, not a replacement
//! Voigt function. Parameter maps include the bounded stick-breaking chain rule.
use super::*;
pub(super) type Mapping = Vec<(usize, f64)>;

/// center, width, area partials, retaining the forward model's width-zero branch.
fn voigt_value_partials(x: f64, center: f64, width: f64, area: f64) -> (f64, [f64; 3]) {
    let z = x - center;
    let lorentz = 0.194;
    if width < 1e-10 {
        let unit = 0.5642 / PI.sqrt() * lorentz / (z * z + lorentz * lorentz);
        return (
            area * 0.5642 / PI.sqrt() * lorentz / (z.powi(2) + lorentz * lorentz),
            [area * unit * 2. * z / (z * z + lorentz * lorentz), 0., unit],
        );
    }
    let c = 2. * 2_f64.sqrt();
    let a = z / (width * 2. * 2_f64.sqrt());
    let b = lorentz / (width * 2. * 2_f64.sqrt());
    let mut value = 0.;
    let mut da = 0.;
    let mut db = 0.;
    for (r, i, p, q) in [
        (-1.2150, 1.2359, -0.3085, 0.0210),
        (-1.3509, 0.3786, 0.5906, -1.1858),
        (-1.2150, -1.2359, -0.3085, -0.0210),
        (-1.3509, -0.3786, 0.5906, 1.1858),
    ] {
        let u = b - r;
        let v = a - i;
        let d = u * u + v * v;
        let n = p * u + q * v;
        value += n / d;
        da += (q * d - 2. * v * n) / (d * d);
        db += (p * d - 2. * u * n) / (d * d);
    }
    let pref = 1. / (2. * (2. * PI).sqrt() * width);
    (
        area / (2. * (2. * PI).sqrt() * width) * value,
        [
            -area * pref * da / (c * width),
            -area * pref * (value + a * da + b * db) / width,
            pref * value,
        ],
    )
}
struct Pair {
    centers: [f64; 2],
    widths: [f64; 2],
    area: f64,
    // derivatives of widths wrt cs width, qs width, correlation
    width_partials: [[f64; 3]; 2],
    area_partials: [f64; 3],
    // I, delta, cs center/width/weight, qs center/width/weight
    columns: [Mapping; 8],
}
pub(super) struct Distribution {
    pairs: Vec<Pair>,
}
impl Distribution {
    pub(super) fn new(
        site: &Site,
        map: impl Fn(&str) -> Mapping,
        fallback: &mut [bool],
        steps: &[f64],
    ) -> Self {
        let d = site.xvbf.as_ref().unwrap();
        let intensity = get(site, "intensity");
        let mut pairs = Vec::new();
        for (i, cs) in d.cs.iter().enumerate() {
            for (j, qs) in d.qs.iter().enumerate() {
                let u = cs.width.value;
                let v = qs.width.value;
                let delta = d.delta.value;
                let base = u * u + 0.25 * v * v;
                let corr = delta * u * v;
                let widths = [(base + corr).max(0.).sqrt(), (base - corr).max(0.).sqrt()];
                let columns = [
                    map("intensity"),
                    map("delta"),
                    map(&format!("csd:{i}:center")),
                    map(&format!("csd:{i}:width")),
                    map(&format!("csd:{i}:weight")),
                    map(&format!("qsd:{j}:center")),
                    map(&format!("qsd:{j}:width")),
                    map(&format!("qsd:{j}:weight")),
                ];
                for (line, &w) in widths.iter().enumerate() {
                    let sign = if line == 0 { 1. } else { -1. };
                    let q = w * w;
                    for key in [1, 3, 6] {
                        for &(k, f) in &columns[key] {
                            let h = steps[k] * f.abs();
                            let dq = match key {
                                1 => u * v * h,
                                3 => (2. * u + sign * delta * v).abs() * h + h * h,
                                _ => (0.5 * v + sign * delta * u).abs() * h + 0.25 * h * h,
                            };
                            if q <= 64. * dq {
                                fallback[k] = true;
                            }
                        }
                    }
                }
                let mut width_partials = [[0.; 3]; 2];
                for line in 0..2 {
                    if widths[line] < 1e-8 {
                        // Perfect-correlation/zero-width branches have no common
                        // two-sided tangent. Preserve existing bounded differences.
                        for key in [1, 3, 6] {
                            for &(k, _) in &columns[key] {
                                fallback[k] = true;
                            }
                        }
                    } else {
                        let sign = if line == 0 { 1. } else { -1. };
                        let den = 2. * widths[line];
                        width_partials[line] = [
                            (2. * u + sign * delta * v) / den,
                            (0.5 * v + sign * delta * u) / den,
                            sign * u * v / den,
                        ];
                    }
                }
                pairs.push(Pair {
                    centers: [
                        cs.center.value + qs.center.value / 2.,
                        cs.center.value - qs.center.value / 2.,
                    ],
                    widths,
                    area: intensity * cs.weight.value * qs.weight.value / 2.,
                    width_partials,
                    area_partials: [
                        cs.weight.value * qs.weight.value / 2.,
                        intensity * qs.weight.value / 2.,
                        intensity * cs.weight.value / 2.,
                    ],
                    columns,
                });
            }
        }
        Self { pairs }
    }
    pub(super) fn value_accumulate(&self, x: f64, gradient: &mut [f64]) -> f64 {
        let mut value = 0.;
        for pair in &self.pairs {
            let mut d = [0.; 8];
            let mut pair_value = 0.;
            for line in 0..2 {
                let (v, p) =
                    voigt_value_partials(x, pair.centers[line], pair.widths[line], pair.area);
                pair_value += v;
                d[0] += p[2] * pair.area_partials[0];
                d[1] += p[1] * pair.width_partials[line][2];
                d[2] += p[0];
                d[3] += p[1] * pair.width_partials[line][0];
                d[4] += p[2] * pair.area_partials[1];
                d[5] += p[0] * if line == 0 { 0.5 } else { -0.5 };
                d[6] += p[1] * pair.width_partials[line][1];
                d[7] += p[2] * pair.area_partials[2];
            }
            value += pair_value;
            for (i, map) in pair.columns.iter().enumerate() {
                for &(k, f) in map {
                    gradient[k] += d[i] * f;
                }
            }
        }
        value
    }
}
impl Prepared {
    pub(crate) fn parameter_maps(&self, x: &[f64]) -> (Vec<Mapping>, Vec<bool>) {
        let n = x.len();
        if self.simplexes.is_empty() {
            return (self.evaluation_plan.maps.clone(), vec![false; n]);
        }
        let mut matrix = vec![vec![0.; n]; self.entries.len()];
        let mut values: Vec<_> = self.entries.iter().map(|e| e.param.value).collect();
        for (k, &r) in self.free.iter().enumerate() {
            values[r] = x[k] * self.scale[k];
        }
        for (i, &(r, f)) in self.roots.iter().enumerate() {
            if let Some(k) = self.free.iter().position(|&v| v == r) {
                matrix[i][k] = f * self.scale[k];
            }
        }
        let mut fallback = vec![false; n];
        for group in &self.simplexes {
            let mut remaining = group.mass;
            let mut dr = vec![0_f64; n];
            for (i, &e) in group.indices.iter().enumerate() {
                let a = remaining - group.upper[i + 1..].iter().sum::<f64>();
                let b = remaining - group.lower[i + 1..].iter().sum::<f64>();
                let lower = group.lower[i].max(a);
                let upper = group.upper[i].min(b);
                let mut derivative = vec![0.; n];
                let value = if i + 1 == group.indices.len() {
                    derivative.clone_from(&dr);
                    remaining
                } else {
                    for k in 0..n {
                        let h = 6e-6 * x[k].abs().max(1.);
                        let step = ((x[k] + h).min(self.upper[k]) - x[k])
                            .max(x[k] - (x[k] - h).max(self.lower[k]));
                        if dr[k] != 0.
                            && ((a - group.lower[i]).abs() <= step * dr[k].abs()
                                || (b - group.upper[i]).abs() <= step * dr[k].abs())
                        {
                            fallback[k] = true;
                        }
                        let dl = if a > group.lower[i] { dr[k] } else { 0. };
                        let du = if b < group.upper[i] { dr[k] } else { 0. };
                        derivative[k] = dl
                            + if upper > lower {
                                (du - dl) * values[e] + (upper - lower) * matrix[e][k]
                            } else {
                                0.
                            };
                    }
                    lower + (upper - lower).max(0.) * values[e]
                };
                matrix[e] = derivative;
                remaining -= value;
                for (k, r) in dr.iter_mut().enumerate() {
                    *r -= matrix[e][k];
                }
            }
        }
        (
            matrix
                .into_iter()
                .map(|row| {
                    row.into_iter()
                        .enumerate()
                        .filter(|(_, v)| *v != 0.)
                        .collect()
                })
                .collect(),
            fallback,
        )
    }
}

// Geometry shared by actual- and unit-intensity tangents. Keep the original
// formulas and operation order for each area separately.
fn voigt_value_partials_pair(
    x: f64,
    center: f64,
    width: f64,
    area: f64,
    unit_area: f64,
) -> ((f64, [f64; 3]), (f64, [f64; 3])) {
    let z = x - center;
    let lorentz = 0.194;
    if width < 1e-10 {
        let unit = 0.5642 / PI.sqrt() * lorentz / (z * z + lorentz * lorentz);
        let finish = |area: f64| {
            (
                area * 0.5642 / PI.sqrt() * lorentz / (z.powi(2) + lorentz * lorentz),
                [area * unit * 2. * z / (z * z + lorentz * lorentz), 0., unit],
            )
        };
        return (finish(area), finish(unit_area));
    }
    let c = 2. * 2_f64.sqrt();
    let a = z / (width * 2. * 2_f64.sqrt());
    let b = lorentz / (width * 2. * 2_f64.sqrt());
    let (mut value, mut da, mut db) = (0., 0., 0.);
    for (r, i, p, q) in [
        (-1.2150, 1.2359, -0.3085, 0.0210),
        (-1.3509, 0.3786, 0.5906, -1.1858),
        (-1.2150, -1.2359, -0.3085, -0.0210),
        (-1.3509, -0.3786, 0.5906, 1.1858),
    ] {
        let u = b - r;
        let v = a - i;
        let d = u * u + v * v;
        let n = p * u + q * v;
        value += n / d;
        da += (q * d - 2. * v * n) / (d * d);
        db += (p * d - 2. * u * n) / (d * d);
    }
    let pref = 1. / (2. * (2. * PI).sqrt() * width);
    let finish = |area: f64| {
        (
            area / (2. * (2. * PI).sqrt() * width) * value,
            [
                -area * pref * da / (c * width),
                -area * pref * (value + a * da + b * db) / width,
                pref * value,
            ],
        )
    };
    (finish(area), finish(unit_area))
}
impl Distribution {
    pub(super) fn accumulate_pair(
        &self,
        unit: &Self,
        x: f64,
        gradient: &mut [f64],
        unit_gradient: &mut [f64],
    ) {
        debug_assert_eq!(self.pairs.len(), unit.pairs.len());
        let add = |d: &mut [f64; 8], p: [f64; 3], pair: &Pair, line: usize| {
            d[0] += p[2] * pair.area_partials[0];
            d[1] += p[1] * pair.width_partials[line][2];
            d[2] += p[0];
            d[3] += p[1] * pair.width_partials[line][0];
            d[4] += p[2] * pair.area_partials[1];
            d[5] += p[0] * if line == 0 { 0.5 } else { -0.5 };
            d[6] += p[1] * pair.width_partials[line][1];
            d[7] += p[2] * pair.area_partials[2];
        };
        for (pair, one) in self.pairs.iter().zip(&unit.pairs) {
            debug_assert_eq!(pair.centers, one.centers);
            debug_assert_eq!(pair.widths, one.widths);
            let (mut d, mut u) = ([0.; 8], [0.; 8]);
            for line in 0..2 {
                let ((_, p), (_, q)) = voigt_value_partials_pair(
                    x,
                    pair.centers[line],
                    pair.widths[line],
                    pair.area,
                    one.area,
                );
                add(&mut d, p, pair, line);
                add(&mut u, q, one, line);
            }
            for (i, map) in pair.columns.iter().enumerate() {
                for &(k, f) in map {
                    gradient[k] += d[i] * f;
                }
            }
            for (i, map) in one.columns.iter().enumerate() {
                for &(k, f) in map {
                    unit_gradient[k] += u[i] * f;
                }
            }
        }
    }
}

#[cfg(test)]
mod paired_projection_tests {
    use super::*;
    #[test]
    fn paired_voigt_kernels_match_both_original_area_evaluations_bit_for_bit() {
        for width in [0., 1e-11, 0.01, 0.5, 100.] {
            for area in [0., 0.3, 1e6] {
                for x in [-4., 0.23, 3.] {
                    let (a, b) = voigt_value_partials_pair(x, 0.23, width, area, 0.35);
                    let old = voigt_value_partials(x, 0.23, width, area);
                    let unit = voigt_value_partials(x, 0.23, width, 0.35);
                    assert_eq!(a.0.to_bits(), old.0.to_bits());
                    assert_eq!(a.1.map(f64::to_bits), old.1.map(f64::to_bits));
                    assert_eq!(b.0.to_bits(), unit.0.to_bits());
                    assert_eq!(b.1.map(f64::to_bits), unit.1.map(f64::to_bits));
                }
            }
        }
    }
}
