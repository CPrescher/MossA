//! Ported MossA line profiles and browser/native fitting API.
//! See reference/MossA and PORTING.md for provenance and intentional differences.
use basin::{
    CostFunction, DenseMatrix, Executor, Jacobian, Observe, ObserverMode, Residual, State,
    TrustRegionReflective,
};
use nalgebra::{DMatrix, DVector};
use rustfft::{num_complex::Complex, FftPlanner};
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, f64::consts::PI};
use wasm_bindgen::prelude::*;
use web_time::Instant;

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct Link {
    pub target: String,
    pub factor: f64,
}
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct Parameter {
    pub value: f64,
    pub fit: bool,
    pub min: Option<f64>,
    pub max: Option<f64>,
    #[serde(default)]
    pub link: Option<Link>,
}
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct Site {
    pub name: String,
    pub kind: String,
    pub profile: String,
    pub params: BTreeMap<String, Parameter>,
}
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct Spectrum {
    pub x: Vec<f64>,
    pub y: Vec<f64>,
}
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct Project {
    pub spectrum: Spectrum,
    pub sites: Vec<Site>,
    pub background: Vec<Parameter>,
    pub mode: String,
    pub source_fwhm: f64,
    pub source_squared: bool,
    pub weighting: String,
    pub max_iterations: usize,
}
#[derive(Serialize, Deserialize, Debug)]
pub struct Evaluation {
    pub parameters: BTreeMap<String, f64>,
    pub y: Vec<f64>,
    pub background: Vec<f64>,
    /// Absorption curves, before transmission convolution (not additive in FT mode).
    pub components: Vec<Vec<f64>>,
    pub residual: Vec<f64>,
    pub sse: f64,
    pub objective: f64,
}
#[derive(Serialize, Deserialize, Debug)]
pub struct IntensityFraction {
    /// Percent of the summed site intensity parameters (MATLAB table convention).
    pub value: Option<f64>,
    /// Approximate 1 std in percentage points, including parameter covariance.
    pub error: Option<f64>,
}
#[derive(Serialize, Deserialize, Debug)]
pub struct FitResult {
    pub project: Project,
    pub evaluation: Evaluation,
    pub errors: BTreeMap<String, Option<f64>>,
    #[serde(default)]
    pub intensity_fractions: Vec<IntensityFraction>,
    pub iterations: u64,
    pub converged: bool,
    pub termination: String,
    pub free_parameters: usize,
    pub dof: usize,
    pub rank: usize,
    pub reduced_objective: f64,
    pub warnings: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct FitProgress {
    pub iteration: u64,
    pub elapsed_ms: f64,
    pub project: Project,
    pub evaluation: Evaluation,
}
struct ProgressObserver {
    model: Prepared,
    callback: Option<Box<dyn FnMut(FitProgress)>>,
    started: Instant,
    last: Option<Instant>,
}
impl ProgressObserver {
    fn publish<S: State<Param = Vec<f64>, Float = f64>>(&mut self, state: &S) {
        if self.callback.is_none() {
            return;
        }
        let now = Instant::now();
        if self
            .last
            .is_some_and(|last| now.duration_since(last).as_millis() < 100)
        {
            return;
        }
        self.last = Some(now);
        if let Ok(evaluation) = finite_evaluation(evaluate_prepared(&self.model, state.param())) {
            self.callback.as_mut().unwrap()(FitProgress {
                iteration: state.iter(),
                elapsed_ms: now.duration_since(self.started).as_secs_f64() * 1000.,
                project: self.model.expand(state.param()),
                evaluation,
            });
        }
    }
}
impl<S: State<Param = Vec<f64>, Float = f64>> Observe<S> for ProgressObserver {
    fn observe_init(&mut self, state: &S) {
        self.publish(state);
    }
    fn observe_iter(&mut self, state: &S) {
        self.publish(state);
    }
}

pub fn profile(x: f64, center: f64, fwhm: f64, intensity: f64, shape: &str, mix: f64) -> f64 {
    let h = fwhm / 2.;
    let z = (x - center) / h;
    let l = intensity / (PI * h * (1. + z * z));
    // Retain the literal constants in gauss_curve.m, including their rounding.
    let g = intensity * 0.8326 / (h * 1.7725) * (-(z * 0.8326).powi(2)).exp();
    match shape {
        "Gaussian" => g,
        "PseudoVoigt" => mix * l + (1. - mix) * g,
        "LorSquared" => intensity * 2. / (PI * h * (1. + z * z).powi(2)),
        _ => l,
    }
}
fn get(s: &Site, key: &str) -> f64 {
    s.params[key].value
}
pub fn site_curve(s: &Site, x: f64) -> f64 {
    let (cs, w, area) = (get(s, "cs"), get(s, "fwhm"), get(s, "intensity"));
    let mix = s.params.get("mix").map_or(0.5, |p| p.value);
    let line = |c, a| profile(x, c, w, a, &s.profile, mix);
    match s.kind.as_str() {
        "Singlet" => line(cs, area),
        "Doublet" => {
            let q = get(s, "qs") / 2.;
            let r = get(s, "a12");
            line(cs - q, r * area) + line(cs + q, (1. - r) * area)
        }
        _ => {
            let q = get(s, "qs") / 2.;
            let b = get(s, "bhf");
            let r2 = 1. / get(s, "a12");
            let r3 = 1. / get(s, "a13");
            // Preserve sextet.m's normalization and its A12/A13 ratio conventions.
            let a = area * 3. / (6. + 6. * (r2 + r3));
            line(cs - b * 0.1613 + q, a)
                + line(cs - b * 0.0934 - q, a * r2)
                + line(cs - b * 0.0255 - q, a * r3)
                + line(cs + b * 0.0255 - q, a * r3)
                + line(cs + b * 0.0934 - q, a * r2)
                + line(cs + b * 0.1613 + q, a)
        }
    }
}
fn active_keys(s: &Site) -> Vec<&'static str> {
    let mut k = vec!["cs", "fwhm", "intensity"];
    if s.kind != "Singlet" {
        k.extend(["qs", "a12"]);
    }
    if s.kind == "Sextet" {
        k.extend(["bhf", "a13"]);
    }
    if s.profile == "PseudoVoigt" {
        k.push("mix");
    }
    k
}
#[derive(Clone)]
struct Entry {
    id: String,
    param: Parameter,
    site: Option<usize>,
    key: String,
    lower: f64,
    upper: f64,
}
#[derive(Clone)]
struct Prepared {
    project: Project,
    entries: Vec<Entry>,
    roots: Vec<(usize, f64)>,
    free: Vec<usize>,
    scale: Vec<f64>,
    lower: Vec<f64>,
    upper: Vec<f64>,
    initial: Vec<f64>,
    // Precomputed source Fourier transform, shared by all model evaluations.
    source_fft: Option<Vec<Complex<f64>>>,
}
fn valid(p: &Project) -> Result<(), String> {
    let n = p.spectrum.x.len();
    if n < 8 || n > 20000 || p.spectrum.y.len() != n {
        return Err("Provide 8–20,000 paired spectrum points.".into());
    }
    if p.spectrum
        .x
        .iter()
        .chain(&p.spectrum.y)
        .any(|v| !v.is_finite())
    {
        return Err("Spectrum contains non-finite values.".into());
    }
    if p.spectrum.x.windows(2).any(|w| w[1] <= w[0]) {
        return Err(
            "Velocities must be strictly increasing; sort data and remove duplicate x values."
                .into(),
        );
    }
    if p.sites.len() > 16 {
        return Err("Define at most 16 sites.".into());
    }
    if !(1..=4).contains(&p.background.len()) {
        return Err("Background order must be 0–3.".into());
    }
    if !["thin", "transmission"].contains(&p.mode.as_str()) {
        return Err("Unknown spectrum model.".into());
    }
    if !["unweighted", "counts"].contains(&p.weighting.as_str()) {
        return Err("Unknown residual weighting.".into());
    }
    if p.weighting == "counts" && p.spectrum.y.iter().any(|v| *v <= 0.) {
        return Err("Count weighting requires strictly positive observed counts; use unweighted fitting for background-subtracted data.".into());
    }
    if !(1..=2000).contains(&p.max_iterations) {
        return Err("Iteration limit must be 1–2,000.".into());
    }
    if p.mode == "transmission"
        && (!p.source_fwhm.is_finite()
            || p.source_fwhm < 0.001
            || p.source_fwhm > 5.
            || p.spectrum.x[0] < -30.
            || p.spectrum.x[n - 1] > 30.)
    {
        return Err(
            "Transmission requires source FWHM 0.001–5 mm/s and velocities inside ±30 mm/s.".into(),
        );
    }
    Ok(())
}
impl Prepared {
    fn new(p: &Project) -> Result<Self, String> {
        valid(p)?;
        let mut entries = Vec::new();
        for (i, param) in p.background.iter().enumerate() {
            entries.push(Entry {
                id: format!("bkg:{i}"),
                param: param.clone(),
                site: None,
                key: i.to_string(),
                lower: f64::NEG_INFINITY,
                upper: f64::INFINITY,
            });
        }
        for (i, s) in p.sites.iter().enumerate() {
            if !["Singlet", "Doublet", "Sextet"].contains(&s.kind.as_str())
                || !["Lorentzian", "Gaussian", "PseudoVoigt", "LorSquared"]
                    .contains(&s.profile.as_str())
            {
                return Err(format!("Unknown site type/profile for site {}.", i + 1));
            }
            for key in active_keys(s) {
                let param = s
                    .params
                    .get(key)
                    .ok_or_else(|| format!("Missing {key} in site {}.", i + 1))?
                    .clone();
                let (lo, hi) = match key {
                    "fwhm" => (1e-6, f64::INFINITY),
                    "intensity" | "bhf" => (0., f64::INFINITY),
                    "mix" => (0., 1.),
                    "a12" if s.kind == "Doublet" => (0., 1.),
                    "a12" | "a13" => (1e-6, f64::INFINITY),
                    _ => (f64::NEG_INFINITY, f64::INFINITY),
                };
                entries.push(Entry {
                    id: format!("site:{i}:{key}"),
                    param,
                    site: Some(i),
                    key: key.to_string(),
                    lower: lo,
                    upper: hi,
                });
            }
        }
        for e in &mut entries {
            if !e.param.value.is_finite()
                || e.param.min.is_some_and(|v| !v.is_finite())
                || e.param.max.is_some_and(|v| !v.is_finite())
            {
                return Err(format!(
                    "{}: values/bounds must be finite; use null for an open bound.",
                    e.id
                ));
            }
            e.lower = e.lower.max(e.param.min.unwrap_or(f64::NEG_INFINITY));
            e.upper = e.upper.min(e.param.max.unwrap_or(f64::INFINITY));
            if e.lower > e.upper {
                return Err(format!("{}: incompatible bounds.", e.id));
            }
        }
        fn root(
            i: usize,
            entries: &[Entry],
            trail: &mut Vec<usize>,
        ) -> Result<(usize, f64), String> {
            if trail.contains(&i) {
                return Err("Circular parameter link.".into());
            }
            trail.push(i);
            let ans = if let Some(l) = &entries[i].param.link {
                if !l.factor.is_finite() {
                    return Err("Link factor must be finite.".into());
                }
                let j = entries
                    .iter()
                    .position(|e| e.id == l.target)
                    .ok_or_else(|| {
                        format!("Link target {} does not exist or is inactive.", l.target)
                    })?;
                let (r, f) = root(j, entries, trail)?;
                (r, f * l.factor)
            } else {
                (i, 1.)
            };
            trail.pop();
            if !ans.1.is_finite() {
                return Err("Link factors overflow.".into());
            }
            Ok(ans)
        }
        let roots: Vec<_> = (0..entries.len())
            .map(|i| root(i, &entries, &mut vec![]))
            .collect::<Result<_, _>>()?;
        let mut bounds: Vec<_> = entries.iter().map(|e| (e.lower, e.upper)).collect();
        for (i, &(r, f)) in roots.iter().enumerate() {
            let e = &entries[i];
            if f == 0. {
                if e.lower > 0. || e.upper < 0. {
                    return Err(format!("{}: zero link violates bounds.", e.id));
                }
                continue;
            }
            let (a, b) = (e.lower / f, e.upper / f);
            bounds[r].0 = bounds[r].0.max(a.min(b));
            bounds[r].1 = bounds[r].1.min(a.max(b));
        }
        let mut free = vec![];
        let mut scale = vec![];
        let mut lower = vec![];
        let mut upper = vec![];
        let mut initial = vec![];
        for (i, e) in entries.iter().enumerate() {
            if roots[i].0 != i {
                continue;
            }
            let (lo, hi) = bounds[i];
            if lo > hi || e.param.value < lo || e.param.value > hi {
                return Err(format!(
                    "{}: initial value is outside its bounds (including linked bounds).",
                    e.id
                ));
            }
            if e.param.fit && lo < hi {
                let floor = match e.key.as_str() {
                    "fwhm" => 0.2,
                    "cs" | "qs" => 1.,
                    _ => 1.,
                };
                let s = e.param.value.abs().max(floor);
                free.push(i);
                scale.push(s);
                lower.push(lo / s);
                upper.push(hi / s);
                initial.push(e.param.value / s);
            }
        }
        if free.len() >= p.spectrum.x.len() {
            return Err("More observations than free parameters are required.".into());
        }
        let source_fft = if p.mode == "transmission" {
            let mut a = vec![Complex::default(); 16384];
            for (i, z) in a.iter_mut().take(6001).enumerate() {
                z.re = profile(
                    -30. + i as f64 * 0.01,
                    0.,
                    p.source_fwhm,
                    1.,
                    if p.source_squared {
                        "LorSquared"
                    } else {
                        "Lorentzian"
                    },
                    0.,
                );
            }
            FftPlanner::new().plan_fft_forward(a.len()).process(&mut a);
            Some(a)
        } else {
            None
        };
        Ok(Self {
            project: p.clone(),
            entries,
            roots,
            free,
            scale,
            lower,
            upper,
            initial,
            source_fft,
        })
    }
    fn expand(&self, x: &[f64]) -> Project {
        let mut values: Vec<_> = self.entries.iter().map(|e| e.param.value).collect();
        for (j, &i) in self.free.iter().enumerate() {
            values[i] = x[j] * self.scale[j];
        }
        let mut p = self.project.clone();
        for (i, e) in self.entries.iter().enumerate() {
            let (r, f) = self.roots[i];
            let v = values[r] * f;
            match e.site {
                Some(s) => p.sites[s].params.get_mut(&e.key).unwrap().value = v,
                None => p.background[e.key.parse::<usize>().unwrap()].value = v,
            };
        }
        p
    }
    fn curves(&self, x: &[f64]) -> (Vec<f64>, Vec<f64>, Vec<Vec<f64>>) {
        let p = self.expand(x);
        let xs = &p.spectrum.x;
        let background: Vec<_> = xs
            .iter()
            .map(|&v| {
                p.background
                    .iter()
                    .rev()
                    .fold(0., |sum, b| sum * v + b.value)
            })
            .collect();
        let components: Vec<Vec<f64>> = p
            .sites
            .iter()
            .map(|s| xs.iter().map(|&v| site_curve(s, v)).collect())
            .collect();
        let y = if let Some(source) = &self.source_fft {
            let mut a = vec![Complex::default(); source.len()];
            for (i, z) in a.iter_mut().take(6001).enumerate() {
                let v = -30. + i as f64 * 0.01;
                z.re = (-p.sites.iter().map(|s| site_curve(s, v)).sum::<f64>()).exp();
            }
            let mut planner = FftPlanner::new();
            planner.plan_fft_forward(a.len()).process(&mut a);
            for (v, k) in a.iter_mut().zip(source) {
                *v *= k;
            }
            let len = a.len() as f64;
            planner.plan_fft_inverse(a.len()).process(&mut a);
            // MATLAB conv(source, exp(-absorber), 'same'), then pchip; /100 is the original 0.01 grid step.
            let grid: Vec<_> = (0..6001).map(|i| a[i + 3000].re / len / 100.).collect();
            let slopes = pchip_slopes(&grid, 0.01);
            xs.iter()
                .zip(&background)
                .map(|(&v, &b)| {
                    p.background[0].value * pchip(&grid, &slopes, v) + b - p.background[0].value
                })
                .collect()
        } else {
            (0..xs.len())
                .map(|i| background[i] - components.iter().map(|c| c[i]).sum::<f64>())
                .collect()
        };
        (y, background, components)
    }
    fn residuals(&self, x: &[f64]) -> Vec<f64> {
        let (y, _, _) = self.curves(x);
        y.iter()
            .zip(&self.project.spectrum.y)
            .map(|(a, b)| {
                (a - b)
                    / if self.project.weighting == "counts" {
                        b.sqrt()
                    } else {
                        1.
                    }
            })
            .collect()
    }
    fn derivative(&self, x: &[f64]) -> DMatrix<f64> {
        let n = x.len();
        let m = self.project.spectrum.x.len();
        let mut j = DMatrix::zeros(m, n);
        for k in 0..n {
            let h = 6e-6 * x[k].abs().max(1.);
            let mut a = x.to_vec();
            let mut b = x.to_vec();
            a[k] = (x[k] + h).min(self.upper[k]);
            b[k] = (x[k] - h).max(self.lower[k]);
            let d = a[k] - b[k];
            let ra = self.residuals(&a);
            let rb = self.residuals(&b);
            for i in 0..m {
                j[(i, k)] = (ra[i] - rb[i]) / d;
            }
        }
        j
    }
}
fn pchip_slopes(y: &[f64], h: f64) -> Vec<f64> {
    let d: Vec<_> = y.windows(2).map(|w| (w[1] - w[0]) / h).collect();
    let n = y.len();
    let mut s = vec![0.; n];
    for i in 1..n - 1 {
        if d[i - 1] * d[i] > 0. {
            s[i] = 2. * d[i - 1] * d[i] / (d[i - 1] + d[i]);
        }
    }
    let end = |a: f64, b: f64| {
        let v = (3. * a - b) / 2.;
        if v * a <= 0. {
            0.
        } else if a * b < 0. && v.abs() > 3. * a.abs() {
            3. * a
        } else {
            v
        }
    };
    s[0] = end(d[0], d[1]);
    s[n - 1] = end(d[n - 2], d[n - 3]);
    s
}
fn pchip(y: &[f64], s: &[f64], x: f64) -> f64 {
    let u = ((x + 30.) / 0.01).clamp(0., 6000.);
    let i = (u.floor() as usize).min(5999);
    let t = u - i as f64;
    (2. * t.powi(3) - 3. * t * t + 1.) * y[i]
        + (t.powi(3) - 2. * t * t + t) * 0.01 * s[i]
        + (-2. * t.powi(3) + 3. * t * t) * y[i + 1]
        + (t.powi(3) - t * t) * 0.01 * s[i + 1]
}

