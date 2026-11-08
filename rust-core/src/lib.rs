//! Ported MossA line profiles and browser/native fitting API.
//! See reference/MossA and PORTING.md for provenance and intentional differences.
use basin::{
    BoundedLevenbergMarquardt, CostFunction, DenseMatrix, Executor, Jacobian, Observe,
    ObserverMode, Residual, State, TrustRegionReflective,
};
use nalgebra::{DMatrix, DVector};
use rustfft::{num_complex::Complex, Fft, FftPlanner};
use serde::{Deserialize, Serialize};
use std::{
    cell::RefCell,
    collections::BTreeMap,
    f64::consts::PI,
    rc::Rc,
    sync::{Arc, OnceLock},
};
use wasm_bindgen::prelude::*;
use web_time::Instant;
#[cfg(not(target_arch = "wasm32"))]
pub mod native;
mod parallel;
mod xvbf;
#[inline]
fn cancellation_requested() -> bool {
    #[cfg(not(target_arch = "wasm32"))]
    {
        native::canceled()
    }
    #[cfg(target_arch = "wasm32")]
    {
        false
    }
}
#[inline]
fn check_cancellation() -> Result<(), String> {
    if cancellation_requested() {
        Err("Calculation canceled.".into())
    } else {
        Ok(())
    }
}
pub use xvbf::{Component as DistributionComponent, Xvbf};

const TRANSMISSION_FFT_LEN: usize = 16384;
struct TransmissionFft {
    forward: Arc<dyn Fft<f64>>,
    inverse: Arc<dyn Fft<f64>>,
}
fn transmission_fft() -> &'static TransmissionFft {
    // Plans are immutable and thread-safe. Reuse them across residuals, fits,
    // source calibrations, and previews; buffers remain local to the calculation.
    static FFT: OnceLock<TransmissionFft> = OnceLock::new();
    FFT.get_or_init(|| {
        let mut planner = FftPlanner::new();
        TransmissionFft {
            forward: planner.plan_fft_forward(TRANSMISSION_FFT_LEN),
            inverse: planner.plan_fft_inverse(TRANSMISSION_FFT_LEN),
        }
    })
}

