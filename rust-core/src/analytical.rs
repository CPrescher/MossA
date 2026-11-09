//! Exact residual Jacobians for ordinary thin and transmission models. The forward
//! model stays unchanged; links and optimizer scales are applied by chain rule.
use super::*;
mod distribution;
mod precompute;
mod projection;
pub(super) use precompute::{EvaluationPlan, ProjectionPlan};
mod source;
mod transmission;

const KEYS: [&str; 8] = ["cs", "fwhm", "intensity", "qs", "bhf", "a12", "a13", "mix"];

/// Partials with respect to center, FWHM, area, and mixing fraction.
fn profile_value_partials(
    x: f64,
    center: f64,
    width: f64,
    area: f64,
    shape: ProfileShape,
    mix: f64,
) -> (f64, [f64; 4]) {
    let h = width / 2.;
    let z = (x - center) / h;
    let u = 1. + z * z;
    let lorentzian = || {
        let l = 1. / (PI * h * u);
        (
            area / (PI * h * u),
            [
                area * l * 2. * z / (h * u),
                area * l * (z * z - 1.) / (width * u),
                l,
                0.,
            ],
        )
    };
    let gaussian = || {
        let exponential = (-(z * 0.8326).powi(2)).exp();
        let g = 0.8326 / (h * 1.7725) * exponential;
        (
            area * 0.8326 / (h * 1.7725) * exponential,
            [
                area * g * 2. * 0.8326_f64.powi(2) * z / h,
                area * g * (2. * 0.8326_f64.powi(2) * z * z - 1.) / width,
                g,
                0.,
            ],
        )
    };
    match shape {
        ProfileShape::Lorentzian => lorentzian(),
        ProfileShape::Gaussian => gaussian(),
        ProfileShape::LorSquared => {
            let q = 2. / (PI * h * u * u);
            (
                area * 2. / (PI * h * u.powi(2)),
                [
                    area * q * 4. * z / (h * u),
                    area * q * (3. * z * z - 1.) / (width * u),
                    q,
                    0.,
                ],
            )
        }
        ProfileShape::PseudoVoigt => {
            let (lv, l) = lorentzian();
            let (gv, g) = gaussian();
            (
                mix * lv + (1. - mix) * gv,
                [
                    mix * l[0] + (1. - mix) * g[0],
                    mix * l[1] + (1. - mix) * g[1],
                    mix * l[2] + (1. - mix) * g[2],
                    area * (l[2] - g[2]),
                ],
            )
        }
    }
}
// The lazy path avoids computing an unused forward value on ordinary-only
// models. Keep its established arithmetic independent of the fused path.
fn profile_partials(
    x: f64,
    center: f64,
    width: f64,
    area: f64,
    shape: ProfileShape,
    mix: f64,
) -> [f64; 4] {
    let h = width / 2.;
    let z = (x - center) / h;
    let u = 1. + z * z;
    let lorentzian = || {
        let l = 1. / (PI * h * u);
        [
            area * l * 2. * z / (h * u),
            area * l * (z * z - 1.) / (width * u),
            l,
            0.,
        ]
    };
    let gaussian = || {
        let g = 0.8326 / (h * 1.7725) * (-(z * 0.8326).powi(2)).exp();
        [
            area * g * 2. * 0.8326_f64.powi(2) * z / h,
            area * g * (2. * 0.8326_f64.powi(2) * z * z - 1.) / width,
            g,
            0.,
        ]
    };
    match shape {
        ProfileShape::Lorentzian => lorentzian(),
        ProfileShape::Gaussian => gaussian(),
        ProfileShape::LorSquared => {
            let q = 2. / (PI * h * u * u);
            [
                area * q * 4. * z / (h * u),
                area * q * (3. * z * z - 1.) / (width * u),
                q,
                0.,
            ]
        }
        ProfileShape::PseudoVoigt => {
            let l = lorentzian();
            let g = gaussian();
            [
                mix * l[0] + (1. - mix) * g[0],
                mix * l[1] + (1. - mix) * g[1],
                mix * l[2] + (1. - mix) * g[2],
                area * (l[2] - g[2]),
            ]
        }
    }
}

