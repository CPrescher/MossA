//! Bounded variable projection for thin spectra. All reported diagnostics use
//! the original full-coordinate model; only optimization coordinates shrink.
use super::*;

#[cfg(all(feature = "projection-profile", not(target_arch = "wasm32")))]
pub(crate) mod profile;

pub(super) const UNAVAILABLE: &str = "Variable projection unavailable:";
pub(super) fn unavailable(message: &str) -> String {
    format!("{UNAVAILABLE} {message}")
}

#[derive(Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Debug)]
#[serde(rename_all = "snake_case")]
pub enum ThinSolver {
    Joint,
    VariableProjection,
}

#[derive(Clone)]
pub(super) struct FitProblem {
    pub model: Prepared,
    pub projection: Option<Arc<Projection>>,
    pub continuation: Option<Arc<JointContinuation>>,
}
#[derive(Clone)]
pub(super) struct JointContinuation {
    full: Vec<f64>,
    completed: u64,
}

/// Switch optimization coordinates rather than discard a fully explored trial.
/// The fixed window/rate apply to all projected fits, never a spectrum identity.
#[derive(Clone, Default)]
pub(super) struct ProjectionProgress {
    points: std::collections::VecDeque<ProjectionProgressPoint>,
    travel: f64,
}
#[derive(Clone)]
struct ProjectionProgressPoint {
    cost: f64,
    full: Vec<f64>,
    travel: f64,
}
impl ProjectionProgress {
    pub fn should_continue_joint(
        &mut self,
        problem: &FitProblem,
        iteration: u64,
        cost: f64,
        x: &[f64],
    ) -> bool {
        if problem.projection.is_none() {
            return false;
        }
        // A diagnostic failure must not change the existing solver fallback.
        let Ok(full) = problem.full_point(x) else {
            self.points.clear();
            self.travel = 0.;
            return false;
        };
        self.observe(problem, iteration, cost, full)
    }
    fn observe(&mut self, problem: &FitProblem, iteration: u64, cost: f64, full: Vec<f64>) -> bool {
        const MIN_STEPS: u64 = 48;
        const WINDOW: usize = 16;
        const RELATIVE_PROGRESS: f64 = 0.002;
        const MIN_PROGRESS: f64 = 1e-4;
        if problem.projection.is_none() {
            return false;
        }
        let distance = |a: &[f64], b: &[f64]| {
            a.iter()
                .zip(b)
                .map(|(a, b)| (a - b).powi(2))
                .sum::<f64>()
                .sqrt()
        };
        if let Some(previous) = self.points.back() {
            self.travel += distance(&previous.full, &full);
        }
        self.points.push_back(ProjectionProgressPoint {
            cost,
            full,
            travel: self.travel,
        });
        if self.points.len() <= 2 * WINDOW {
            return false;
        }
        let before = self.points.pop_front().unwrap();
        let middle = self.points[WINDOW - 1].cost;
        if let Some(probe) = &problem.model.project.search_probe {
            let until_screen = probe
                .after_iterations
                .saturating_sub(problem.warm_iterations() + iteration);
            // Do not reset the solver immediately before an existing selective
            // screening point. If that screen passes, continuation remains open.
            if until_screen > 0 && until_screen < WINDOW as u64 {
                return false;
            }
        }
        let remaining = problem.max_iterations().saturating_sub(iteration as usize);
        let earlier_rate = (before.cost - middle) / before.cost.abs().max(1.);
        let recent_rate = (middle - cost) / middle.abs().max(1.);
        let current = self.points.back().unwrap();
        let path = current.travel - before.travel;
        let displacement = distance(&current.full, &before.full);
        iteration >= MIN_STEPS && remaining >= WINDOW && cost.is_finite() && before.cost.is_finite()
            && earlier_rate <= RELATIVE_PROGRESS && recent_rate <= RELATIVE_PROGRESS
            // Avoid late convergence and brief averaged plateaus. Intervene only
            // when most full-coordinate travel is lost to reversals, measured
            // using the original optimizer scales (including linear roots).
            && recent_rate >= MIN_PROGRESS && recent_rate >= 0.8 * earlier_rate
            && recent_rate <= 1.25 * earlier_rate
            && path.is_finite() && path > 0. && displacement <= 0.5 * path
    }
}
impl FitProblem {
    pub fn new(model: &Prepared, recovery: bool) -> Self {
        let projection = if !recovery
            && model.project.variable_projection_requested()
            && model.uses_analytical_derivatives()
        {
            Projection::new(model).map(Arc::new)
        } else {
            None
        };
        Self {
            model: model.clone(),
            projection,
            continuation: None,
        }
    }
    pub fn initial(&self) -> Vec<f64> {
        if let Some(c) = &self.continuation {
            return c.full.clone();
        }
        self.projection.as_ref().map_or_else(
            || self.model.starting_point().0,
            |p| p.nonlinear.iter().map(|&k| p.start[k]).collect(),
        )
    }
    pub fn warm_iterations(&self) -> u64 {
        self.continuation.as_ref().map_or_else(
            || self.projection.as_ref().map_or(0, |p| p.warm_iterations),
            |c| c.completed,
        )
    }
    pub fn max_iterations(&self) -> usize {
        self.model.project.max_iterations - self.warm_iterations() as usize
    }
    pub fn full_point(&self, x: &[f64]) -> Result<Vec<f64>, String> {
        self.projection.as_ref().map_or_else(
            || Ok(x.to_vec()),
            |p| Ok(p.point(&self.model, x)?.full.clone()),
        )
    }
    pub fn continue_joint(&self, x: &[f64], iteration: u64) -> Result<Self, String> {
        let full = self.full_point(x)?;
        let completed = self.warm_iterations() + iteration;
        debug_assert!(completed < self.model.project.max_iterations as u64);
        #[cfg(not(target_arch = "wasm32"))]
        native::derivatives::record_joint_continuation(completed);
        Ok(Self {
            model: self.model.clone(),
            projection: None,
            continuation: Some(Arc::new(JointContinuation { full, completed })),
        })
    }
    pub fn retain_continuation_incumbent(&self, mut state: FitState) -> FitState {
        if let Some(c) = &self.continuation {
            let objective = |x: &[f64]| {
                self.model
                    .residuals_shared(x, false)
                    .iter()
                    .map(|v| v * v)
                    .sum::<f64>()
            };
            let initial = objective(&c.full);
            let final_cost = objective(&state.x);
            if initial.is_finite() && (!final_cost.is_finite() || initial < final_cost) {
                state.x = c.full.clone();
                state.converged = false;
                state.termination = "JointContinuationRetained".into();
            }
        }
        state
    }
    pub fn lower(&self) -> &Vec<f64> {
        self.projection
            .as_ref()
            .map_or(&self.model.lower, |p| &p.lower)
    }
    pub fn upper(&self) -> &Vec<f64> {
        self.projection
            .as_ref()
            .map_or(&self.model.upper, |p| &p.upper)
    }
}
impl basin::Constraints for FitProblem {
    type Set = basin::ConstraintSet<basin::BoxBounds<Vec<f64>>>;
    fn constraints(&self) -> <Self::Set as basin::ConstraintDescription>::Borrowed<'_> {
        basin::ConstraintSet::new().with_bounds(basin::BoxBounds::new(
            Some(self.lower()),
            Some(self.upper()),
        ))
    }
}
impl CostFunction for FitProblem {
    type Param = Vec<f64>;
    type Output = f64;
    type Error = String;
    fn cost(&self, x: &Vec<f64>) -> Result<f64, String> {
        let r = self.residual(x)?;
        Ok(0.5 * r.iter().map(|v| v * v).sum::<f64>())
    }
}
impl Residual for FitProblem {
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
        match &self.projection {
            Some(p) => {
                out.clear();
                out.extend_from_slice(p.point(&self.model, x)?.residual.as_slice());
                Ok(())
            }
            None => self.model.residual_into(x, out),
        }
    }
}
impl Jacobian for FitProblem {
    type Jacobian = DenseMatrix;
    fn jacobian(&self, x: &Vec<f64>) -> Result<DenseMatrix, String> {
        let mut out = DenseMatrix::from_row_slice(0, 0, &[]);
        self.jacobian_into(x, &mut out)?;
        Ok(out)
    }
    fn jacobian_into(&self, x: &Vec<f64>, out: &mut DenseMatrix) -> Result<(), String> {
        let Some(p) = &self.projection else {
            return self.model.jacobian_into(x, out);
        };
        check_cancellation()?;
        #[cfg(all(feature = "projection-profile", not(target_arch = "wasm32")))]
        let profile_started = Instant::now();
        let point = p.point(&self.model, x)?;
        #[cfg(all(feature = "projection-profile", not(target_arch = "wasm32")))]
        profile::record(|s| {
            s.jacobians += 1;
            s.weak_jacobians += u64::from(point.weak_bound);
        });
        let fused = (!point.weak_bound)
            .then(|| {
                self.model.fused_projection_jacobian_planned(
                    &point.full,
                    &p.linear,
                    &p.nonlinear,
                    &point.residual,
                    &p.evaluation_plan,
                )
            })
            .flatten();
        let (mut j, correction, mut fallback) = if let Some((j, c)) = fused {
            (j, c, vec![false; p.nonlinear.len()])
        } else {
            let full = self.model.derivative(&point.full);
            let j = DMatrix::from_fn(full.nrows(), p.nonlinear.len(), |i, k| {
                full[(i, p.nonlinear[k])]
            });
            let (c, fallback) = self.model.projection_correction(
                &point.full,
                &p.linear,
                &p.nonlinear,
                &point.residual,
            );
            (j, c, fallback)
        };
        if let Some(f) = &point.factor {
            // Exact Golub-Pereyra derivative, including the residual-dependent
            // term often dropped by the Kaufman approximation.
            let tangent = f.q.transpose() * &j;
            let c = DMatrix::from_fn(f.order.len(), p.nonlinear.len(), |i, k| {
                let local = f.free[f.order[i]];
                correction[(local, k)] / point.norms[local]
            });
            let z =
                f.r.transpose()
                    .solve_lower_triangular(&c)
                    .ok_or_else(|| unavailable("singular projected derivative"))?;
            // Combine the two Q products for nontrivial smooth reduced models.
            // Small, weak-bound and nonsmooth models retain the established
            // subtraction order, including near-roundoff calibration fits.
            if p.nonlinear.len() >= 8 && !point.weak_bound && !fallback.iter().any(|&v| v) {
                j -= &f.q * (tangent + z);
            } else {
                j -= &f.q * tangent;
                j -= &f.q * z;
            }
        }
        if point.weak_bound {
            fallback.fill(true);
        }
        for (k, &numeric) in fallback.iter().enumerate() {
            if numeric {
                #[cfg(all(feature = "projection-profile", not(target_arch = "wasm32")))]
                profile::record(|s| s.numerical_columns += 1);
                let h = 6e-6 * x[k].abs().max(1.);
                let mut a = x.clone();
                let mut b = x.clone();
                a[k] = (x[k] + h).min(p.upper[k]);
                b[k] = (x[k] - h).max(p.lower[k]);
                let ra = p.point(&self.model, &a)?;
                let rb = p.point(&self.model, &b)?;
                for i in 0..j.nrows() {
                    j[(i, k)] = (ra.residual[i] - rb.residual[i]) / (a[k] - b[k]);
                }
            }
        }
        check_cancellation()?;
        if !j.iter().all(|v| v.is_finite()) {
            return Err(unavailable("non-finite projected derivative"));
        }
        #[cfg(all(feature = "projection-profile", not(target_arch = "wasm32")))]
        profile::record(|s| s.jacobian_ns += profile_started.elapsed().as_nanos() as u64);
        out.fill_from_fn(j.nrows(), j.ncols(), |i, k| j[(i, k)]);
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

pub(super) struct Projection {
    pub linear: Vec<usize>,
    pub nonlinear: Vec<usize>,
    start: Vec<f64>,
    warm_iterations: u64,
    lower: Vec<f64>,
    upper: Vec<f64>,
    cache: Mutex<Option<Arc<LinearPoint>>>,
    evaluation_plan: analytical::ProjectionPlan,
}
struct LinearPoint {
    theta: Vec<f64>,
    full: Vec<f64>,
    residual: DVector<f64>,
    norms: Vec<f64>,
    factor: Option<Factor>,
    weak_bound: bool,
}
struct Factor {
    q: DMatrix<f64>,
    r: DMatrix<f64>,
    order: Vec<usize>,
    free: Vec<usize>,
}
impl Factor {
    fn new(a: &DMatrix<f64>, norms: &[f64], free: Vec<usize>) -> Result<Self, String> {
        #[cfg(all(feature = "projection-profile", not(target_arch = "wasm32")))]
        let profile_started = Instant::now();
        let normalized = DMatrix::from_fn(a.nrows(), free.len(), |i, k| {
            a[(i, free[k])] / norms[free[k]]
        });
        let qr = normalized.col_piv_qr();
        let r = qr.r();
        let largest = r.diagonal().amax();
        if r.diagonal()
            .iter()
            .any(|v| !v.is_finite() || v.abs() <= 1e-11 * largest)
        {
            return Err(unavailable("rank-deficient linear basis"));
        }
        let mut order = nalgebra::DVector::from_iterator(free.len(), 0..free.len());
        qr.p().permute_rows(&mut order);
        let result = Self {
            q: qr.q(),
            r,
            order: order.as_slice().to_vec(),
            free,
        };
        #[cfg(all(feature = "projection-profile", not(target_arch = "wasm32")))]
        profile::record(|s| {
            s.qr_calls += 1;
            s.qr_ns += profile_started.elapsed().as_nanos() as u64;
        });
        Ok(result)
    }
    fn solve(&self, rhs: &DVector<f64>, norms: &[f64]) -> Result<Vec<f64>, String> {
        let b = self.q.transpose() * rhs;
        let z = self
            .r
            .solve_upper_triangular(&b)
            .ok_or_else(|| unavailable("singular linear solve"))?;
        let mut values = vec![0.; self.free.len()];
        for (i, &k) in self.order.iter().enumerate() {
            values[k] = z[i] / norms[self.free[k]];
        }
        Ok(values)
    }
}
impl Projection {
    fn new(m: &Prepared) -> Option<Self> {
        let linear: Vec<_> = m
            .free
            .iter()
            .enumerate()
            .filter_map(|(k, &root)| {
                m.entries
                    .iter()
                    .enumerate()
                    .filter(|(i, _)| m.roots[*i].0 == root && m.roots[*i].1 != 0.)
                    .all(|(_, e)| {
                        e.site.is_some() && e.key == "intensity"
                            || e.site.is_none() && e.key.parse::<usize>().is_ok()
                    })
                    .then_some(k)
            })
            .collect();
        if linear.is_empty() {
            return None;
        }
        let nonlinear: Vec<_> = (0..m.free.len()).filter(|k| !linear.contains(k)).collect();
        let mut start = m.starting_point().0;
        let mut warm_iterations = 0;
        // Crowded spectra can change basins if amplitudes are eliminated at a
        // coarse starting geometry. Preserve a short part of the joint path.
        if m.project.sites.len() >= 3 && nonlinear.len() >= 10 {
            const WARMUP: usize = 8;
            if m.project.max_iterations <= WARMUP {
                return None;
            }
            let mut seed = m.clone();
            seed.project.max_iterations = WARMUP;
            let joint = FitProblem {
                model: seed,
                projection: None,
                continuation: None,
            };
            let state = solve_problem(&joint, None, false).ok()?;
            if state.termination == "ExplorationPruned" {
                return None;
            }
            start = state.x;
            warm_iterations = state.iterations;
        }
        let evaluation_plan = analytical::ProjectionPlan::new(m, &linear, &nonlinear);
        let p = Self {
            evaluation_plan,
            lower: nonlinear.iter().map(|&k| m.lower[k]).collect(),
            upper: nonlinear.iter().map(|&k| m.upper[k]).collect(),
            linear,
            nonlinear,
            start: start.clone(),
            warm_iterations,
            cache: Mutex::new(None),
        };
        let theta = p.nonlinear.iter().map(|&k| start[k]).collect::<Vec<_>>();
        // Rank deficiency makes the coefficient minimizer non-unique. Preserve
        // the existing joint solver's null-space convention in that case.
        p.point(m, &theta).ok()?;
        Some(p)
    }
    fn point(&self, m: &Prepared, theta: &[f64]) -> Result<Arc<LinearPoint>, String> {
        check_cancellation()?;
        #[cfg(all(feature = "projection-profile", not(target_arch = "wasm32")))]
        profile::record(|s| s.point_calls += 1);
        if let Some(v) = self
            .cache
            .lock()
            .unwrap()
            .as_ref()
            .filter(|v| v.theta == theta)
        {
            return Ok(v.clone());
        }
        #[cfg(all(feature = "projection-profile", not(target_arch = "wasm32")))]
        let profile_started = Instant::now();
        let mut full = m.initial.clone();
        for (k, &index) in self.nonlinear.iter().enumerate() {
            full[index] = theta[k];
        }
        let (a, offset) = self.basis(m, &full)?;
        #[cfg(all(feature = "projection-profile", not(target_arch = "wasm32")))]
        profile::record(|s| s.basis_ns += profile_started.elapsed().as_nanos() as u64);
        let norms: Vec<_> = (0..a.ncols()).map(|k| a.column(k).norm()).collect();
        if norms.iter().any(|v| !v.is_finite() || *v == 0.) {
            return Err(unavailable("zero linear basis column"));
        }
        // Require a unique coefficient solution even when some bounds are active.
        let initial_factor = Factor::new(&a, &norms, (0..self.linear.len()).collect())?;
        let mut c: Vec<_> = self.linear.iter().map(|&k| m.initial[k]).collect();
        let lo: Vec<_> = self.linear.iter().map(|&k| m.lower[k]).collect();
        let hi: Vec<_> = self.linear.iter().map(|&k| m.upper[k]).collect();
        let mut active = vec![0_i8; c.len()];
        let mut factor = Some(initial_factor);
        let mut done = false;
        for _ in 0..(40 * c.len() + 40) {
            check_cancellation()?;
            #[cfg(all(feature = "projection-profile", not(target_arch = "wasm32")))]
            profile::record(|s| s.inner_iterations += 1);
            let free: Vec<_> = (0..c.len()).filter(|&k| active[k] == 0).collect();
            let f = if free.is_empty() {
                None
            } else if let Some(f) = factor.take().filter(|f| f.free == free) {
                Some(f)
            } else {
                Some(Factor::new(&a, &norms, free.clone())?)
            };
            let mut rhs = -&offset;
            for k in 0..c.len() {
                if active[k] != 0 {
                    rhs.axpy(-c[k], &a.column(k), 1.);
                }
            }
            let mut target = c.clone();
            if let Some(f) = &f {
                let solved = f.solve(&rhs, &norms)?;
                for (i, &k) in free.iter().enumerate() {
                    target[k] = solved[i];
                }
            }
            let mut alpha = 1_f64;
            let mut hit = None;
            for &k in &free {
                let d = target[k] - c[k];
                let bound = if target[k] < lo[k] {
                    Some((lo[k], -1))
                } else if target[k] > hi[k] {
                    Some((hi[k], 1))
                } else {
                    None
                };
                if let Some((b, sign)) = bound {
                    let step = ((b - c[k]) / d).clamp(0., 1.);
                    if step <= alpha {
                        alpha = step;
                        hit = Some((k, sign));
                    }
                }
            }
            for &k in &free {
                c[k] = (c[k] + alpha * (target[k] - c[k])).clamp(lo[k], hi[k]);
            }
            if let Some((k, sign)) = hit {
                c[k] = if sign < 0 { lo[k] } else { hi[k] };
                active[k] = sign;
                continue;
            }
            let residual = &a * DVector::from_column_slice(&c) + &offset;
            let norm = residual.norm().max(1.);
            let mut release = None;
            // Close to an exact spectrum, subtracting the count background
            // limits the meaningful KKT precision. Do not cycle bounds while
            // trying to resolve gradients below that forward roundoff floor.
            let data_scale =
                offset.norm() + norms.iter().zip(&c).map(|(a, c)| a * c.abs()).sum::<f64>();
            let mut largest = 1e-12_f64.max(64. * f64::EPSILON * data_scale / norm);
            for k in 0..c.len() {
                if active[k] != 0 {
                    let g = a.column(k).dot(&residual) / norms[k] / norm;
                    let violation = if active[k] < 0 { -g } else { g };
                    if violation > largest {
                        largest = violation;
                        release = Some(k);
                    }
                }
            }
            if let Some(k) = release {
                active[k] = 0;
                continue;
            }
            factor = f;
            done = true;
            break;
        }
        if !done {
            return Err(unavailable(
                "bounded linear solve did not satisfy KKT conditions",
            ));
        }
        for (k, &index) in self.linear.iter().enumerate() {
            full[index] = c[k].clamp(lo[k], hi[k]);
        }
        let residual = DVector::from_vec(m.residuals_shared(&full, false));
        if !residual.iter().all(|v| v.is_finite()) {
            return Err(unavailable("non-finite linear fit"));
        }
        // An unconstrained coefficient can land exactly on a bound without
        // entering the active set. Its zero multiplier is still a nonsmooth
        // switch: use the same bounded residual differences on either side.
        let bound_roundoff = 64.
            * f64::EPSILON
            * (offset.norm() + norms.iter().zip(&c).map(|(a, c)| a * c.abs()).sum::<f64>());
        let weak_bound = c.iter().enumerate().any(|(k, &value)| {
            let h = 1e-8 * value.abs().max(1.);
            let at_bound = (value - lo[k]).abs() <= h || (value - hi[k]).abs() <= h;
            at_bound
                && a.column(k).dot(&residual).abs() / norms[k]
                    < (1e-9 * residual.norm().max(1.)).max(bound_roundoff)
        });
        let point = Arc::new(LinearPoint {
            theta: theta.to_vec(),
            full,
            residual,
            norms,
            factor,
            weak_bound,
        });
        *self.cache.lock().unwrap() = Some(point.clone());
        #[cfg(all(feature = "projection-profile", not(target_arch = "wasm32")))]
        profile::record(|s| {
            s.point_evaluations += 1;
            s.point_ns += profile_started.elapsed().as_nanos() as u64;
        });
        Ok(point)
    }
    fn basis(&self, m: &Prepared, x: &[f64]) -> Result<(DMatrix<f64>, DVector<f64>), String> {
        let mut zero = x.to_vec();
        for &k in &self.linear {
            zero[k] = 0.;
        }
        let mut p = m.expand(&zero);
        let site_columns = &self.evaluation_plan.sites;
        let background = &self.evaluation_plan.background;
        for (site, column) in site_columns.iter().enumerate() {
            if column.is_some() {
                p.sites[site].params.get_mut("intensity").unwrap().value = 1.;
            }
        }
        let curves: Vec<_> = p
            .sites
            .iter()
            .map(|s| SiteCurve::new(s, m.magnetic_coefficients))
            .collect();
        let mut a = DMatrix::zeros(p.spectrum.x.len(), self.linear.len());
        let mut offset = DVector::zeros(p.spectrum.x.len());
        for (i, (&v, &y)) in p.spectrum.x.iter().zip(&p.spectrum.y).enumerate() {
            check_cancellation()?;
            let weight = m.evaluation_plan.weights[i];
            offset[i] = p.background.iter().rev().fold(0., |s, b| s * v + b.value) - y;
            for (degree, k, f) in background {
                a[(i, *k)] += m.evaluation_plan.powers[*degree as usize][i] * f / weight;
            }
            for (s, curve) in curves.iter().enumerate() {
                let value = curve.value(v);
                if let Some((k, f)) = site_columns[s] {
                    a[(i, k)] -= value * f / weight;
                } else {
                    offset[i] -= value;
                }
            }
            offset[i] /= weight;
        }
        Ok((a, offset))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn pivoted_qr_solves_rectangular_basis_in_original_column_order() {
        let a = DMatrix::from_row_slice(
            5,
            3,
            &[
                1., 0.1, 20., 1., -0.3, 10., 1., 0.5, -5., 1., -0.7, 1., 1., 0.9, 3.,
            ],
        );
        let norms: Vec<_> = (0..3).map(|k| a.column(k).norm()).collect();
        let f = Factor::new(&a, &norms, (0..3).collect()).unwrap();
        let expected = DVector::from_vec(vec![2., -3., 0.7]);
        let rhs = &a * &expected;
        let actual = DVector::from_vec(f.solve(&rhs, &norms).unwrap());
        assert!((&actual - &expected).norm() < 1e-12);
    }
    fn project() -> Project {
        let mut p: Project = serde_json::from_value(
            serde_json::from_str::<serde_json::Value>(include_str!(
                "../../tests/fixtures/transmission-performance.json"
            ))
            .unwrap()["cases"]
                .as_array()
                .unwrap()
                .iter()
                .find(|c| c["id"] == "thin-control")
                .unwrap()["project"]
                .clone(),
        )
        .unwrap();
        p.thin_solver = Some(ThinSolver::VariableProjection);
        p
    }
    #[test]
    fn reduced_analytic_jacobian_includes_residual_dependent_term() {
        let mut p = project();
        // Deliberately large structured residual: omitting the second term in
        // the exact reduced Jacobian is detectable far from a minimum.
        for (i, y) in p.spectrum.y.iter_mut().enumerate() {
            *y += 30. * (i as f64 * 0.17).sin();
        }
        let m = Prepared::new(&p).unwrap();
        let problem = FitProblem::new(&m, false);
        assert!(problem.projection.is_some());
        let x = problem.initial();
        let j = problem.jacobian(&x).unwrap();
        for k in 0..x.len() {
            let h = 2e-5 * x[k].abs().max(1.);
            let mut samples = Vec::new();
            for d in [-2., -1., 1., 2.] {
                let mut q = x.clone();
                q[k] += d * h;
                samples.push(problem.residual(&q).unwrap());
            }
            let error = (0..samples[0].len())
                .map(|i| {
                    let numeric = (samples[0][i] - 8. * samples[1][i] + 8. * samples[2][i]
                        - samples[3][i])
                        / (12. * h);
                    (numeric - j.get(i, k)).powi(2)
                })
                .sum::<f64>()
                .sqrt();
            let norm = (0..samples[0].len())
                .map(|i| j.get(i, k).powi(2))
                .sum::<f64>()
                .sqrt();
            assert!(error < 2e-6 * norm.max(1.), "column {k}: {error} / {norm}");
        }
    }

    #[test]
    fn fused_projection_products_match_five_point_tangents_with_large_residuals() {
        for weighting in ["unweighted", "counts"] {
            let mut p = project();
            p.weighting = weighting.into();
            let original = p.sites[0].clone();
            p.sites = [-1.5, 0.265, 1.5]
                .iter()
                .enumerate()
                .map(|(i, &center)| {
                    let mut site = original.clone();
                    site.params.get_mut("cs").unwrap().value = center;
                    site.params.get_mut("qs").unwrap().value = [0.8, 1.3, 2.2][i];
                    site.params.get_mut("fwhm").unwrap().value = [0.4, 0.322, 0.5][i];
                    site.params.get_mut("intensity").unwrap().value = [360., 720., 500.][i];
                    site
                })
                .collect();
            p.spectrum.y = evaluate(&p)
                .unwrap()
                .y
                .iter()
                .enumerate()
                .map(|(i, y)| y + 30. * (i as f64 * 0.17).sin())
                .collect();
            let m = Prepared::new(&p).unwrap();
            let problem = FitProblem::new(&m, false);
            let projection = problem.projection.as_ref().unwrap();
            let x = problem.initial();
            assert!(x.len() >= 8);
            let point = projection.point(&m, &x).unwrap();
            assert!(!point.weak_bound && point.factor.is_some());
            let (_, fallback) = m.projection_correction(
                &point.full,
                &projection.linear,
                &projection.nonlinear,
                &point.residual,
            );
            assert!(fallback.iter().all(|&v| !v));
            let j = problem.jacobian(&x).unwrap();
            for k in 0..x.len() {
                let h = 2e-5 * x[k].abs().max(1.);
                let samples: Vec<_> = [-2., -1., 1., 2.]
                    .iter()
                    .map(|&d| {
                        let mut q = x.clone();
                        q[k] += d * h;
                        problem.residual(&q).unwrap()
                    })
                    .collect();
                let error = (0..j.nrows())
                    .map(|i| {
                        let numeric = (samples[0][i] - 8. * samples[1][i] + 8. * samples[2][i]
                            - samples[3][i])
                            / (12. * h);
                        (numeric - j.get(i, k)).powi(2)
                    })
                    .sum::<f64>()
                    .sqrt();
                let norm = (0..j.nrows())
                    .map(|i| j.get(i, k).powi(2))
                    .sum::<f64>()
                    .sqrt();
                assert!(
                    error < 2e-6 * norm.max(1.),
                    "{weighting} column {k}: {error}/{norm}"
                );
            }
        }
    }
}

#[cfg(test)]
mod bounds_tests {
    use super::*;
    fn project() -> Project {
        let f: serde_json::Value = serde_json::from_str(include_str!(
            "../../tests/fixtures/transmission-performance.json"
        ))
        .unwrap();
        let mut p: Project = serde_json::from_value(
            f["cases"]
                .as_array()
                .unwrap()
                .iter()
                .find(|c| c["id"] == "thin-control")
                .unwrap()["project"]
                .clone(),
        )
        .unwrap();
        p.thin_solver = Some(ThinSolver::VariableProjection);
        p
    }
    #[test]
    fn bounded_linear_solution_satisfies_kkt_and_reduced_jacobian() {
        for counts in [false, true] {
            let mut p = project();
            p.weighting = if counts { "counts" } else { "unweighted" }.into();
            let intensity = p.sites[0].params.get_mut("intensity").unwrap();
            intensity.max = Some(intensity.value * 0.5);
            intensity.value *= 0.4;
            let m = Prepared::new(&p).unwrap();
            let problem = FitProblem::new(&m, false);
            let projection = problem.projection.as_ref().unwrap();
            let x = problem.initial();
            let point = projection.point(&m, &x).unwrap();
            let (a, _) = projection.basis(&m, &point.full).unwrap();
            for (local, &k) in projection.linear.iter().enumerate() {
                let g = a.column(local).dot(&point.residual);
                let c = point.full[k];
                let h = 1e-8 * c.abs().max(1.);
                if (c - m.lower[k]).abs() < h {
                    assert!(g >= -1e-7 * a.column(local).norm());
                } else if (c - m.upper[k]).abs() < h {
                    assert!(g <= 1e-7 * a.column(local).norm());
                } else {
                    assert!(g.abs() < 1e-7 * a.column(local).norm());
                }
            }
            let j = problem.jacobian(&x).unwrap();
            for k in 0..x.len() {
                let h = 1e-5 * x[k].abs().max(1.);
                let mut plus = x.clone();
                let mut minus = x.clone();
                plus[k] += h;
                minus[k] -= h;
                let ra = problem.residual(&plus).unwrap();
                let rb = problem.residual(&minus).unwrap();
                let error = (0..ra.len())
                    .map(|i| ((ra[i] - rb[i]) / (2. * h) - j.get(i, k)).powi(2))
                    .sum::<f64>()
                    .sqrt();
                let norm = (0..ra.len())
                    .map(|i| j.get(i, k).powi(2))
                    .sum::<f64>()
                    .sqrt();
                assert!(error <= 3e-6 * norm.max(1.), "{k}: {error}/{norm}");
            }
        }
    }
    #[test]
    fn zero_multiplier_at_coefficient_bound_uses_bounded_residual_tangents() {
        let mut p = project();
        for (i, y) in p.spectrum.y.iter_mut().enumerate() {
            let v = p.spectrum.x[i];
            *y = p.background.iter().rev().fold(0., |s, b| s * v + b.value);
        }
        let m = Prepared::new(&p).unwrap();
        let problem = FitProblem::new(&m, false);
        let projection = problem.projection.as_ref().unwrap();
        let x = problem.initial();
        let point = projection.point(&m, &x).unwrap();
        assert!(point.weak_bound);
        let j = problem.jacobian(&x).unwrap();
        for k in 0..x.len() {
            let h = 6e-6 * x[k].abs().max(1.);
            let mut plus = x.clone();
            let mut minus = x.clone();
            plus[k] = (x[k] + h).min(projection.upper[k]);
            minus[k] = (x[k] - h).max(projection.lower[k]);
            let a = problem.residual(&plus).unwrap();
            let b = problem.residual(&minus).unwrap();
            for i in 0..a.len() {
                assert_eq!(j.get(i, k), (a[i] - b[i]) / (plus[k] - minus[k]));
            }
        }
    }
    #[test]
    fn rank_deficient_basis_falls_back_without_changing_uncertainty_conventions() {
        let mut p = project();
        p.sites.push(p.sites[0].clone());
        for s in &mut p.sites {
            for (k, v) in &mut s.params {
                v.fit = k == "intensity";
            }
        }
        let m = Prepared::new(&p).unwrap();
        assert!(FitProblem::new(&m, false).projection.is_none());
        let actual = fit(&p).unwrap();
        p.thin_solver = Some(ThinSolver::Joint);
        let expected = fit(&p).unwrap();
        assert_eq!(actual.rank, expected.rank);
        assert_eq!(actual.errors, expected.errors);
    }
    #[test]
    fn coefficients_at_a_perfect_start_never_worsen_the_supplied_objective() {
        let mut p = project();
        p.spectrum.y = evaluate(&p).unwrap().y;
        let result = fit(&p).unwrap();
        assert_eq!(result.evaluation.objective, 0.);
    }
}

#[cfg(test)]
mod continuation_tests {
    use super::*;
    fn zigzag(i: u64) -> Vec<f64> {
        vec![i as f64 * 1e-4, (i % 2) as f64]
    }
    fn model() -> Prepared {
        let f: serde_json::Value = serde_json::from_str(include_str!(
            "../../tests/fixtures/transmission-performance.json"
        ))
        .unwrap();
        let mut p: Project = serde_json::from_value(
            f["cases"]
                .as_array()
                .unwrap()
                .iter()
                .find(|c| c["id"] == "thin-control")
                .unwrap()["project"]
                .clone(),
        )
        .unwrap();
        p.thin_solver = Some(ThinSolver::VariableProjection);
        Prepared::new(&p).unwrap()
    }
    #[test]
    fn progress_handoff_requires_history_slow_rate_and_remaining_budget() {
        let m = model();
        let p = FitProblem::new(&m, false);
        assert!(p.projection.is_some());
        let mut slow = ProjectionProgress::default();
        let mut fast = ProjectionProgress::default();
        for i in 1..=48 {
            assert_eq!(
                slow.observe(&p, i, 1000. * (1. - i as f64 * 1e-5), zigzag(i)),
                i == 48
            );
            assert!(!fast.observe(&p, i, 1000. * 0.99_f64.powi(i as i32), zigzag(i)));
        }
        let mut converging = ProjectionProgress::default();
        for i in 1..100 {
            assert!(!converging.observe(
                &p,
                i,
                1e6 + 1000. * 0.5_f64.powf(i as f64 / 4.),
                zigzag(i)
            ));
        }
        let mut flat = ProjectionProgress::default();
        for i in 1..100 {
            assert!(!flat.observe(&p, i, 1000., zigzag(i)));
        }
        let mut limited = p.clone();
        limited.model.project.max_iterations = 63;
        let mut tracker = ProjectionProgress::default();
        for i in 1..=63 {
            assert!(!tracker.observe(&limited, i, 1000. * (1. - i as f64 * 1e-5), zigzag(i)));
        }
        let mut screened = p.clone();
        screened.model.project.search_probe = Some(SearchProbe {
            after_iterations: 56,
            objective_ceiling: 1e9,
        });
        let mut tracker = ProjectionProgress::default();
        for i in 1..56 {
            assert!(!tracker.observe(&screened, i, 1000. * (1. - i as f64 * 1e-5), zigzag(i)));
        }
        assert!(tracker.observe(&screened, 56, 1000. * (1. - 56. * 1e-5), zigzag(56)));
        let joint = FitProblem {
            model: m,
            projection: None,
            continuation: None,
        };
        let mut tracker = ProjectionProgress::default();
        for i in 1..100 {
            assert!(!tracker.observe(&joint, i, 1000. * (1. - i as f64 * 1e-5), zigzag(i)));
        }
    }
    #[test]
    fn slow_but_directional_motion_and_late_convergence_keep_projection() {
        let m = model();
        let p = FitProblem::new(&m, false);
        let mut directional = ProjectionProgress::default();
        let mut converging = ProjectionProgress::default();
        for i in 1..200 {
            assert!(!directional.observe(
                &p,
                i,
                1000. * (1. - i as f64 * 1e-5),
                vec![i as f64 * 1e-4, i as f64 * 1e-3]
            ));
            assert!(!converging.observe(&p, i, 1000. * (1. - i as f64 * 1e-7), zigzag(i)));
            assert!(directional.points.len() <= 32);
            assert!(converging.points.len() <= 32);
        }
    }
    #[test]
    fn frozen_full_trajectories_continue_magnetite_but_preserve_all_mixture_starts() {
        let f: serde_json::Value = serde_json::from_str(include_str!(
            "../../tests/fixtures/variable-projection-continuation-trajectories.json"
        ))
        .unwrap();
        let slow: serde_json::Value = serde_json::from_str(include_str!(
            "../../tests/fixtures/variable-projection-slow-trial.json"
        ))
        .unwrap();
        let project: Project = serde_json::from_value(slow["project"].clone()).unwrap();
        let m = Prepared::new(&project).unwrap();
        let p = FitProblem::new(&m, false);
        assert_eq!(p.warm_iterations(), 8);
        let replay = |trace: &serde_json::Value| {
            let mut progress = ProjectionProgress::default();
            trace.as_array().unwrap().iter().find_map(|r| {
                let iteration = r["iteration"].as_u64().unwrap();
                let full: Vec<f64> = serde_json::from_value(r["full"].clone()).unwrap();
                progress
                    .observe(
                        &p,
                        iteration - p.warm_iterations(),
                        r["cost"].as_f64().unwrap(),
                        full,
                    )
                    .then_some(iteration)
            })
        };
        assert_eq!(replay(&f["magnetite"]), Some(88));
        assert_eq!(f["mixture"].as_array().unwrap().len(), 12);
        for trial in f["mixture"].as_array().unwrap() {
            assert_eq!(
                replay(&trial["trace"]),
                None,
                "mixture start {}",
                trial["start"]
            );
        }
    }
    #[test]
    fn continuation_keeps_original_scales_bounds_budget_and_incumbent() {
        let m = model();
        let p = FitProblem::new(&m, false);
        let q = p.initial();
        let full = p.full_point(&q).unwrap();
        let next = p.continue_joint(&q, 48).unwrap();
        assert!(next.projection.is_none());
        assert_eq!(next.initial(), full);
        assert_eq!(next.model.scale, m.scale);
        assert_eq!(next.lower(), &m.lower);
        assert_eq!(next.upper(), &m.upper);
        assert_eq!(next.max_iterations(), m.project.max_iterations - 48);
        assert_eq!(next.warm_iterations(), 48);
        let mut worse = full.clone();
        worse[0] += 1.;
        let state = next.retain_continuation_incumbent(FitState {
            x: worse,
            iterations: 53,
            converged: true,
            termination: "RelativeCostTolerance".into(),
            source_calibration: false,
        });
        assert_eq!(state.x, full);
        assert_eq!(state.iterations, 53);
        assert_eq!(state.termination, "JointContinuationRetained");
        assert!(!state.converged);
    }
    #[test]
    fn measured_slow_trial_continues_without_changing_minimum_rank_or_std() {
        let f: serde_json::Value = serde_json::from_str(include_str!(
            "../../tests/fixtures/variable-projection-slow-trial.json"
        ))
        .unwrap();
        let p: Project = serde_json::from_value(f["project"].clone()).unwrap();
        let expected: FitResult = serde_json::from_value(f["reference"].clone()).unwrap();
        let actual = fit(&p).unwrap();
        assert!(actual.iterations < 200, "{} iterations", actual.iterations);
        assert_eq!(actual.rank, expected.rank);
        assert_eq!(actual.dof, expected.dof);
        assert_eq!(actual.free_parameters, expected.free_parameters);
        assert!(
            (actual.evaluation.objective - expected.evaluation.objective).abs()
                <= 1e-8 * expected.evaluation.objective
        );
        for (k, s) in expected.errors {
            let t = actual.errors[&k];
            assert_eq!(s.is_some(), t.is_some());
            if let (Some(s), Some(t)) = (s, t) {
                assert!((s - t).abs() <= 1e-10 + 1e-4 * s, "{k}: {s} -> {t}");
            }
        }
    }
}
