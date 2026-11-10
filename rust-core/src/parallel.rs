//! Portable asynchronous derivative exchange. The synchronous Basin solver is
//! replayed from its exact pre-step checkpoint when a Jacobian is requested.
//! Only that unfinished step is retried; solver history/counters are restored.
//! Independent workers evaluate columns using the original scalar WASM model.
use super::*;
use basin::StepOutcome;

#[derive(Default)]
pub(super) struct DerivativeExchange {
    cache: Vec<(Vec<f64>, DMatrix<f64>)>,
    pub requested: Option<Vec<f64>>,
    callback: Option<js_sys::Function>,
}
impl DerivativeExchange {
    pub fn get(&self, x: &[f64]) -> Option<&DMatrix<f64>> {
        self.cache
            .iter()
            .find(|(key, _)| same_point(key, x))
            .map(|(_, matrix)| matrix)
    }
}

pub(super) fn request_derivatives(model: &Prepared, x: &[f64]) -> Result<(), String> {
    let exchange = model.external_derivatives.as_ref().unwrap();
    if exchange.borrow().get(x).is_some() {
        return Ok(());
    }
    let callback = exchange.borrow().callback.clone();
    if let Some(callback) = callback {
        let values = callback
            .call1(&JsValue::NULL, &js_sys::Float64Array::from(x))
            .map_err(|error| format!("Derivative worker callback failed: {error:?}"))?;
        let values = values
            .dyn_into::<js_sys::Float64Array>()
            .map_err(|_| "Expected typed derivative columns")?
            .to_vec();
        let rows = model.project.spectrum.x.len();
        if values.len() != rows * x.len() || values.iter().any(|v| !v.is_finite()) {
            return Err("Invalid derivative worker output".into());
        }
        let mut exchange = exchange.borrow_mut();
        exchange.cache.clear();
        exchange
            .cache
            .push((x.to_vec(), DMatrix::from_vec(rows, x.len(), values)));
        Ok(())
    } else {
        exchange.borrow_mut().requested = Some(x.to_vec());
        Err("External derivative columns requested".into())
    }
}

/// The same uninterrupted solver as the serial entry point. In an isolated
/// worker, JS dispatches columns and waits using Atomics while helpers compute.
#[wasm_bindgen]
pub fn fit_parallel_json(
    json: &str,
    calibration: bool,
    columns: js_sys::Function,
    progress: js_sys::Function,
) -> Result<String, JsValue> {
    let p = serde_json::from_str(json).map_err(js_error)?;
    let mut model = Prepared::with_source_calibration(&p, calibration).map_err(js_error)?;
    model.external_derivatives = Some(Rc::new(RefCell::new(DerivativeExchange {
        callback: Some(columns),
        ..Default::default()
    })));
    let notify = move |state: FitProgress| {
        if let Ok(json) = serde_json::to_string(&state) {
            let _ = progress.call1(&JsValue::NULL, &JsValue::from_str(&json));
        }
    };
    let result = fit_rpc_prepared(model, Some(Box::new(notify)), false).map_err(js_error)?;
    serde_json::to_string(&result).map_err(js_error)
}
fn same_point(a: &[f64], b: &[f64]) -> bool {
    a.len() == b.len() && a.iter().zip(b).all(|(a, b)| a.to_bits() == b.to_bits())
}
fn js_error(error: impl ToString) -> JsValue {
    JsValue::from_str(&error.to_string())
}

#[wasm_bindgen]
pub fn finalize_fit_with_columns_json(json: &str, columns: Vec<f64>) -> Result<String, JsValue> {
    let pending: FitFinalization = serde_json::from_str(json).map_err(js_error)?;
    let mut model = finalization_model(&pending.project, &pending.state).map_err(js_error)?;
    let rows = model.project.spectrum.x.len();
    let x = &pending.state.x;
    if columns.len() != rows * x.len() || columns.iter().any(|v| !v.is_finite()) {
        return Err(js_error("Invalid finalization derivative columns."));
    }
    model.external_derivatives = Some(Rc::new(RefCell::new(DerivativeExchange {
        cache: vec![(x.clone(), DMatrix::from_vec(rows, x.len(), columns))],
        ..Default::default()
    })));
    let state = pending.state;
    let result = finish_fit(
        &model,
        state.x,
        state.iterations,
        state.converged,
        state.termination,
    )
    .map_err(js_error)?;
    serde_json::to_string(&result).map_err(js_error)
}

