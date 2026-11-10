//! Ported MossA line profiles and browser/native fitting API.
//! See reference/MossA and PORTING.md for provenance and intentional differences.
use basin::{
    BoundedLevenbergMarquardt, CostFunction, DenseMatrix, Executor, Jacobian, Observe,
    ObserverMode, Residual, State, StepOutcome, TrustRegionReflective,
};
use nalgebra::{DMatrix, DVector};
use realfft::{ComplexToReal, RealFftPlanner, RealToComplex};
use rustfft::{num_complex::Complex, Fft, FftPlanner};
use serde::{Deserialize, Serialize};
use std::rc::Rc;
use std::{
    cell::RefCell,
    collections::BTreeMap,
    f64::consts::PI,
    sync::{Arc, Mutex, OnceLock},
};
use wasm_bindgen::prelude::*;
use web_time::Instant;
mod analytical;
#[cfg(not(target_arch = "wasm32"))]
pub mod native;
#[cfg(target_arch = "wasm32")]
mod parallel;
mod variable_projection;
mod xvbf;
use variable_projection::FitProblem;
pub use variable_projection::ThinSolver;
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

struct RealTransmissionFft {
    forward: Arc<dyn RealToComplex<f64>>,
    inverse: Arc<dyn ComplexToReal<f64>>,
}
fn real_transmission_fft() -> &'static RealTransmissionFft {
    static FFT: OnceLock<RealTransmissionFft> = OnceLock::new();
    FFT.get_or_init(|| {
        let mut planner = RealFftPlanner::new();
        RealTransmissionFft {
            forward: planner.plan_fft_forward(TRANSMISSION_FFT_LEN),
            inverse: planner.plan_fft_inverse(TRANSMISSION_FFT_LEN),
        }
    })
}
struct TransmissionWorkspace {
    // The full complex path preserves the explicit numerical reference. Normal
    // analytical fitting uses real input and only N/2+1 Fourier coefficients.
    buffer: Vec<Complex<f64>>,
    scratch: Vec<Complex<f64>>,
    real: Vec<f64>,
    half: Vec<Complex<f64>>,
    real_scratch: Vec<Complex<f64>>,
}
impl TransmissionWorkspace {
    fn new() -> Self {
        let rfft = real_transmission_fft();
        Self {
            buffer: Vec::new(),
            scratch: Vec::new(),
            real: vec![0.; TRANSMISSION_FFT_LEN],
            half: rfft.forward.make_output_vec(),
            real_scratch: vec![
                Complex::default();
                rfft.forward
                    .get_scratch_len()
                    .max(rfft.inverse.get_scratch_len())
            ],
        }
    }
    fn forward_signal(&mut self, values: impl Iterator<Item = f64>, real: bool) {
        if real {
            self.real.fill(0.);
            for (out, v) in self.real.iter_mut().zip(values) {
                *out = v;
            }
            real_transmission_fft()
                .forward
                .process_with_scratch(&mut self.real, &mut self.half, &mut self.real_scratch)
                .expect("valid real FFT workspace");
        } else {
            // Allocate the legacy complex workspace only when it is requested.
            if self.buffer.is_empty() {
                let fft = transmission_fft();
                self.buffer.resize(TRANSMISSION_FFT_LEN, Complex::default());
                self.scratch.resize(
                    fft.forward
                        .get_inplace_scratch_len()
                        .max(fft.inverse.get_inplace_scratch_len()),
                    Complex::default(),
                );
            }
            self.buffer.fill(Complex::default());
            for (out, v) in self.buffer.iter_mut().zip(values) {
                out.re = v;
            }
            transmission_fft()
                .forward
                .process_with_scratch(&mut self.buffer, &mut self.scratch);
        }
    }
    fn spectrum(&self, real: bool) -> &[Complex<f64>] {
        if real {
            &self.half
        } else {
            &self.buffer
        }
    }
    fn spectrum_mut(&mut self, real: bool) -> &mut [Complex<f64>] {
        if real {
            &mut self.half
        } else {
            &mut self.buffer
        }
    }
    fn inverse_signal(&mut self, real: bool) -> &[f64] {
        if real {
            // DC/Nyquist of real signals are real, including products and sums.
            // Explicit zeros also guard against tiny imaginary FFT roundoff.
            self.half[0].im = 0.;
            self.half[TRANSMISSION_FFT_LEN / 2].im = 0.;
            real_transmission_fft()
                .inverse
                .process_with_scratch(&mut self.half, &mut self.real, &mut self.real_scratch)
                .expect("valid inverse real FFT workspace");
        } else {
            transmission_fft()
                .inverse
                .process_with_scratch(&mut self.buffer, &mut self.scratch);
            for (v, z) in self.real.iter_mut().zip(&self.buffer) {
                *v = z.re;
            }
        }
        &self.real
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
pub struct SearchProbe {
    pub after_iterations: u64,
    pub objective_ceiling: f64,
}
#[derive(Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Debug)]
#[serde(rename_all = "lowercase")]
pub enum DerivativeMethod {
    Numerical,
    Analytical,
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
    /// Exact ordinary-model derivatives by default; numerical remains an explicit override.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub derivative_method: Option<DerivativeMethod>,
    /// Bounded variable projection by default for thin models; joint is an explicit override.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thin_solver: Option<ThinSolver>,
    pub max_iterations: usize,
    /// Absent in existing projects: preserve the original MATLAB convention.
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "deserialize_nuclear_constants"
    )]
    pub nuclear_constants: Option<NuclearConstants>,
    /// Internal search control, consumed by a local fit and never saved in its
    /// output project. Promising starts continue with the same solver state.
    #[serde(default, skip_serializing)]
    pub search_probe: Option<SearchProbe>,
    /// Internal RPC control. Trial results have no uncertainty estimates and
    /// must pass through finalize_fit before they can be published or saved.
    #[serde(default, skip_serializing)]
    pub search_defer_uncertainties: bool,
}
impl Project {
    fn variable_projection_requested(&self) -> bool {
        self.mode == "thin" && self.thin_solver != Some(ThinSolver::Joint)
    }
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

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct FitState {
    pub x: Vec<f64>,
    pub iterations: u64,
    pub converged: bool,
    pub termination: String,
    pub source_calibration: bool,
}
#[derive(Serialize, Deserialize, Debug)]
pub struct FitFinalization {
    pub project: Project,
    pub state: FitState,
}
#[derive(Serialize, Debug)]
pub struct FitTrial {
    pub project: Project,
    pub evaluation: Evaluation,
    pub iterations: u64,
    pub converged: bool,
    pub termination: String,
    pub free_parameters: usize,
    pub finalization: FitFinalization,
}
#[derive(Serialize, Debug)]
#[serde(untagged)]
pub enum LocalFitResult {
    Complete(FitResult),
    Trial(FitTrial),
}

#[derive(Serialize, Deserialize, Debug)]
pub struct FitProgress {
    pub iteration: u64,
    pub elapsed_ms: f64,
    pub project: Project,
    pub evaluation: Evaluation,
}
struct ProgressObserver {
    problem: FitProblem,
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
        let Ok(full) = self.problem.full_point(state.param()) else {
            return;
        };
        if let Ok(evaluation) = finite_evaluation(evaluate_prepared(&self.problem.model, &full)) {
            self.callback.as_mut().unwrap()(FitProgress {
                iteration: self.problem.warm_iterations() + state.iter(),
                elapsed_ms: now.duration_since(self.started).as_secs_f64() * 1000.,
                project: self.problem.model.expand(&full),
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
    profile_with_shape(
        x,
        center,
        fwhm,
        intensity,
        ProfileShape::from_name(shape),
        mix,
    )
}
#[derive(Clone, Copy)]
enum ProfileShape {
    Lorentzian,
    Gaussian,
    PseudoVoigt,
    LorSquared,
}
impl ProfileShape {
    fn from_name(shape: &str) -> Self {
        match shape {
            "Gaussian" => Self::Gaussian,
            "PseudoVoigt" => Self::PseudoVoigt,
            "LorSquared" => Self::LorSquared,
            _ => Self::Lorentzian,
        }
    }
}
fn profile_with_shape(
    x: f64,
    center: f64,
    fwhm: f64,
    intensity: f64,
    shape: ProfileShape,
    mix: f64,
) -> f64 {
    let h = fwhm / 2.;
    let z = (x - center) / h;
    let lorentzian = || intensity / (PI * h * (1. + z * z));
    // Retain the literal constants in gauss_curve.m, including their rounding.
    let gaussian = || intensity * 0.8326 / (h * 1.7725) * (-(z * 0.8326).powi(2)).exp();
    match shape {
        ProfileShape::Gaussian => gaussian(),
        ProfileShape::PseudoVoigt => mix * lorentzian() + (1. - mix) * gaussian(),
        ProfileShape::LorSquared => intensity * 2. / (PI * h * (1. + z * z).powi(2)),
        ProfileShape::Lorentzian => lorentzian(),
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
    shape: ProfileShape,
    fwhm: f64,
    mix: f64,
    lines: [(f64, f64); 6],
    count: usize,
}
impl<'a> SiteCurve<'a> {
    fn new(site: &'a Site, coefficients: [f64; 3]) -> Self {
        let mut curve = Self {
            site,
            shape: ProfileShape::from_name(&site.profile),
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
                profile_with_shape(x, center, self.fwhm, area, self.shape, self.mix)
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
struct TransmissionSnapshot {
    x: Vec<f64>,
    depth: Vec<f64>,
    optical_jac: Option<Arc<analytical::AbsorberGrid>>,
    grid: Vec<f64>,
    sampled: Vec<f64>,
    source: Option<Vec<Complex<f64>>>,
    absorber_fft: Option<Vec<Complex<f64>>>,
}
#[derive(Clone)]
struct Prepared {
    project: Project,
    entries: Vec<Entry>,
    roots: Vec<(usize, f64)>,
    root_bounds: Vec<(f64, f64)>,
    free: Vec<usize>,
    scale: Vec<f64>,
    lower: Vec<f64>,
    upper: Vec<f64>,
    initial: Vec<f64>,
    evaluation_plan: Arc<analytical::EvaluationPlan>,
    // Precomputed source Fourier transform, shared by all model evaluations.
    source_fft: Option<Arc<Vec<Complex<f64>>>>,
    // Shared by solver clones; exact-coordinate keys prevent reuse across
    // perturbed residuals. Never held while evaluating a model or invoking FFTs.
    transmission_snapshot: Arc<Mutex<Option<Arc<TransmissionSnapshot>>>>,
    absorber_snapshot: Arc<Mutex<Option<(Vec<f64>, Arc<analytical::AbsorberGrid>)>>>,
    source_calibration: bool,
    magnetic_coefficients: [f64; 3],
    simplexes: Vec<xvbf::Simplex>,
    #[cfg(target_arch = "wasm32")]
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
    if p.search_probe.as_ref().is_some_and(|probe| {
        probe.after_iterations == 0
            || probe.after_iterations > 2000
            || !probe.objective_ceiling.is_finite()
            || probe.objective_ceiling < 0.
    }) {
        return Err("Invalid exploratory search control.".into());
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
        Self::build(p, source_calibration, None)
    }
    fn build(
        p: &Project,
        source_calibration: bool,
        reuse: Option<(&Self, Arc<Vec<f64>>)>,
    ) -> Result<Self, String> {
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
        let source_fft = if let Some((m, _)) = &reuse {
            m.source_fft.clone()
        } else if p.mode == "transmission" && !source_calibration {
            Some(Arc::new(source_transform(p)))
        } else {
            None
        };
        let evaluation_plan = Arc::new(if let Some((m, weights)) = reuse {
            analytical::EvaluationPlan::reusing(
                &entries,
                &roots,
                &free,
                &scale,
                &m.evaluation_plan,
                weights,
            )
        } else {
            analytical::EvaluationPlan::new(p, &entries, &roots, &free, &scale)
        });
        Ok(Self {
            evaluation_plan,
            project: p.clone(),
            entries,
            roots,
            root_bounds: bounds,
            free,
            scale,
            lower,
            upper,
            initial,
            source_fft,
            transmission_snapshot: Arc::new(Mutex::new(None)),
            absorber_snapshot: Arc::new(Mutex::new(None)),
            source_calibration,
            magnetic_coefficients,
            simplexes,
            #[cfg(target_arch = "wasm32")]
            external_derivatives: None,
        })
    }
    #[cfg(not(target_arch = "wasm32"))]
    fn rebind_comparison(&self, p: &Project, weights: Arc<Vec<f64>>) -> Result<Self, String> {
        // Simplex latent coordinates depend on the current weights. Rebuild
        // their transforms while still reusing invariant source/grid work.
        if !self.simplexes.is_empty() || self.source_calibration {
            return Self::build(p, self.source_calibration, Some((self, weights)));
        }
        valid(p)?;
        let mut m = Self {
            project: p.clone(),
            entries: self.entries.clone(),
            roots: self.roots.clone(),
            root_bounds: self.root_bounds.clone(),
            free: self.free.clone(),
            scale: Vec::with_capacity(self.scale.len()),
            lower: Vec::with_capacity(self.lower.len()),
            upper: Vec::with_capacity(self.upper.len()),
            initial: Vec::with_capacity(self.initial.len()),
            evaluation_plan: self.evaluation_plan.clone(),
            source_fft: self.source_fft.clone(),
            transmission_snapshot: Arc::new(Mutex::new(None)),
            absorber_snapshot: Arc::new(Mutex::new(None)),
            source_calibration: self.source_calibration,
            magnetic_coefficients: self.magnetic_coefficients,
            simplexes: vec![],
        };
        for e in &mut m.entries {
            e.param.value = e.value(p);
            if !e.param.value.is_finite() {
                return Err(format!(
                    "{}: values/bounds must be finite; use null for an open bound.",
                    e.id
                ));
            }
            if e.param.link.is_none() && (e.param.value < e.lower || e.param.value > e.upper) {
                return Err(format!("{}: incompatible bounds.", e.id));
            }
        }
        m.scale.clear();
        m.lower.clear();
        m.upper.clear();
        m.initial.clear();
        for (i, e) in m.entries.iter().enumerate() {
            if m.roots[i].0 != i {
                continue;
            }
            let (lo, hi) = m.root_bounds[i];
            if e.param.value < lo || e.param.value > hi {
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
                m.scale.push(s);
                m.lower.push(lo / s);
                m.upper.push(hi / s);
                m.initial.push(e.param.value / s);
            }
        }
        m.evaluation_plan = Arc::new(analytical::EvaluationPlan::reusing(
            &m.entries,
            &m.roots,
            &m.free,
            &m.scale,
            &self.evaluation_plan,
            weights,
        ));
        // Coordinate/observation-dependent forward and Jacobian caches belong
        // to this fit only. Never import a previous simulation's solver state.
        m.transmission_snapshot = Arc::new(Mutex::new(None));
        m.absorber_snapshot = Arc::new(Mutex::new(None));
        Ok(m)
    }
    fn expand(&self, x: &[f64]) -> Project {
        let mut values: Vec<_> = self.entries.iter().map(|e| e.param.value).collect();
        for (j, &i) in self.free.iter().enumerate() {
            values[i] = x[j] * self.scale[j];
        }
        let mut p = self.project.clone();
        p.search_probe = None;
        p.search_defer_uncertainties = false;
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
        self.model_curves_shared(x, display_components, true)
    }
    fn model_curves_shared(
        &self,
        x: &[f64],
        display_components: bool,
        share_derivatives: bool,
    ) -> (Vec<f64>, Vec<f64>, Vec<Vec<f64>>) {
        let p = self.expand(x);
        // Full tangent preparation pays off for the expensive distribution
        // profiles. Cheap ordinary profiles stay lazy, particularly at rejected
        // trust-region trials; their existing exact-coordinate grid is shared.
        let joint_enabled = share_derivatives
            && !display_components
            && !x.is_empty()
            && p.sites.iter().any(|s| s.xvbf.is_some());
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
        let y = if let Some(source) = changing_source.as_ref().or(self.source_fft.as_deref()) {
            TRANSMISSION_WORKSPACE.with(|workspace| {
                let mut workspace = workspace.borrow_mut();
                let real = source.len() == TRANSMISSION_FFT_LEN / 2 + 1;
                let cache = self.uses_analytical_derivatives();
                let joint = (cache && joint_enabled).then(|| {
                    Arc::new(self.absorber_grid(
                        &p,
                        x,
                        (0..6001).map(|i| -30. + i as f64 * 0.01),
                        6001,
                    ))
                });
                let mut depth = if cache {
                    Vec::with_capacity(6001)
                } else {
                    vec![]
                };
                workspace.forward_signal(
                    (0..6001).map(|i| {
                        let v = -30. + i as f64 * 0.01;
                        let optical_depth = joint.as_ref().map_or_else(
                            || site_curves.iter().map(|s| s.value(v)).sum::<f64>(),
                            |g| g.values.get(i).copied().unwrap_or(0.),
                        );
                        if cache {
                            depth.push(optical_depth);
                        }
                        // A Gaussian kernel acts on the absorption deficit. Zero padding
                        // then represents an unabsorbed continuum, rather than zero transmission.
                        if p.source_gaussians.is_some() {
                            (-optical_depth).exp_m1()
                        } else {
                            (-optical_depth).exp()
                        }
                    }),
                    real,
                );
                let absorber_fft =
                    (cache && self.source_calibration).then(|| workspace.spectrum(real).to_vec());
                for (v, k) in workspace.spectrum_mut(real).iter_mut().zip(source) {
                    *v *= k;
                }
                let len = TRANSMISSION_FFT_LEN as f64;
                let signal = workspace.inverse_signal(real);
                // MATLAB conv(source, exp(-absorber), 'same'), then pchip; /100 is the original 0.01 grid step.
                let continuum = if p.source_gaussians.is_some() { 1. } else { 0. };
                let grid: Vec<_> = (0..6001)
                    .map(|i| continuum + signal[i + 3000] / len / 100.)
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
                if cache {
                    *self.transmission_snapshot.lock().unwrap() =
                        Some(Arc::new(TransmissionSnapshot {
                            x: x.to_vec(),
                            depth,
                            optical_jac: joint,
                            grid: grid.clone(),
                            sampled: sampled.clone(),
                            source: self.source_calibration.then(|| source.clone()),
                            absorber_fft,
                        }));
                }
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
        } else if joint_enabled && self.uses_analytical_derivatives() {
            let grid = Arc::new(self.absorber_grid(&p, x, xs.iter().copied(), xs.len()));
            let y = background
                .iter()
                .zip(&grid.values)
                .map(|(b, v)| b - v)
                .collect();
            *self.absorber_snapshot.lock().unwrap() = Some((x.to_vec(), grid));
            y
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
        self.residuals_shared(x, true)
    }
    fn residuals_shared(&self, x: &[f64], share_derivatives: bool) -> Vec<f64> {
        let (y, _, _) = self.model_curves_shared(x, false, share_derivatives);
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
    fn prune_exploration(&self, iteration: u64, solver_cost: f64) -> bool {
        !self.source_calibration
            && self.project.search_probe.as_ref().is_some_and(|probe| {
                iteration == probe.after_iterations
                    && iteration < self.project.max_iterations as u64
                    && 2. * solver_cost * self.solver_scale().powi(2) > probe.objective_ceiling
            })
    }
    fn derivative(&self, x: &[f64]) -> DMatrix<f64> {
        if let Some(j) = self.analytical_derivative(x) {
            return j;
        }
        #[cfg(target_arch = "wasm32")]
        if let Some(exchange) = &self.external_derivatives {
            if let Some(j) = exchange.borrow().get(x) {
                return j.clone();
            }
        }
        #[cfg(not(target_arch = "wasm32"))]
        if let Some(j) = native::derivatives::columns(self, x) {
            return j;
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
        // Numerical safety columns need values only, never speculative tangents.
        let ra = self.residuals_shared(&a, false);
        let rb = self.residuals_shared(&b, false);
        ra.iter().zip(rb).map(|(a, b)| (a - b) / d).collect()
    }
}
fn source_transform(p: &Project) -> Vec<Complex<f64>> {
    let mut values = vec![0.; 6001];
    if let Some(gs) = &p.source_gaussians {
        let weight: f64 = gs.iter().map(|g| g.weight).sum();
        let center: f64 = gs.iter().map(|g| g.weight * g.center).sum::<f64>() / weight;
        for (i, z) in values.iter_mut().enumerate() {
            let v = -30. + i as f64 * 0.01;
            *z = gs
                .iter()
                .map(|g| {
                    let w = g.fwhm;
                    (g.weight / weight) * (4. * 2_f64.ln() / PI).sqrt() / w
                        * (-4. * 2_f64.ln() * ((v - g.center + center) / w).powi(2)).exp()
                })
                .sum();
        }
        // Retain the original padded summation order (trailing zeros matter at
        // the source-normalization roundoff floor).
        let area = values
            .iter()
            .copied()
            .chain(std::iter::repeat_n(0., TRANSMISSION_FFT_LEN - 6001))
            .sum::<f64>()
            * 0.01;
        for z in &mut values {
            *z /= area;
        }
    } else {
        for (i, z) in values.iter_mut().enumerate() {
            *z = profile(
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
    }
    let real = p.derivative_method != Some(DerivativeMethod::Numerical);
    TRANSMISSION_WORKSPACE.with(|workspace| {
        let mut workspace = workspace.borrow_mut();
        workspace.forward_signal(values.into_iter(), real);
        workspace.spectrum(real).to_vec()
    })
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
        let mut out = Vec::new();
        self.residual_into(x, &mut out)?;
        Ok(out)
    }
    fn residual_into(&self, x: &Vec<f64>, out: &mut Vec<f64>) -> Result<(), String> {
        check_cancellation()?;
        let scale = self.solver_scale();
        let (y, _, _) = self.model_curves_shared(x, false, true);
        out.clear();
        out.extend(y.iter().zip(&self.project.spectrum.y).map(|(a, b)| {
            // Preserve the original two divisions and their evaluation order.
            let r = (a - b)
                / if self.project.weighting == "counts" {
                    b.sqrt()
                } else {
                    1.
                };
            r / scale
        }));
        if out.iter().any(|v| !v.is_finite()) {
            Err("Non-finite model residual.".into())
        } else {
            Ok(())
        }
    }
}
impl Jacobian for Prepared {
    type Jacobian = DenseMatrix;
    fn jacobian(&self, x: &Vec<f64>) -> Result<DenseMatrix, String> {
        let mut out = DenseMatrix::from_row_slice(0, 0, &[]);
        self.jacobian_into(x, &mut out)?;
        Ok(out)
    }
    fn jacobian_into(&self, x: &Vec<f64>, out: &mut DenseMatrix) -> Result<(), String> {
        check_cancellation()?;
        #[cfg(target_arch = "wasm32")]
        if self.external_derivatives.is_some() && !self.uses_analytical_derivatives() {
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
        out.fill_from_fn(j.nrows(), j.ncols(), |r, c| j[(r, c)] / scale);
        Ok(())
    }
    fn residual_and_jacobian_into(
        &self,
        x: &Vec<f64>,
        r: &mut Vec<f64>,
        j: &mut DenseMatrix,
    ) -> Result<(), String> {
        self.residual_into(x, r)?;
        self.jacobian_into(x, j)
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
    let state = m.retain_starting_incumbent(solve_prepared(&m, callback, bounded_lm)?);
    finish_fit(
        &m,
        state.x,
        state.iterations,
        state.converged,
        state.termination,
    )
}
fn fit_rpc_prepared(
    m: Prepared,
    callback: Option<Box<dyn FnMut(FitProgress)>>,
    bounded_lm: bool,
) -> Result<LocalFitResult, String> {
    let state = solve_prepared(&m, callback, bounded_lm)?;
    finish_local(&m, state)
}
fn solve_prepared(
    m: &Prepared,
    callback: Option<Box<dyn FnMut(FitProgress)>>,
    bounded_lm: bool,
) -> Result<FitState, String> {
    let problem = FitProblem::new(m, bounded_lm);
    #[cfg(not(target_arch = "wasm32"))]
    if m.project.variable_projection_requested() {
        native::derivatives::record_projection(
            problem.projection.as_ref().map_or(0, |p| p.linear.len()),
            None,
        );
    }
    if problem.projection.is_none() {
        return solve_problem(&problem, callback, bounded_lm);
    }
    let callback = callback.map(|f| Rc::new(RefCell::new(f)));
    let notify = || {
        callback.as_ref().map(|f| {
            let f = f.clone();
            Box::new(move |state| f.borrow_mut()(state)) as Box<dyn FnMut(FitProgress)>
        })
    };
    match solve_problem(&problem, notify(), bounded_lm) {
        Err(error) if error.contains(variable_projection::UNAVAILABLE) => {
            check_cancellation()?;
            #[cfg(not(target_arch = "wasm32"))]
            native::derivatives::record_projection(0, Some(error.clone()));
            // A rank change or failed inner KKT solve must not publish an
            // approximate coefficient solution. Restart the original joint fit.
            solve_problem(
                &FitProblem {
                    model: m.clone(),
                    projection: None,
                    continuation: None,
                },
                notify(),
                bounded_lm,
            )
        }
        result => result,
    }
}
enum PhaseResult {
    Finished(FitState),
    JointContinuation(FitProblem),
}
fn solve_problem(
    problem: &FitProblem,
    callback: Option<Box<dyn FnMut(FitProgress)>>,
    bounded_lm: bool,
) -> Result<FitState, String> {
    let callback = callback.map(|f| Rc::new(RefCell::new(f)));
    let notify = || {
        callback.as_ref().map(|f| {
            let f = f.clone();
            Box::new(move |state| f.borrow_mut()(state)) as Box<dyn FnMut(FitProgress)>
        })
    };
    let started = Instant::now();
    let mut current = problem.clone();
    loop {
        match solve_problem_phase(&current, notify(), bounded_lm, started)? {
            PhaseResult::Finished(state) => return Ok(current.retain_continuation_incumbent(state)),
            PhaseResult::JointContinuation(next) => current = next,
        }
    }
}
fn solve_problem_phase(
    problem: &FitProblem,
    callback: Option<Box<dyn FnMut(FitProgress)>>,
    bounded_lm: bool,
    started: Instant,
) -> Result<PhaseResult, String> {
    let m = &problem.model;
    let (x, iterations, converged, termination) = if m.free.is_empty() {
        (vec![], 0, true, "All parameters fixed".to_string())
    } else if problem.initial().is_empty() {
        let full = problem.full_point(&[])?;
        if let Some(mut callback) = callback {
            callback(FitProgress {
                iteration: 0,
                elapsed_ms: 0.,
                project: m.expand(&full),
                evaluation: finite_evaluation(evaluate_prepared(m, &full))?,
            });
        }
        (vec![], 0, true, "LinearLeastSquares".to_string())
    } else if bounded_lm {
        let solver = BoundedLevenbergMarquardt::new()
            .with_absolute_scaled_gradient_tolerance(1e-8)
            .with_relative_cost_change_tolerance(1e-10);
        let executor = Executor::from_start(problem.clone(), solver, problem.initial())
            .max_iter(problem.max_iterations() as u64)
            .observe_with(
                ProgressObserver {
                    problem: problem.clone(),
                    callback,
                    started,
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
            .with_qr_compression(m.uses_qr_compression())
            .with_evaluation_buffers()
            .with_absolute_scaled_gradient_tolerance(1e-8)
            .with_relative_cost_change_tolerance(1e-10);
        let executor = Executor::from_start(problem.clone(), solver, problem.initial())
            .max_iter(problem.max_iterations() as u64)
            .observe_with(
                ProgressObserver {
                    problem: problem.clone(),
                    callback,
                    started,
                    last: None,
                },
                ObserverMode::Always,
            );
        #[cfg(not(target_arch = "wasm32"))]
        let executor = match native::cancellation() {
            Some(token) => executor.with_cancellation_token(token),
            None => executor,
        };
        // Executor::run uses this same stepper. A successful probe simply keeps
        // stepping: no new initialization, rescaling, or trust-region reset.
        let mut stepper = executor
            .into_stepper()
            .map_err(|e| format!("Solver: {e:?}"))?;
        let mut progress = variable_projection::ProjectionProgress::default();
        loop {
            check_cancellation()?;
            let outcome = stepper.step().map_err(|e| format!("Solver: {e:?}"))?;
            #[cfg(all(feature = "projection-profile", not(target_arch = "wasm32")))]
            if problem.projection.is_some() {
                let profile_full = problem
                    .full_point(stepper.state().param())
                    .unwrap_or_default();
                variable_projection::profile::record(|s| {
                    s.trace.push(variable_projection::profile::ProjectionTrace {
                        iteration: problem.warm_iterations() + stepper.iter(),
                        objective: 2. * stepper.state().cost(),
                        full: profile_full,
                    })
                });
            }
            match outcome {
                StepOutcome::Stopped(report) => {
                    break (
                        stepper.state().param().clone(),
                        stepper.iter(),
                        report.termination.is_converged(),
                        format!("{:?}", report.code()),
                    )
                }
                StepOutcome::Continue => {
                    if m.prune_exploration(
                        problem.warm_iterations() + stepper.iter(),
                        stepper.state().cost(),
                    ) {
                        break (
                            stepper.state().param().clone(),
                            stepper.iter(),
                            false,
                            "ExplorationPruned".into(),
                        );
                    }
                    if progress.should_continue_joint(
                        problem,
                        stepper.iter(),
                        stepper.state().cost(),
                        stepper.state().param(),
                    ) {
                        return Ok(PhaseResult::JointContinuation(
                            problem.continue_joint(stepper.state().param(), stepper.iter())?,
                        ));
                    }
                }
            }
        }
    };
    check_cancellation()?;
    Ok(PhaseResult::Finished(FitState {
        x: problem.full_point(&x)?,
        iterations: iterations + problem.warm_iterations(),
        converged,
        termination,
        source_calibration: m.source_calibration,
    }))
}
fn finish_local(m: &Prepared, state: FitState) -> Result<LocalFitResult, String> {
    let state = m.retain_starting_incumbent(state);
    if m.project.search_defer_uncertainties {
        check_cancellation()?;
        let evaluation = finite_evaluation(evaluate_prepared(m, &state.x))?;
        Ok(LocalFitResult::Trial(FitTrial {
            project: m.expand(&state.x),
            evaluation,
            iterations: state.iterations,
            converged: state.converged,
            termination: state.termination.clone(),
            free_parameters: state.x.len(),
            finalization: FitFinalization {
                project: m.project.clone(),
                state,
            },
        }))
    } else {
        Ok(LocalFitResult::Complete(finish_fit(
            m,
            state.x,
            state.iterations,
            state.converged,
            state.termination,
        )?))
    }
}
fn finalization_model(project: &Project, state: &FitState) -> Result<Prepared, String> {
    check_cancellation()?;
    let m = Prepared::with_source_calibration(project, state.source_calibration)?;
    validate_finalization(&m, state)?;
    Ok(m)
}
fn validate_finalization(m: &Prepared, state: &FitState) -> Result<(), String> {
    if state.x.len() != m.free.len()
        || state.iterations > m.project.max_iterations as u64
        || state.termination.is_empty()
        || state.termination.len() > 200
        || state
            .x
            .iter()
            .enumerate()
            .any(|(k, x)| !x.is_finite() || *x < m.lower[k] || *x > m.upper[k])
    {
        return Err("Invalid fit finalization state.".into());
    }
    Ok(())
}
pub fn finalize_fit(project: &Project, state: FitState) -> Result<FitResult, String> {
    // Rebuild from the ORIGINAL starting project, retaining its parameter
    // scales, root ordering and bounds; never restart from the fitted project.
    let m = finalization_model(project, &state)?;
    finish_fit(
        &m,
        state.x,
        state.iterations,
        state.converged,
        state.termination,
    )
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
    let (_, adjustments) = m.starting_point();
    if !adjustments.is_empty() {
        warnings.push(format!("Separated coincident starting components deterministically within their bounds by adjusting {}. Fixed parameters and links were retained.", adjustments.join(", ")));
    }
    if termination == "StartingModelRetained" {
        warnings.push(if p.variable_projection_requested() {
            "Retained the supplied model because fitting did not improve its objective; inspect the starting components or increase the iteration limit."
        } else {
            "Retained the supplied model because the separated fit did not improve its objective; inspect the starting components or increase the iteration limit."
        }.into());
    }
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
    let v = fit_rpc_prepared(
        Prepared::new(&p).map_err(|e| JsValue::from_str(&e))?,
        None,
        false,
    )
    .map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&v).map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Alternative bounded local solver for stalled comparison fits. Model
/// expansion, physical bounds, links, objective, and diagnostics are identical.
#[wasm_bindgen]
pub fn fit_recovery_json(json: &str) -> Result<String, JsValue> {
    let p: Project = serde_json::from_str(json).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let m = Prepared::new(&p).map_err(|e| JsValue::from_str(&e))?;
    let result = fit_rpc_prepared(m, None, true).map_err(|e| JsValue::from_str(&e))?;
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
    let result = fit_rpc_prepared(
        Prepared::new(&p).map_err(|e| JsValue::from_str(&e))?,
        Some(Box::new(notify)),
        false,
    )
    .map_err(|e| JsValue::from_str(&e))?;
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
    let v = fit_rpc_prepared(m, None, false).map_err(|e| JsValue::from_str(&e))?;
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
    let v =
        fit_rpc_prepared(m, Some(Box::new(notify)), false).map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&v).map_err(|e| JsValue::from_str(&e.to_string()))
}

#[wasm_bindgen]
pub fn finalize_fit_json(json: &str) -> Result<String, JsValue> {
    let pending: FitFinalization =
        serde_json::from_str(json).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let result =
        finalize_fit(&pending.project, pending.state).map_err(|e| JsValue::from_str(&e))?;
    serde_json::to_string(&result).map_err(|e| JsValue::from_str(&e.to_string()))
}

#[cfg(test)]
mod buffer_tests;