struct Lines<'a> {
    curve: SiteCurve<'a>,
    // Each line's center derivatives (qs, bhf) and area derivatives (I,a12,a13).
    center: [[f64; 2]; 6],
    area: [[f64; 3]; 6],
    columns: [Option<(usize, f64)>; 8],
    distribution: Option<distribution::Distribution>,
}
impl<'a> Lines<'a> {
    fn new(site: &'a Site, coefficients: [f64; 3]) -> Self {
        let mut s = Self {
            curve: SiteCurve::new(site, coefficients),
            center: [[0.; 2]; 6],
            area: [[0.; 3]; 6],
            columns: [None; 8],
            distribution: None,
        };
        let intensity = get(site, "intensity");
        match site.kind.as_str() {
            "Singlet" => s.area[0][0] = 1.,
            "Doublet" => {
                let r = get(site, "a12");
                s.center[..2].copy_from_slice(&[[-0.5, 0.], [0.5, 0.]]);
                s.area[..2].copy_from_slice(&[[r, intensity, 0.], [1. - r, -intensity, 0.]]);
            }
            _ => {
                let r = 1. / get(site, "a12");
                let t = 1. / get(site, "a13");
                let den = 6. + 6. * (r + t);
                let n = 3. / den;
                let a = intensity * n;
                let dr = intensity * 18. * r * r / (den * den);
                let dt = intensity * 18. * t * t / (den * den);
                let outer = [n, dr, dt];
                let middle = [n * r, dr * r - a * r * r, dt * r];
                let inner = [n * t, dr * t, dt * t - a * t * t];
                s.area = [outer, middle, inner, inner, middle, outer];
                let [o, m, i] = coefficients;
                s.center = [
                    [0.5, -o],
                    [-0.5, -m],
                    [-0.5, -i],
                    [-0.5, i],
                    [-0.5, m],
                    [0.5, o],
                ];
            }
        }
        s
    }
    fn accumulate(&self, x: f64, gradient: &mut [f64]) {
        if let Some(d) = &self.distribution {
            d.value_accumulate(x, gradient);
            return;
        }
        let d = self.partials(x);
        for (i, mapped) in self.columns.iter().enumerate() {
            if let Some((k, f)) = mapped {
                gradient[*k] += d[i] * f;
            }
        }
    }
    fn value_accumulate(&self, x: f64, gradient: &mut [f64]) -> f64 {
        if let Some(d) = &self.distribution {
            return d.value_accumulate(x, gradient);
        }
        let (value, d) = self.value_partials(x);
        for (i, mapped) in self.columns.iter().enumerate() {
            if let Some((k, f)) = mapped {
                gradient[*k] += d[i] * f;
            }
        }
        value
    }
    fn partials(&self, x: f64) -> [f64; 8] {
        let mut sum = [0.; 8];
        for line in 0..self.curve.count {
            let (center, area) = self.curve.lines[line];
            let d = profile_partials(
                x,
                center,
                self.curve.fwhm,
                area,
                self.curve.shape,
                self.curve.mix,
            );
            sum[0] += d[0];
            sum[1] += d[1];
            sum[2] += d[2] * self.area[line][0];
            sum[3] += d[0] * self.center[line][0];
            sum[4] += d[0] * self.center[line][1];
            sum[5] += d[2] * self.area[line][1];
            sum[6] += d[2] * self.area[line][2];
            sum[7] += d[3];
        }
        sum
    }
    fn value_partials(&self, x: f64) -> (f64, [f64; 8]) {
        let mut value = 0.;
        let mut sum = [0.; 8];
        for line in 0..self.curve.count {
            let (center, area) = self.curve.lines[line];
            let (v, d) = profile_value_partials(
                x,
                center,
                self.curve.fwhm,
                area,
                self.curve.shape,
                self.curve.mix,
            );
            value += v;
            sum[0] += d[0];
            sum[1] += d[1];
            sum[2] += d[2] * self.area[line][0];
            sum[3] += d[0] * self.center[line][0];
            sum[4] += d[0] * self.center[line][1];
            sum[5] += d[2] * self.area[line][1];
            sum[6] += d[2] * self.area[line][2];
            sum[7] += d[3];
        }
        (value, sum)
    }
}
struct LineDerivatives<'a> {
    sites: Vec<Lines<'a>>,
    background: Vec<(i32, (usize, f64))>,
    maps: Vec<distribution::Mapping>,
    fallback: Vec<bool>,
}
/// Unweighted absorber values and tangents in optimizer coordinates. Immutable
/// and shared by clones; no forward/Jacobian cache lock is held during evaluation.
pub(super) struct AbsorberGrid {
    pub(super) values: Vec<f64>,
    jac: DMatrix<f64>,
}