#[wasm_bindgen]
pub struct DerivativeModel {
    model: Prepared,
}
#[wasm_bindgen]
impl DerivativeModel {
    #[wasm_bindgen(constructor)]
    pub fn new(json: &str, calibration: bool) -> Result<DerivativeModel, JsValue> {
        let p = serde_json::from_str(json).map_err(js_error)?;
        Ok(Self {
            model: Prepared::with_source_calibration(&p, calibration).map_err(js_error)?,
        })
    }
    pub fn columns(&self, x: Vec<f64>, first: usize, end: usize) -> Result<Vec<f64>, JsValue> {
        if x.len() != self.model.free.len()
            || first > end
            || end > x.len()
            || x.iter().enumerate().any(|(k, v)| {
                !v.is_finite() || *v < self.model.lower[k] || *v > self.model.upper[k]
            })
        {
            return Err(js_error("Invalid derivative coordinates or column range"));
        }
        Ok((first..end)
            .flat_map(|k| self.model.derivative_column(&x, k))
            .collect())
    }
}

enum Advance {
    Need,
    Boundary(Vec<f64>, u64, f64),
    End(Vec<f64>, u64, bool, String),
}

#[wasm_bindgen]
pub struct FitSession {
    model: Prepared,
    advance_solver: Box<dyn FnMut() -> Result<Advance, String>>,
    current: Option<(Vec<f64>, u64)>,
    started: Instant,
    completed: bool,
    projected_parameters: Rc<std::cell::Cell<usize>>,
    joint_continuations: Rc<std::cell::Cell<usize>>,
}
#[wasm_bindgen]
impl FitSession {
    #[wasm_bindgen(constructor)]
    pub fn new(json: &str, calibration: bool) -> Result<FitSession, JsValue> {
        let p = serde_json::from_str(json).map_err(js_error)?;
        let mut model = Prepared::with_source_calibration(&p, calibration).map_err(js_error)?;
        let exchange = Rc::new(RefCell::new(DerivativeExchange::default()));
        model.external_derivatives = Some(exchange.clone());
        let mut m = FitProblem::new(&model, false);
        let projected_parameters = Rc::new(std::cell::Cell::new(
            m.projection.as_ref().map_or(0, |p| p.linear.len()),
        ));
        let projected_count = projected_parameters.clone();
        let joint_continuations = Rc::new(std::cell::Cell::new(0));
        let continuation_count = joint_continuations.clone();
        let mut checkpoint = None;
        let mut progress = variable_projection::ProjectionProgress::default();
        let advance_solver = Box::new(move || loop {
            if m.model.free.is_empty() {
                return Ok(Advance::End(vec![], 0, true, "All parameters fixed".into()));
            }
            if m.initial().is_empty() {
                return Ok(Advance::End(
                    m.full_point(&[])?,
                    0,
                    true,
                    "LinearLeastSquares".into(),
                ));
            }
            let solver = TrustRegionReflective::new()
                .with_qr_compression(m.model.uses_qr_compression())
                .with_evaluation_buffers()
                .with_absolute_scaled_gradient_tolerance(1e-8)
                .with_relative_cost_change_tolerance(1e-10);
            let initializing = checkpoint.is_none();
            let executor = if let Some(saved) = checkpoint.clone() {
                Executor::resume_from_checkpoint(m.clone(), saved)
            } else {
                Executor::from_start(m.clone(), solver, m.initial())
            };
            let attempt = executor.max_iter(m.max_iterations() as u64).into_stepper();
            let mut stepper = match attempt {
                Ok(stepper) => stepper,
                Err(error) => {
                    if m.projection.is_some()
                        && format!("{error:?}").contains(variable_projection::UNAVAILABLE)
                    {
                        m.projection = None;
                        projected_count.set(0);
                        checkpoint = None;
                        continue;
                    }
                    return if exchange.borrow().requested.is_some() {
                        Ok(Advance::Need)
                    } else {
                        Err(format!("Solver: {error:?}"))
                    };
                }
            };
            if initializing {
                let boundary = Advance::Boundary(
                    m.full_point(stepper.state().param())?,
                    m.warm_iterations() + stepper.iter(),
                    stepper.state().cost(),
                );
                checkpoint = stepper.into_checkpoint();
                return Ok(boundary);
            }
            return match stepper.step() {
                Ok(StepOutcome::Continue) => {
                    // Preserve selective pruning before changing optimization
                    // coordinates, and retain every trial for full exploration.
                    if !m.model.prune_exploration(
                        m.warm_iterations() + stepper.iter(),
                        stepper.state().cost(),
                    ) && progress.should_continue_joint(
                        &m,
                        stepper.iter(),
                        stepper.state().cost(),
                        stepper.state().param(),
                    ) {
                        let full = m.full_point(stepper.state().param())?;
                        let iteration = m.warm_iterations() + stepper.iter();
                        let cost = stepper.state().cost();
                        m = m.continue_joint(stepper.state().param(), stepper.iter())?;
                        continuation_count.set(continuation_count.get() + 1);
                        checkpoint = None;
                        return Ok(Advance::Boundary(full, iteration, cost));
                    }
                    let boundary = Advance::Boundary(
                        m.full_point(stepper.state().param())?,
                        m.warm_iterations() + stepper.iter(),
                        stepper.state().cost(),
                    );
                    checkpoint = stepper.into_checkpoint();
                    Ok(boundary)
                }
                Ok(StepOutcome::Stopped(report)) => {
                    let state = m.retain_continuation_incumbent(FitState {
                        x: m.full_point(stepper.state().param())?,
                        iterations: m.warm_iterations() + stepper.iter(),
                        converged: report.termination.is_converged(),
                        termination: format!("{:?}", report.code()),
                        source_calibration: m.model.source_calibration,
                    });
                    Ok(Advance::End(
                        state.x,
                        state.iterations,
                        state.converged,
                        state.termination,
                    ))
                }
                Err(error) => {
                    if m.projection.is_some()
                        && format!("{error:?}").contains(variable_projection::UNAVAILABLE)
                    {
                        m.projection = None;
                        projected_count.set(0);
                        checkpoint = None;
                        continue;
                    }
                    if exchange.borrow().requested.is_some() {
                        Ok(Advance::Need)
                    } else {
                        Err(format!("Solver: {error:?}"))
                    }
                }
            };
        });
        Ok(Self {
            model,
            advance_solver,
            current: None,
            started: Instant::now(),
            completed: false,
            projected_parameters,
            joint_continuations,
        })
    }
    #[wasm_bindgen(getter)]
    pub fn free_parameters(&self) -> usize {
        self.model.free.len()
    }
    #[wasm_bindgen(getter)]
    pub fn projected_parameters(&self) -> usize {
        self.projected_parameters.get()
    }
    #[wasm_bindgen(getter)]
    pub fn joint_continuations(&self) -> usize {
        self.joint_continuations.get()
    }