struct TransmissionWorkspace {
    buffer: Vec<Complex<f64>>,
    scratch: Vec<Complex<f64>>,
}
impl TransmissionWorkspace {
    fn new() -> Self {
        let fft = transmission_fft();
        Self {
            buffer: vec![Complex::default(); TRANSMISSION_FFT_LEN],
            scratch: vec![
                Complex::default();
                fft.forward
                    .get_inplace_scratch_len()
                    .max(fft.inverse.get_inplace_scratch_len())
            ],
        }
    }
}
thread_local! {
    // One workspace per calling thread, never shared mutable fit state. Borrowed
    // only during convolution, so progress callbacks can safely evaluate models.
    static TRANSMISSION_WORKSPACE: RefCell<TransmissionWorkspace> = RefCell::new(TransmissionWorkspace::new());
}

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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    pub kind: String,
    pub profile: String,
    pub params: BTreeMap<String, Parameter>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub xvbf: Option<Xvbf>,
}
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct Spectrum {
    pub x: Vec<f64>,
    pub y: Vec<f64>,
}
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct SourceGaussian {
    pub center: f64,
    pub fwhm: f64,
    pub weight: f64,
}
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct NuclearConstants {
    pub id: String,
    /// Positive outer/middle/inner half-displacements in mm/s/T.
    pub coefficients: [f64; 3],
}
#[derive(Deserialize)]
struct NuclearDefinition {
    coefficients: [f64; 3],
}
fn deserialize_nuclear_constants<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<NuclearConstants>, D::Error> {
    // Only an absent field is legacy; explicit null must not silently erase
    // a convention marker at the raw native/WASM API boundary.
    NuclearConstants::deserialize(deserializer).map(Some)
}
fn magnetic_coefficients(p: &Project) -> Result<[f64; 3], String> {
    static DEFINITIONS: OnceLock<BTreeMap<String, NuclearDefinition>> = OnceLock::new();
    let definitions = DEFINITIONS.get_or_init(|| {
        serde_json::from_str(include_str!("../../src/nuclear-constants.json"))
            .expect("Bundled nuclear constants must be valid")
    });
    match &p.nuclear_constants {
        None => Ok(definitions["mossa-legacy-rounded"].coefficients),
        Some(constants) => match definitions.get(&constants.id) {
            Some(definition) if definition.coefficients == constants.coefficients => {
                Ok(constants.coefficients)
            }
            _ => Err("Unsupported or inconsistent 57Fe nuclear constants.".into()),
        },
    }
}
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct Project {
    pub spectrum: Spectrum,
    pub sites: Vec<Site>,
    pub background: Vec<Parameter>,
    pub mode: String,
    pub source_fwhm: f64,
    pub source_squared: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_gaussians: Option<Vec<SourceGaussian>>,
    pub weighting: String,
    pub max_iterations: usize,
    /// Absent in existing projects: preserve the original MATLAB convention.
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "deserialize_nuclear_constants"
    )]
    pub nuclear_constants: Option<NuclearConstants>,
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
    /// Largest normalized residual-gradient component after projecting outward
    /// gradients at active bounds. Independent of the solver termination code.
    #[serde(default)]
    pub stationarity: Option<f64>,
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
    let lorentzian = || intensity / (PI * h * (1. + z * z));
    // Retain the literal constants in gauss_curve.m, including their rounding.
    let gaussian = || intensity * 0.8326 / (h * 1.7725) * (-(z * 0.8326).powi(2)).exp();
    match shape {
        "Gaussian" => gaussian(),
        "PseudoVoigt" => mix * lorentzian() + (1. - mix) * gaussian(),
        "LorSquared" => intensity * 2. / (PI * h * (1. + z * z).powi(2)),
        _ => lorentzian(),
    }
}
fn get(s: &Site, key: &str) -> f64 {
    s.params[key].value
}
pub fn site_curve(s: &Site, x: f64) -> f64 {
    // Retained legacy helper for the original MATLAB-expression fixtures.
    site_curve_with_coefficients(s, x, [0.1613, 0.0934, 0.0255])
}
fn site_curve_with_coefficients(s: &Site, x: f64, coefficients: [f64; 3]) -> f64 {
    if s.xvbf.is_some() {
        return xvbf::curve(s, x);
    }
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
            let [outer, middle, inner] = coefficients;
            line(cs - b * outer + q, a)
                + line(cs - b * middle - q, a * r2)
                + line(cs - b * inner - q, a * r3)
                + line(cs + b * inner - q, a * r3)
                + line(cs + b * middle - q, a * r2)
                + line(cs + b * outer + q, a)
        }
    }
}