impl basin::Constraints for Prepared {
    type Set = basin::ConstraintSet<basin::BoxBounds<Vec<f64>>>;
    fn constraints(&self) -> <Self::Set as basin::ConstraintDescription>::Borrowed<'_> {
        basin::ConstraintSet::new()
            .with_bounds(basin::BoxBounds::new(Some(&self.lower), Some(&self.upper)))
    }
}
impl CostFunction for Prepared {
    type Param = Vec<f64>;
    type Output = f64;
    type Error = String;
    fn cost(&self, x: &Vec<f64>) -> Result<f64, String> {
        Ok(0.5 * self.residuals(x).iter().map(|r| r * r).sum::<f64>())
    }
}
impl Residual for Prepared {
    type Param = Vec<f64>;
    type Output = Vec<f64>;
    type Error = String;
    fn residual(&self, x: &Vec<f64>) -> Result<Vec<f64>, String> {
        let r = self.residuals(x);
        if r.iter().any(|v| !v.is_finite()) {
            Err("Non-finite model residual.".into())
        } else {
            Ok(r)
        }
    }
}
impl Jacobian for Prepared {
    type Jacobian = DenseMatrix;
    fn jacobian(&self, x: &Vec<f64>) -> Result<DenseMatrix, String> {
        let j = self.derivative(x);
        if j.iter().any(|v| !v.is_finite()) {
            return Err(
                "Non-finite numerical derivative; check parameter scales and bounds.".into(),
            );
        }
        Ok(DenseMatrix::from_fn(j.nrows(), j.ncols(), |r, c| j[(r, c)]))
    }
}
fn evaluate_prepared(m: &Prepared, x: &[f64]) -> Evaluation {
    let (y, background, components) = m.curves(x);
    let residual: Vec<_> = m
        .project
        .spectrum
        .y
        .iter()
        .zip(&y)
        .map(|(a, b)| a - b)
        .collect();
    let sse = residual.iter().map(|r| r * r).sum();
    let objective = m.residuals(x).iter().map(|r| r * r).sum();
    let expanded = m.expand(x);
    let parameters = m
        .entries
        .iter()
        .map(|e| {
            let value = match e.site {
                Some(i) => expanded.sites[i].params[&e.key].value,
                None => expanded.background[e.key.parse::<usize>().unwrap()].value,
            };
            (e.id.clone(), value)
        })
        .collect();
    Evaluation {
        parameters,
        y,
        background,
        components,
        residual,
        sse,
        objective,
    }
}
fn finite_evaluation(e: Evaluation) -> Result<Evaluation, String> {
    if e.y
        .iter()
        .chain(&e.background)
        .chain(&e.residual)
        .chain(e.components.iter().flatten())
        .any(|v| !v.is_finite())
        || !e.sse.is_finite()
        || !e.objective.is_finite()
    {
        Err("Model calculation overflowed; check the parameter values and scales.".into())
    } else {
        Ok(e)
    }
}
pub fn evaluate(p: &Project) -> Result<Evaluation, String> {
    let m = Prepared::new(p)?;
    finite_evaluation(evaluate_prepared(&m, &m.initial))
}
pub fn fit(p: &Project) -> Result<FitResult, String> {
    fit_with_progress(p, None)
}
fn fraction_statistics(
    m: &Prepared,
    x: &[f64],
    covariance: Option<&DMatrix<f64>>,
    active: &[bool],
) -> Vec<IntensityFraction> {
    let p = m.expand(x);
    let total: f64 = p.sites.iter().map(|s| get(s, "intensity")).sum();
    let indices: Vec<_> = m
        .entries
        .iter()
        .enumerate()
        .filter(|(_, e)| e.site.is_some() && e.key == "intensity")
        .map(|(i, _)| i)
        .collect();
    p.sites
        .iter()
        .enumerate()
        .map(|(i, site)| {
            if !total.is_finite() || total <= 0. {
                return IntensityFraction {
                    value: None,
                    error: None,
                };
            }
            let fraction = get(site, "intensity") / total;
            let mut gradient = DVector::<f64>::zeros(x.len());
            let mut contribution_size = 0_f64;
            for (j, &entry) in indices.iter().enumerate() {
                let (root, factor) = m.roots[entry];
                if let Some(k) = m.free.iter().position(|&r| r == root) {
                    let term = 100. / total
                        * (if i == j { 1. - fraction } else { -fraction })
                        * factor
                        * m.scale[k];
                    gradient[k] += term;
                    contribution_size += term.abs();
                }
            }
            // Exact link ratios can make a fraction constant despite a varying total.
            let tolerance = contribution_size * 1e-12;
            let constant = gradient.iter().all(|g| g.abs() <= tolerance);
            let bounded = gradient
                .iter()
                .enumerate()
                .any(|(k, g)| active.get(k).copied().unwrap_or(false) && g.abs() > tolerance);
            let error = if constant {
                Some(0.)
            } else if bounded {
                None
            } else {
                covariance.and_then(|cov| {
                    let variance = gradient.dot(&(cov * &gradient));
                    variance.is_finite().then(|| variance.max(0.).sqrt())
                })
            };
            IntensityFraction {
                value: Some(100. * fraction),
                error,
            }
        })
        .collect()
}
pub fn fit_with_progress(
    p: &Project,
    callback: Option<Box<dyn FnMut(FitProgress)>>,
) -> Result<FitResult, String> {
    let m = Prepared::new(p)?;
    let mut warnings = vec![];
    let (x, iterations, converged, termination) = if m.free.is_empty() {
        (vec![], 0, true, "All parameters fixed".to_string())
    } else {
        let solver = TrustRegionReflective::new()
            .with_absolute_scaled_gradient_tolerance(1e-8)
            .with_relative_cost_change_tolerance(1e-10);
        let result = Executor::from_start(m.clone(), solver, m.initial.clone())
            .max_iter(p.max_iterations as u64)
            .observe_with(
                ProgressObserver {
                    model: m.clone(),
                    callback,
                    started: Instant::now(),
                    last: None,
                },
                ObserverMode::Always,
            )
            .run()
            .map_err(|e| format!("Solver: {e:?}"))?;
        (
            result.param().clone(),
            result.state.iter(),
            result.report.termination.is_converged(),
            format!("{:?}", result.report.code()),
        )
    };
    if !converged {
        warnings.push("Solver stopped without satisfying its convergence criterion; inspect this fit before using the results.".into());
    }
    let evaluation = finite_evaluation(evaluate_prepared(&m, &x))?;
    let dof = p.spectrum.x.len() - x.len();
    let reduced = evaluation.objective / dof as f64;
    let mut root_errors = vec![None; m.entries.len()];
    let mut rank = 0;
    let mut covariance = None;
    let mut active = vec![];
    if !x.is_empty() {
        let j = m.derivative(&x);
        let svd = j.svd(false, true);
        let largest = svd.singular_values.max();
        let cutoff = largest * 1e-10;
        rank = svd
            .singular_values
            .iter()
            .filter(|&&v| v > cutoff && v > 0.)
            .count();
        active = x
            .iter()
            .enumerate()
            .map(|(i, &v)| {
                let h = 1e-6 * v.abs().max(1.);
                (v - m.lower[i]).abs() < h || (v - m.upper[i]).abs() < h
            })
            .collect();
        if rank < x.len() {
            warnings.push(
                "Jacobian is rank deficient; parameter uncertainties are unavailable.".into(),
            );
        } else {
            let v = svd.v_t.unwrap().transpose();
            let inv = DMatrix::from_diagonal(&DVector::from_iterator(
                x.len(),
                svd.singular_values.iter().map(|s| 1. / (s * s)),
            ));
            let cov = &v * inv * v.transpose() * reduced;
            for k in 0..x.len() {
                if !active[k] {
                    root_errors[m.free[k]] = Some(cov[(k, k)].max(0.).sqrt() * m.scale[k]);
                }
            }
            covariance = Some(cov);
        }
        if active.iter().any(|v| *v) {
            warnings.push("One or more parameters are at a bound; symmetric uncertainty estimates for them and their linked parameters are omitted.".into());
        }
    }
    let errors = m
        .entries
        .iter()
        .enumerate()
        .map(|(i, e)| {
            let (r, f) = m.roots[i];
            (e.id.clone(), root_errors[r].map(|s| s * f.abs()))
        })
        .collect();
    Ok(FitResult {
        project: m.expand(&x),
        evaluation,
        errors,
        intensity_fractions: fraction_statistics(&m, &x, covariance.as_ref(), &active),
        iterations,
        converged,
        termination,
        free_parameters: x.len(),
        dof,
        rank,
        reduced_objective: reduced,
        warnings,
    })
}
#[wasm_bindgen]
pub fn evaluate_json(json: &str) -> Result<String, JsValue> {
    let p: Project = serde_json::from_str(json).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let v = evaluate(&p).map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&v).map_err(|e| JsValue::from_str(&e.to_string()))
}
#[wasm_bindgen]
pub fn fit_json(json: &str) -> Result<String, JsValue> {
    let p: Project = serde_json::from_str(json).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let v = fit(&p).map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&v).map_err(|e| JsValue::from_str(&e.to_string()))
}

#[cfg(test)]
mod tests;

#[wasm_bindgen]
pub fn fit_json_with_progress(json: &str, callback: js_sys::Function) -> Result<String, JsValue> {
    let p: Project = serde_json::from_str(json).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let notify = move |progress: FitProgress| {
        if let Ok(json) = serde_json::to_string(&progress) {
            let _ = callback.call1(&JsValue::NULL, &JsValue::from_str(&json));
        }
    };
    let result =
        fit_with_progress(&p, Some(Box::new(notify))).map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&result).map_err(|e| JsValue::from_str(&e.to_string()))
}