    pub fn advance(&mut self) -> Result<String, JsValue> {
        if self.completed {
            return Err(js_error("Fit session already completed"));
        }
        let state = match (self.advance_solver)().map_err(js_error)? {
            Advance::Need => {
                let exchange = self.model.external_derivatives.as_ref().unwrap().borrow();
                serde_json::json!({ "kind": "derivatives", "x": exchange.requested, "rows": self.model.project.spectrum.x.len(), "columns": self.model.free.len() })
            }
            Advance::Boundary(x, iteration, cost)
                if self.model.prune_exploration(iteration, cost) =>
            {
                let result = finish_local(
                    &self.model,
                    FitState {
                        x,
                        iterations: iteration,
                        converged: false,
                        termination: "ExplorationPruned".into(),
                        source_calibration: self.model.source_calibration,
                    },
                )
                .map_err(js_error)?;
                self.completed = true;
                serde_json::json!({ "kind": "done", "result": result })
            }
            Advance::Boundary(x, iteration, _) => {
                self.model
                    .external_derivatives
                    .as_ref()
                    .unwrap()
                    .borrow_mut()
                    .cache
                    .retain(|(key, _)| same_point(key, &x));
                self.current = Some((x, iteration));
                serde_json::json!({ "kind": "progress", "iteration": iteration })
            }
            Advance::End(x, iterations, converged, termination) => {
                let result = finish_local(
                    &self.model,
                    FitState {
                        x,
                        iterations,
                        converged,
                        termination,
                        source_calibration: self.model.source_calibration,
                    },
                )
                .map_err(js_error)?;
                self.completed = true;
                serde_json::json!({ "kind": "done", "result": result })
            }
        };
        serde_json::to_string(&state).map_err(js_error)
    }
    pub fn supply(&mut self, columns: Vec<f64>) -> Result<(), JsValue> {
        let mut exchange = self
            .model
            .external_derivatives
            .as_ref()
            .unwrap()
            .borrow_mut();
        if self.completed
            || exchange.requested.is_none()
            || columns.len() != self.model.free.len() * self.model.project.spectrum.x.len()
            || columns.iter().any(|v| !v.is_finite())
        {
            return Err(js_error("Invalid or unexpected derivative columns"));
        }
        let x = exchange.requested.take().unwrap();
        exchange.cache.push((
            x,
            DMatrix::from_vec(
                self.model.project.spectrum.x.len(),
                self.model.free.len(),
                columns,
            ),
        ));
        Ok(())
    }
    pub fn progress(&self) -> Result<String, JsValue> {
        let (x, iteration) = self
            .current
            .as_ref()
            .ok_or_else(|| js_error("No completed solver boundary"))?;
        let progress = FitProgress {
            iteration: *iteration,
            elapsed_ms: self.started.elapsed().as_secs_f64() * 1000.,
            project: self.model.expand(x),
            evaluation: finite_evaluation(evaluate_prepared(&self.model, x)).map_err(js_error)?,
        };
        serde_json::to_string(&progress).map_err(js_error)
    }
}