// Resolve parameter maps and line geometry once per model evaluation, rather
// than at each of the 6,001 integration points. Preserve line/summation order.
struct SiteCurve<'a> {
    site: &'a Site,
    fwhm: f64,
    mix: f64,
    lines: [(f64, f64); 6],
    count: usize,
}
impl<'a> SiteCurve<'a> {
    fn new(site: &'a Site, coefficients: [f64; 3]) -> Self {
        let mut curve = Self {
            site,
            fwhm: 0.,
            mix: 0.,
            lines: [(0., 0.); 6],
            count: 0,
        };
        if site.xvbf.is_some() {
            return curve;
        }
        curve.fwhm = get(site, "fwhm");
        curve.mix = site.params.get("mix").map_or(0.5, |p| p.value);
        let (cs, area) = (get(site, "cs"), get(site, "intensity"));
        match site.kind.as_str() {
            "Singlet" => {
                curve.lines[0] = (cs, area);
                curve.count = 1;
            }
            "Doublet" => {
                let q = get(site, "qs") / 2.;
                let r = get(site, "a12");
                curve.lines[..2].copy_from_slice(&[(cs - q, r * area), (cs + q, (1. - r) * area)]);
                curve.count = 2;
            }
            _ => {
                let q = get(site, "qs") / 2.;
                let b = get(site, "bhf");
                let r2 = 1. / get(site, "a12");
                let r3 = 1. / get(site, "a13");
                let a = area * 3. / (6. + 6. * (r2 + r3));
                let [outer, middle, inner] = coefficients;
                curve.lines = [
                    (cs - b * outer + q, a),
                    (cs - b * middle - q, a * r2),
                    (cs - b * inner - q, a * r3),
                    (cs + b * inner - q, a * r3),
                    (cs + b * middle - q, a * r2),
                    (cs + b * outer + q, a),
                ];
                curve.count = 6;
            }
        }
        curve
    }
    fn value(&self, x: f64) -> f64 {
        if self.count == 0 {
            return xvbf::curve(self.site, x);
        }
        self.lines[..self.count]
            .iter()
            .map(|&(center, area)| {
                profile(x, center, self.fwhm, area, &self.site.profile, self.mix)
            })
            .sum()
    }
}
fn active_keys(s: &Site) -> Vec<&'static str> {
    if s.xvbf.is_some() {
        return vec!["intensity"];
    }
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
impl Entry {
    fn value(&self, p: &Project) -> f64 {
        if let Some(i) = self.site {
            return xvbf::parameter(&p.sites[i], &self.key).value;
        }
        if self.key == "source_fwhm" {
            return p.source_fwhm;
        }
        if let Some(key) = self.key.strip_prefix("gaussian:") {
            let (i, field) = key.split_once(':').unwrap();
            let g = &p.source_gaussians.as_ref().unwrap()[i.parse::<usize>().unwrap()];
            return match field {
                "center" => g.center,
                "fwhm" => g.fwhm,
                _ => g.weight,
            };
        }
        p.background[self.key.parse::<usize>().unwrap()].value
    }
    fn set(&self, p: &mut Project, value: f64) {
        if let Some(i) = self.site {
            xvbf::parameter_mut(&mut p.sites[i], &self.key).value = value;
        } else if self.key == "source_fwhm" {
            p.source_fwhm = value;
        } else if let Some(key) = self.key.strip_prefix("gaussian:") {
            let (i, field) = key.split_once(':').unwrap();
            let g = &mut p.source_gaussians.as_mut().unwrap()[i.parse::<usize>().unwrap()];
            match field {
                "center" => g.center = value,
                "fwhm" => g.fwhm = value,
                _ => g.weight = value,
            };
        } else {
            p.background[self.key.parse::<usize>().unwrap()].value = value;
        }
    }
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
    source_calibration: bool,
    magnetic_coefficients: [f64; 3],
    simplexes: Vec<xvbf::Simplex>,
    external_derivatives: Option<Rc<RefCell<parallel::DerivativeExchange>>>,
}
fn valid(p: &Project) -> Result<(), String> {
    if let Some(gs) = &p.source_gaussians {
        if gs.is_empty()
            || gs.len() > 3
            || gs.iter().any(|g| {
                !g.center.is_finite()
                    || g.center.abs() > 5.
                    || !g.fwhm.is_finite()
                    || !(0.03..=5.).contains(&g.fwhm)
                    || !g.weight.is_finite()
                    || !(0.001..=100.).contains(&g.weight)
            })
        {
            return Err("Gaussian source requires 1–3 components, centers inside ±5 mm/s, FWHM 0.03–5 mm/s, and positive relative weights 0.001–100.".into());
        }
    }
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
        Self::with_source_calibration(p, false)
    }
    fn with_source_calibration(p: &Project, source_calibration: bool) -> Result<Self, String> {
        valid(p)?;
        let magnetic_coefficients = magnetic_coefficients(p)?;
        if source_calibration
            && (p.mode != "transmission"
                || p.sites.len() != 1
                || p.sites[0].kind != "Singlet"
                || p.sites[0].profile != "Lorentzian"
                || p.sites[0].xvbf.is_some()
                || p.sites[0]
                    .params
                    .get("fwhm")
                    .is_none_or(|v| v.fit || v.link.is_some())
                || p.background.len() != 3
                || p.weighting != "unweighted")
        {
            return Err("Source calibration requires one Lorentzian singlet with fixed absorber FWHM, a quadratic background, and unweighted transmission fitting.".into());
        }
        let mut entries = Vec::new();
        if source_calibration && p.source_gaussians.is_some() {
            for (i, g) in p.source_gaussians.as_ref().unwrap().iter().enumerate() {
                for (field, value, lo, hi) in [
                    ("fwhm", g.fwhm, 0.03, 5.),
                    ("center", g.center, -5., 5.),
                    ("weight", g.weight, 0.001, 100.),
                ] {
                    entries.push(Entry {
                        id: format!("source:{i}:{field}"),
                        param: Parameter {
                            value,
                            fit: field == "fwhm" || i > 0,
                            min: None,
                            max: None,
                            link: None,
                        },
                        site: None,
                        key: format!("gaussian:{i}:{field}"),
                        lower: lo,
                        upper: hi,
                    });
                }
            }
        } else if source_calibration {
            entries.push(Entry {
                id: "source:fwhm".into(),
                param: Parameter {
                    value: p.source_fwhm,
                    fit: true,
                    min: None,
                    max: None,
                    link: None,
                },
                site: None,
                key: "source_fwhm".into(),
                lower: 0.001,
                upper: 5.,
            });
        }
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
            xvbf::validate(s)?;
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
            if let Some(x) = &s.xvbf {
                xvbf::entries(&mut entries, i, x);
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
            if e.lower > e.upper
                || (e.param.link.is_none() && (e.param.value < e.lower || e.param.value > e.upper))
            {
                return Err(format!("{}: incompatible bounds.", e.id));
            }
        }
        let simplexes = xvbf::simplexes(&mut entries, p)?;
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
                    "fwhm" | "source_fwhm" => 0.2,
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
        let source_fft = if p.mode == "transmission" && !source_calibration {
            Some(source_transform(p))
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
            source_calibration,
            magnetic_coefficients,
            simplexes,
            external_derivatives: None,
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
            e.set(&mut p, v);
        }
        xvbf::expand(&self.simplexes, &mut p, &values, &self.entries);
        p
    }
    fn curves(&self, x: &[f64]) -> (Vec<f64>, Vec<f64>, Vec<Vec<f64>>) {
        self.model_curves(x, true)
    }
    fn model_curves(
        &self,
        x: &[f64],
        display_components: bool,
    ) -> (Vec<f64>, Vec<f64>, Vec<Vec<f64>>) {
        let p = self.expand(x);
        let xs = &p.spectrum.x;
        let site_curves: Vec<_> = p
            .sites
            .iter()
            .map(|site| SiteCurve::new(site, self.magnetic_coefficients))
            .collect();
        let background: Vec<_> = xs
            .iter()
            .map(|&v| {
                p.background
                    .iter()
                    .rev()
                    .fold(0., |sum, b| sum * v + b.value)
            })
            .collect();
        let components: Vec<Vec<f64>> = if display_components {
            site_curves
                .iter()
                .map(|s| xs.iter().map(|&v| s.value(v)).collect())
                .collect()
        } else {
            vec![]
        };
        let changing_source = self.source_calibration.then(|| source_transform(&p));
        let y = if let Some(source) = changing_source.as_ref().or(self.source_fft.as_ref()) {
            TRANSMISSION_WORKSPACE.with(|workspace| {
                let mut workspace = workspace.borrow_mut();
                let TransmissionWorkspace { buffer: a, scratch } = &mut *workspace;
                a.fill(Complex::default());
                for (i, z) in a.iter_mut().take(6001).enumerate() {
                    let v = -30. + i as f64 * 0.01;
                    let optical_depth = site_curves.iter().map(|s| s.value(v)).sum::<f64>();
                    // A Gaussian kernel acts on the absorption deficit. Zero padding
                    // then represents an unabsorbed continuum, rather than zero transmission.
                    z.re = if p.source_gaussians.is_some() {
                        (-optical_depth).exp_m1()
                    } else {
                        (-optical_depth).exp()
                    };
                }
                let fft = transmission_fft();
                fft.forward.process_with_scratch(a, scratch);
                for (v, k) in a.iter_mut().zip(source) {
                    *v *= k;
                }
                let len = a.len() as f64;
                fft.inverse.process_with_scratch(a, scratch);
                // MATLAB conv(source, exp(-absorber), 'same'), then pchip; /100 is the original 0.01 grid step.
                let continuum = if p.source_gaussians.is_some() { 1. } else { 0. };
                let grid: Vec<_> = (0..6001)
                    .map(|i| continuum + a[i + 3000].re / len / 100.)
                    .collect();
                let sampled: Vec<_> = if p.source_gaussians.is_some() {
                    // A Gaussian-convolved transmission is smooth. Six-point local
                    // interpolation avoids the O(h^3) off-grid error of PCHIP while
                    // retaining the original MATLAB interpolation for legacy sources.
                    xs.iter().map(|&v| smooth_grid_sample(&grid, v)).collect()
                } else {
                    let slopes = pchip_slopes(&grid, 0.01);
                    xs.iter().map(|&v| pchip(&grid, &slopes, v)).collect()
                };
                // MossA.m src_calib_model normalizes AFTER interpolation at the
                // observed velocities. Ordinary transmission fitting does not.
                let norm = if self.source_calibration {
                    sampled.iter().copied().fold(f64::NEG_INFINITY, f64::max)
                } else {
                    1.
                };
                sampled
                    .iter()
                    .zip(&background)
                    .map(|(&v, &b)| p.background[0].value * v / norm + b - p.background[0].value)
                    .collect()
            })
        } else {
            (0..xs.len())
                .map(|i| {
                    background[i]
                        - if display_components {
                            components.iter().map(|c| c[i]).sum::<f64>()
                        } else {
                            site_curves.iter().map(|s| s.value(xs[i])).sum::<f64>()
                        }
                })
                .collect()
        };
        (y, background, components)
    }
    fn residuals(&self, x: &[f64]) -> Vec<f64> {
        let (y, _, _) = self.model_curves(x, false);
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
    fn solver_scale(&self) -> f64 {
        // Count rates can differ by orders of magnitude. A CONSTANT rescaling
        // leaves this unweighted least-squares minimum unchanged, while making
        // the solver's absolute gradient tolerance meaningful for calibration.
        // Reported objectives and covariance still use original count units.
        if self.source_calibration {
            self.project.spectrum.y.iter().copied().fold(1., f64::max)
        } else {
            1.
        }
    }
    fn derivative(&self, x: &[f64]) -> DMatrix<f64> {
        if let Some(exchange) = &self.external_derivatives {
            if let Some(j) = exchange.borrow().get(x) {
                return j.clone();
            }
        }
        let n = x.len();
        let m = self.project.spectrum.x.len();
        let mut j = DMatrix::zeros(m, n);
        for k in 0..n {
            if cancellation_requested() {
                break;
            }
            j.column_mut(k)
                .copy_from_slice(&self.derivative_column(x, k));
        }
        j
    }
    fn derivative_column(&self, x: &[f64], k: usize) -> Vec<f64> {
        let h = 6e-6 * x[k].abs().max(1.);
        let mut a = x.to_vec();
        let mut b = x.to_vec();
        a[k] = (x[k] + h).min(self.upper[k]);
        b[k] = (x[k] - h).max(self.lower[k]);
        let d = a[k] - b[k];
        let ra = self.residuals(&a);
        let rb = self.residuals(&b);
        ra.iter().zip(rb).map(|(a, b)| (a - b) / d).collect()
    }
}
fn source_transform(p: &Project) -> Vec<Complex<f64>> {
    let mut a = vec![Complex::default(); TRANSMISSION_FFT_LEN];
    if let Some(gs) = &p.source_gaussians {
        let weight: f64 = gs.iter().map(|g| g.weight).sum();
        let center: f64 = gs.iter().map(|g| g.weight * g.center).sum::<f64>() / weight;
        for (i, z) in a.iter_mut().take(6001).enumerate() {
            let v = -30. + i as f64 * 0.01;
            z.re = gs
                .iter()
                .map(|g| {
                    let w = g.fwhm;
                    (g.weight / weight) * (4. * 2_f64.ln() / PI).sqrt() / w
                        * (-4. * 2_f64.ln() * ((v - g.center + center) / w).powi(2)).exp()
                })
                .sum();
        }
        let area = a.iter().map(|z| z.re).sum::<f64>() * 0.01;
        for z in &mut a {
            z.re /= area;
        }
        TRANSMISSION_WORKSPACE.with(|workspace| {
            transmission_fft()
                .forward
                .process_with_scratch(&mut a, &mut workspace.borrow_mut().scratch)
        });
        return a;
    }
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
    TRANSMISSION_WORKSPACE.with(|workspace| {
        transmission_fft()
            .forward
            .process_with_scratch(&mut a, &mut workspace.borrow_mut().scratch)
    });
    a
}
fn smooth_grid_sample(y: &[f64], x: f64) -> f64 {
    let u = ((x + 30.) / 0.01).clamp(0., (y.len() - 1) as f64);
    let start = (u.floor() as usize).saturating_sub(2).min(y.len() - 6);
    let t = u - start as f64;
    (0..6)
        .map(|j| {
            let weight = (0..6)
                .filter(|&k| k != j)
                .fold(1., |w, k| w * (t - k as f64) / (j as f64 - k as f64));
            y[start + j] * weight
        })
        .sum()
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
        check_cancellation()?;
        let scale = self.solver_scale();
        Ok(0.5
            * self
                .residuals(x)
                .iter()
                .map(|r| (r / scale).powi(2))
                .sum::<f64>())
    }
}
impl Residual for Prepared {
    type Param = Vec<f64>;
    type Output = Vec<f64>;
    type Error = String;
    fn residual(&self, x: &Vec<f64>) -> Result<Vec<f64>, String> {
        check_cancellation()?;
        let scale = self.solver_scale();
        let r: Vec<_> = self.residuals(x).iter().map(|r| r / scale).collect();
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
        check_cancellation()?;
        if self.external_derivatives.is_some() {
            parallel::request_derivatives(self, x)?;
        }
        let j = self.derivative(x);
        check_cancellation()?;
        if j.iter().any(|v| !v.is_finite()) {
            return Err(
                "Non-finite numerical derivative; check parameter scales and bounds.".into(),
            );
        }
        let scale = self.solver_scale();
        Ok(DenseMatrix::from_fn(j.nrows(), j.ncols(), |r, c| {
            j[(r, c)] / scale
        }))
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
    // Use the curve already evaluated above, rather than convolving it again.
    let objective = residual
        .iter()
        .zip(&m.project.spectrum.y)
        .map(|(&r, &observed)| {
            let r = -r
                / if m.project.weighting == "counts" {
                    observed.sqrt()
                } else {
                    1.
                };
            r * r
        })
        .sum();
    let expanded = m.expand(x);
    let mut parameters: BTreeMap<String, f64> = m
        .entries
        .iter()
        .map(|e| {
            let value = e.value(&expanded);
            (e.id.clone(), value)
        })
        .collect();
    for (i, s) in expanded.sites.iter().enumerate() {
        if s.xvbf.is_some() {
            for k in ["cs", "qs"] {
                parameters.insert(format!("site:{i}:{k}"), s.params[k].value);
            }
        }
    }
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
    fit_prepared(m, callback)
}
fn derived_error(
    m: &Prepared,
    x: &[f64],
    covariance: Option<&DMatrix<f64>>,
    active: &[bool],
    value: impl Fn(&Project) -> f64,
) -> Option<f64> {
    let mut gradient = DVector::zeros(x.len());
    for k in 0..x.len() {
        let h = 6e-6 * x[k].abs().max(1.);
        let mut a = x.to_vec();
        let mut b = x.to_vec();
        a[k] = (x[k] + h).min(m.upper[k]);
        b[k] = (x[k] - h).max(m.lower[k]);
        gradient[k] = (value(&m.expand(&a)) - value(&m.expand(&b))) / (a[k] - b[k]);
    }
    if gradient.iter().all(|g| g.abs() < 1e-10) {
        return Some(0.);
    }
    if gradient
        .iter()
        .enumerate()
        .any(|(k, g)| active.get(k).copied().unwrap_or(false) && g.abs() > 1e-10)
    {
        return None;
    }
    covariance.and_then(|c| {
        let v = gradient.dot(&(c * &gradient));
        v.is_finite().then(|| v.max(0.).sqrt())
    })
}
fn fit_prepared(
    m: Prepared,
    callback: Option<Box<dyn FnMut(FitProgress)>>,
) -> Result<FitResult, String> {
    fit_prepared_with_solver(m, callback, false)
}
fn fit_prepared_with_solver(
    m: Prepared,
    callback: Option<Box<dyn FnMut(FitProgress)>>,
    bounded_lm: bool,
) -> Result<FitResult, String> {
    let p = &m.project;
    let (x, iterations, converged, termination) = if m.free.is_empty() {
        (vec![], 0, true, "All parameters fixed".to_string())
    } else if bounded_lm {
        let solver = BoundedLevenbergMarquardt::new()
            .with_absolute_scaled_gradient_tolerance(1e-8)
            .with_relative_cost_change_tolerance(1e-10);
        let executor = Executor::from_start(m.clone(), solver, m.initial.clone())
            .max_iter(p.max_iterations as u64)
            .observe_with(
                ProgressObserver {
                    model: m.clone(),
                    callback,
                    started: Instant::now(),
                    last: None,
                },
                ObserverMode::Always,
            );
        #[cfg(not(target_arch = "wasm32"))]
        let executor = match native::cancellation() {
            Some(token) => executor.with_cancellation_token(token),
            None => executor,
        };
        let result = executor.run().map_err(|e| format!("Bounded LM: {e:?}"))?;
        (
            result.param().clone(),
            result.state.iter(),
            result.report.termination.is_converged(),
            format!("{:?}", result.report.code()),
        )
    } else {
        let solver = TrustRegionReflective::new()
            .with_absolute_scaled_gradient_tolerance(1e-8)
            .with_relative_cost_change_tolerance(1e-10);
        let executor = Executor::from_start(m.clone(), solver, m.initial.clone())
            .max_iter(p.max_iterations as u64)
            .observe_with(
                ProgressObserver {
                    model: m.clone(),
                    callback,
                    started: Instant::now(),
                    last: None,
                },
                ObserverMode::Always,
            );
        #[cfg(not(target_arch = "wasm32"))]
        let executor = match native::cancellation() {
            Some(token) => executor.with_cancellation_token(token),
            None => executor,
        };
        let result = executor.run().map_err(|e| format!("Solver: {e:?}"))?;
        (
            result.param().clone(),
            result.state.iter(),
            result.report.termination.is_converged(),
            format!("{:?}", result.report.code()),
        )
    };
    check_cancellation()?;
    finish_fit(&m, x, iterations, converged, termination)
}
fn finish_fit(
    m: &Prepared,
    x: Vec<f64>,
    iterations: u64,
    converged: bool,
    termination: String,
) -> Result<FitResult, String> {
    check_cancellation()?;
    let p = &m.project;
    let mut warnings = vec![];
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
    let mut stationarity = 0_f64;
    if !x.is_empty() {
        let j = m.derivative(&x);
        check_cancellation()?;
        let residuals = DVector::from_vec(m.residuals(&x));
        let residual_norm = residuals.norm();
        for k in 0..x.len() {
            let column = j.column(k);
            let gradient = column.dot(&residuals);
            if !gradient.is_finite() || !residual_norm.is_finite() || !column.norm().is_finite() {
                stationarity = f64::INFINITY;
                break;
            }
            let h = 1e-8 * x[k].abs().max(1.);
            let outward = ((x[k] - m.lower[k]).abs() < h && gradient >= 0.)
                || ((x[k] - m.upper[k]).abs() < h && gradient <= 0.);
            if !outward && residual_norm > 0. && column.norm() > 0. {
                stationarity = stationarity.max(gradient.abs() / (column.norm() * residual_norm));
            }
        }
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
    let mut errors: BTreeMap<String, Option<f64>> = m
        .entries
        .iter()
        .enumerate()
        .map(|(i, e)| {
            let (r, f) = m.roots[i];
            let error = if e.site.is_some() && e.key.ends_with(":weight") {
                derived_error(&m, &x, covariance.as_ref(), &active, |p| {
                    xvbf::parameter(&p.sites[e.site.unwrap()], &e.key).value
                })
            } else {
                root_errors[r].map(|s| s * f.abs())
            };
            (e.id.clone(), error)
        })
        .collect();
    for (i, site) in p.sites.iter().enumerate() {
        if site.xvbf.is_some() {
            for key in ["cs", "qs"] {
                errors.insert(
                    format!("site:{i}:{key}"),
                    derived_error(&m, &x, covariance.as_ref(), &active, |p| {
                        p.sites[i].params[key].value
                    }),
                );
            }
        }
    }
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
        stationarity: stationarity.is_finite().then_some(stationarity),
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

/// Alternative bounded local solver for stalled comparison fits. Model
/// expansion, physical bounds, links, objective, and diagnostics are identical.
#[wasm_bindgen]
pub fn fit_recovery_json(json: &str) -> Result<String, JsValue> {
    let p: Project = serde_json::from_str(json).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let m = Prepared::new(&p).map_err(|e| JsValue::from_str(&e))?;
    let result = fit_prepared_with_solver(m, None, true).map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&result).map_err(|e| JsValue::from_str(&e.to_string()))
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

/// MossA.m src_calib_model: variable source width, fixed absorber width,
/// sampled-maximum normalization, and a quadratic additive background.
#[wasm_bindgen]
pub fn evaluate_source_json(json: &str) -> Result<String, JsValue> {
    let p: Project = serde_json::from_str(json).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let m = Prepared::with_source_calibration(&p, true).map_err(|e| JsValue::from_str(&e))?;
    let v =
        finite_evaluation(evaluate_prepared(&m, &m.initial)).map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&v).map_err(|e| JsValue::from_str(&e.to_string()))
}
#[wasm_bindgen]
pub fn fit_source_json(json: &str) -> Result<String, JsValue> {
    let p: Project = serde_json::from_str(json).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let m = Prepared::with_source_calibration(&p, true).map_err(|e| JsValue::from_str(&e))?;
    let v = fit_prepared(m, None).map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&v).map_err(|e| JsValue::from_str(&e.to_string()))
}
#[wasm_bindgen]
pub fn fit_source_json_with_progress(
    json: &str,
    callback: js_sys::Function,
) -> Result<String, JsValue> {
    let p: Project = serde_json::from_str(json).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let m = Prepared::with_source_calibration(&p, true).map_err(|e| JsValue::from_str(&e))?;
    let notify = move |progress: FitProgress| {
        if let Ok(json) = serde_json::to_string(&progress) {
            let _ = callback.call1(&JsValue::NULL, &JsValue::from_str(&json));
        }
    };
    let v = fit_prepared(m, Some(Box::new(notify))).map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&v).map_err(|e| JsValue::from_str(&e.to_string()))
}