impl Prepared {
    pub(super) fn uses_qr_compression(&self) -> bool {
        // Retain direct SVD for numerical-reference fits and for coupled
        // ordinary/distribution models, whose final convergence is sensitive
        // to the rounding of the factorization.
        self.uses_analytical_derivatives()
            && !(self.project.sites.iter().any(|s| s.xvbf.is_some())
                && self.project.sites.iter().any(|s| s.xvbf.is_none()))
    }

    pub(super) fn uses_analytical_derivatives(&self) -> bool {
        self.project.derivative_method != Some(DerivativeMethod::Numerical)
    }
    /// Break exact component-shape symmetries explicitly rather than relying on
    /// finite-difference roundoff. Only solver coordinates change; evaluation,
    /// original scales, fixed parameters, links and finalization stay intact.
    pub(super) fn starting_point(&self) -> (Vec<f64>, Vec<String>) {
        let mut x = self.initial.clone();
        let mut adjusted = Vec::new();
        if !self.uses_analytical_derivatives() || self.project.mode != "thin" {
            return (x, adjusted);
        }
        let p = self.expand(&x);
        let mut seen = vec![false; p.sites.len()];
        for first in 0..p.sites.len() {
            if seen[first] {
                continue;
            }
            let a = &p.sites[first];
            if a.xvbf.is_some() {
                seen[first] = true;
                continue;
            }
            let group: Vec<_> = (first..p.sites.len())
                .filter(|&i| {
                    let b = &p.sites[i];
                    b.xvbf.is_none()
                        && a.kind == b.kind
                        && a.profile == b.profile
                        && active_keys(a)
                            .into_iter()
                            .filter(|&k| k != "intensity")
                            .all(|k| {
                                let u = get(a, k);
                                let v = get(b, k);
                                (u - v).abs() <= 1e-10 * u.abs().max(v.abs()).max(1.)
                            })
                })
                .collect();
            for &i in &group {
                seen[i] = true;
            }
            if group.len() < 2 {
                continue;
            }
            let area: f64 = group
                .iter()
                .map(|&i| get(&p.sites[i], "intensity").max(0.))
                .sum();
            let center = group
                .iter()
                .enumerate()
                .map(|(rank, &i)| {
                    let weight = if area > 0. {
                        get(&p.sites[i], "intensity").max(0.) / area
                    } else {
                        1. / group.len() as f64
                    };
                    weight * rank as f64 / (group.len() - 1) as f64
                })
                .sum::<f64>();
            // Spread over one line width, preserving the area-weighted centroid
            // when bounds permit. BHF first separates sextets' outermost lines.
            for key in ["bhf", "cs", "qs", "fwhm", "a12", "a13", "mix"] {
                if !active_keys(a).contains(&key) {
                    continue;
                }
                let width = get(a, "fwhm");
                let span = match key {
                    "bhf" => width / self.magnetic_coefficients[0],
                    "cs" => width,
                    "qs" => 2. * width,
                    "fwhm" => width * 0.5,
                    "mix" => 0.2,
                    _ => get(a, key).abs().max(0.1) * 0.2,
                };
                let mut changes = Vec::new();
                for (rank, &site) in group.iter().enumerate() {
                    let Some(entry) = self
                        .entries
                        .iter()
                        .position(|e| e.site == Some(site) && e.key == key)
                    else {
                        continue;
                    };
                    // An independent root may move only this parameter. Shared
                    // or cross-parameter roots are left exactly as specified.
                    if self.roots[entry] != (entry, 1.)
                        || self
                            .roots
                            .iter()
                            .filter(|&&(r, f)| r == entry && f != 0.)
                            .count()
                            != 1
                    {
                        continue;
                    }
                    let Some(k) = self.free.iter().position(|&r| r == entry) else {
                        continue;
                    };
                    let offset = rank as f64 / (group.len() - 1) as f64 - center;
                    let target =
                        (x[k] + offset * span / self.scale[k]).clamp(self.lower[k], self.upper[k]);
                    changes.push((k, entry, target));
                }
                if changes.len() == group.len() {
                    // At a common bound, translate the whole spread into the
                    // feasible intersection instead of clipping several sites
                    // onto the same endpoint. Shorten the span if necessary.
                    let lo = changes
                        .iter()
                        .map(|&(k, _, _)| self.lower[k] * self.scale[k])
                        .fold(f64::NEG_INFINITY, f64::max);
                    let hi = changes
                        .iter()
                        .map(|&(k, _, _)| self.upper[k] * self.scale[k])
                        .fold(f64::INFINITY, f64::min);
                    let spread = span.min(hi - lo);
                    if spread > 1e-8 * span {
                        let start = (get(a, key) - center * spread).clamp(lo, hi - spread);
                        for (rank, (k, _, target)) in changes.iter_mut().enumerate() {
                            *target = ((start + rank as f64 / (group.len() - 1) as f64 * spread)
                                / self.scale[*k])
                                .clamp(self.lower[*k], self.upper[*k]);
                        }
                    }
                }
                changes
                    .retain(|&(k, _, target)| (target - x[k]).abs() > 1e-8 * span / self.scale[k]);
                if !changes.is_empty() {
                    for (k, entry, target) in changes {
                        x[k] = target;
                        adjusted.push(self.entries[entry].id.clone());
                    }
                    break;
                }
            }
        }
        if !adjusted.is_empty() {
            // Do not disturb a spectrum already reproduced to roundoff.
            let residuals = self.residuals(&self.initial);
            if residuals
                .iter()
                .zip(&self.project.spectrum.y)
                .all(|(&r, &y)| {
                    let weight = if self.project.weighting == "counts" {
                        y.sqrt()
                    } else {
                        1.
                    };
                    r.abs() <= 8. * f64::EPSILON * y.abs().max(1.) / weight
                })
            {
                return (self.initial.clone(), Vec::new());
            }
        }
        (x, adjusted)
    }
    /// Initialization must not lose the supplied model's objective floor,
    /// including when a separated fit runs out of iterations early.
    pub(super) fn retain_starting_incumbent(&self, mut state: FitState) -> FitState {
        if state.termination == "ExplorationPruned"
            || (self.starting_point().1.is_empty()
                && !(self.project.variable_projection_requested()
                    && self.uses_analytical_derivatives()))
        {
            return state;
        }
        let original = self
            .residuals(&self.initial)
            .iter()
            .map(|r| r * r)
            .sum::<f64>();
        let fitted = self.residuals(&state.x).iter().map(|r| r * r).sum::<f64>();
        if original.is_finite() && (!fitted.is_finite() || original < fitted) {
            state.x = self.initial.clone();
            state.converged = false;
            state.termination = "StartingModelRetained".into();
            if original == 0. {
                state.converged = true;
                state.termination = "RelativeCostTolerance".into();
            }
        }
        state
    }
    fn line_derivatives<'a>(&self, p: &'a Project, x: &[f64]) -> LineDerivatives<'a> {
        let mut sites: Vec<_> = p
            .sites
            .iter()
            .map(|s| Lines::new(s, self.magnetic_coefficients))
            .collect();
        let (maps, mut fallback) = self.parameter_maps(x);
        let steps: Vec<_> = x
            .iter()
            .enumerate()
            .map(|(k, &v)| {
                let h = 6e-6 * v.abs().max(1.);
                ((v + h).min(self.upper[k]) - v).max(v - (v - h).max(self.lower[k]))
            })
            .collect();
        for (i, site) in p.sites.iter().enumerate() {
            if site.xvbf.is_some() {
                sites[i].distribution = Some(distribution::Distribution::new(
                    site,
                    |key| {
                        self.entries
                            .iter()
                            .position(|e| e.site == Some(i) && e.key == key)
                            .map(|j| maps[j].clone())
                            .unwrap_or_default()
                    },
                    &mut fallback,
                    &steps,
                ));
            }
        }
        for &(site, key, entry) in &self.evaluation_plan.site_entries {
            if sites[site].distribution.is_none() {
                sites[site].columns[key] = maps[entry].first().copied();
            }
        }
        let mut background = Vec::new();
        for &(degree, entry) in &self.evaluation_plan.background_entries {
            for &mapped in &maps[entry] {
                background.push((degree, mapped));
            }
        }
        LineDerivatives {
            sites,
            background,
            maps,
            fallback,
        }
    }
    pub(super) fn absorber_grid(
        &self,
        p: &Project,
        x: &[f64],
        velocities: impl Iterator<Item = f64>,
        rows: usize,
    ) -> AbsorberGrid {
        let lines = self.line_derivatives(p, x);
        let mut values = Vec::with_capacity(rows);
        let mut jac = DMatrix::zeros(rows, x.len());
        let mut gradient = vec![0.; x.len()];
        for (row, v) in velocities.enumerate() {
            if cancellation_requested() {
                // Cancellation must retain the residual/Jacobian dimensions
                // until the solver observes its token and discards this trial.
                values.resize(rows, 0.);
                break;
            }
            gradient.fill(0.);
            values.push(
                lines
                    .sites
                    .iter()
                    .map(|s| s.value_accumulate(v, &mut gradient))
                    .sum(),
            );
            for k in 0..x.len() {
                jac[(row, k)] = gradient[k];
            }
        }
        AbsorberGrid { values, jac }
    }
    pub(super) fn analytical_derivative(&self, x: &[f64]) -> Option<DMatrix<f64>> {
        if !self.uses_analytical_derivatives() {
            return None;
        }
        let p = self.expand(x);
        let LineDerivatives {
            sites,
            background,
            maps,
            fallback,
        } = self.line_derivatives(&p, x);
        if p.mode == "transmission" {
            let mut j = self.transmission_derivative(&p, &sites, &background, &maps, x)?;
            for (k, &use_numeric) in fallback.iter().enumerate() {
                if use_numeric {
                    j.column_mut(k)
                        .copy_from_slice(&self.derivative_column(x, k));
                }
            }
            return Some(j);
        }
        let cached = self
            .absorber_snapshot
            .lock()
            .unwrap()
            .as_ref()
            .filter(|(key, _)| key == x)
            .map(|(_, grid)| grid.clone());
        if let Some(grid) = cached {
            let mut j = grid.jac.clone();
            for row in 0..p.spectrum.x.len() {
                for k in 0..x.len() {
                    j[(row, k)] = -j[(row, k)];
                }
                for &(degree, (k, factor)) in &background {
                    j[(row, k)] += self.evaluation_plan.powers[degree as usize][row] * factor;
                }
                if p.weighting == "counts" {
                    for k in 0..x.len() {
                        j[(row, k)] /= self.evaluation_plan.weights[row];
                    }
                }
            }
            for (k, &use_numeric) in fallback.iter().enumerate() {
                if use_numeric {
                    j.column_mut(k)
                        .copy_from_slice(&self.derivative_column(x, k));
                }
            }
            return j.iter().all(|v| v.is_finite()).then_some(j);
        }
        let mut j = DMatrix::<f64>::zeros(p.spectrum.x.len(), x.len());
        let mut distributed_gradient = vec![0.; x.len()];
        for (row, &v) in p.spectrum.x.iter().enumerate() {
            if cancellation_requested() {
                return None;
            }
            let weight = self.evaluation_plan.weights[row];
            for &(degree, (k, factor)) in &background {
                j[(row, k)] += self.evaluation_plan.powers[degree as usize][row] * factor / weight;
            }
            for site in &sites {
                if site.distribution.is_some() {
                    distributed_gradient.fill(0.);
                    site.accumulate(v, &mut distributed_gradient);
                    for k in 0..x.len() {
                        j[(row, k)] -= distributed_gradient[k] / weight;
                    }
                    continue;
                }
                let d = site.partials(v);
                for (i, mapped) in site.columns.iter().enumerate() {
                    if let Some((k, factor)) = mapped {
                        j[(row, *k)] -= d[i] * factor / weight;
                    }
                }
            }
        }
        for (k, &use_numeric) in fallback.iter().enumerate() {
            if use_numeric {
                j.column_mut(k)
                    .copy_from_slice(&self.derivative_column(x, k));
            }
        }
        // Extreme floating-point inputs retain the established numerical path.
        j.iter().all(|v| v.is_finite()).then_some(j)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn profile_partials_match_five_point_reference_at_width_and_mix_extremes() {
        for shape in [
            ProfileShape::Lorentzian,
            ProfileShape::Gaussian,
            ProfileShape::PseudoVoigt,
            ProfileShape::LorSquared,
        ] {
            for width in [0.01, 0.2, 1., 3.] {
                for area in [0., 400.] {
                    for mix in [0., 0.3, 1.] {
                        for offset in [-10., -1., 0., 0.3, 2., 10.] {
                            let x = 0.23 + offset * width;
                            let parameters = [0.23, width, area, mix];
                            let d = profile_partials(x, parameters[0], width, area, shape, mix);
                            for k in 0..4 {
                                let h = if k < 2 { width * 1e-4 } else { 1e-3 };
                                let values: Vec<_> = [-2., -1., 1., 2.]
                                    .iter()
                                    .map(|f| {
                                        let mut p = parameters;
                                        p[k] += f * h;
                                        profile_with_shape(x, p[0], p[1], p[2], shape, p[3])
                                    })
                                    .collect();
                                let numeric = (values[0] - 8. * values[1] + 8. * values[2]
                                    - values[3])
                                    / (12. * h);
                                assert!((numeric-d[k]).abs()<1e-7*d[k].abs().max(1.) + 32.*f64::EPSILON*values.iter().map(|v|v.abs()).fold(0.,f64::max)/h,"k={k} w={width} area={area} mix={mix} offset={offset}: {} vs {numeric}",d[k]);
                            }
                        }
                    }
                }
            }
        }
    }
}

impl Prepared {
    /// (dA/dtheta)^T r for each projected coefficient, without materializing a
    /// rows × linear × nonlinear tensor. Background basis columns are constant.
    pub(super) fn projection_correction(
        &self,
        x: &[f64],
        linear: &[usize],
        nonlinear: &[usize],
        residual: &DVector<f64>,
    ) -> (DMatrix<f64>, Vec<bool>) {
        let mut p = self.expand(x);
        let mut site_columns = vec![None; p.sites.len()];
        for (i, e) in self.entries.iter().enumerate() {
            if e.key != "intensity" {
                continue;
            }
            let Some(site) = e.site else { continue };
            let (root, f) = self.roots[i];
            let Some(k) = self.free.iter().position(|&r| r == root) else {
                continue;
            };
            let Some(local) = linear.iter().position(|&j| j == k) else {
                continue;
            };
            site_columns[site] = Some((local, f * self.scale[k]));
            p.sites[site].params.get_mut("intensity").unwrap().value = 1.;
        }
        let lines = self.line_derivatives(&p, x);
        let mut c = DMatrix::zeros(linear.len(), nonlinear.len());
        let mut gradient = vec![0.; x.len()];
        for (row, &v) in p.spectrum.x.iter().enumerate() {
            if cancellation_requested() {
                break;
            }
            let weight = self.evaluation_plan.weights[row];
            for (site, line) in lines.sites.iter().enumerate() {
                if let Some((local, f)) = site_columns[site] {
                    gradient.fill(0.);
                    line.accumulate(v, &mut gradient);
                    for (k, &j) in nonlinear.iter().enumerate() {
                        c[(local, k)] -= gradient[j] * f * residual[row] / weight;
                    }
                }
            }
        }
        (c, nonlinear.iter().map(|&k| lines.fallback[k]).collect())
    }
}
