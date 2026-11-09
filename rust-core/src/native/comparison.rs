//! Resident, session-scoped comparison transport. Search/recovery stay in JS.
use super::*;
use rayon::prelude::*;
use std::collections::HashMap;

#[derive(Default)]
pub struct Registry {
    models: HashMap<u32, Arc<ResidentModel>>,
    datasets: HashMap<u32, Arc<ResidentData>>,
}
struct ResidentModel {
    project: Project,
    prepared: Mutex<HashMap<bool, Arc<Prepared>>>,
}
struct ResidentData {
    y: Vec<f64>,
    counts: OnceLock<Arc<Vec<f64>>>,
    unit: OnceLock<Arc<Vec<f64>>>,
}
impl ResidentData {
    fn weights(&self, counts: bool) -> Arc<Vec<f64>> {
        if counts {
            self.counts
                .get_or_init(|| Arc::new(self.y.iter().map(|v| v.sqrt()).collect()))
                .clone()
        } else {
            self.unit
                .get_or_init(|| Arc::new(vec![1.; self.y.len()]))
                .clone()
        }
    }
}
impl ResidentModel {
    fn prepare(&self, p: &Project, data: &ResidentData) -> Result<Prepared, String> {
        let prototype = {
            let mut cache = self
                .prepared
                .lock()
                .map_err(|_| "Prepared comparison state unavailable")?;
            let real = p.derivative_method != Some(DerivativeMethod::Numerical);
            if let std::collections::hash_map::Entry::Vacant(e) = cache.entry(real) {
                e.insert(Arc::new(Prepared::new(p)?));
            }
            cache[&real].clone()
        };
        prototype.rebind_comparison(p, data.weights(p.weighting == "counts"))
    }
}
#[derive(Deserialize)]
pub struct Model {
    id: u32,
    project: Project,
}
#[derive(Deserialize)]
pub struct Dataset {
    id: u32,
    y: Vec<f64>,
}
#[derive(Deserialize)]
pub struct Request {
    #[serde(default)]
    reuse_preparation: bool,
    #[serde(default)]
    models: Vec<Model>,
    #[serde(default)]
    datasets: Vec<Dataset>,
    #[serde(default)]
    release: Vec<u32>,
    operations: Vec<Command>,
}
#[derive(Deserialize)]
pub struct Command {
    id: u32,
    model: u32,
    dataset: u32,
    operation: Operation,
    prefit: Option<Operation>,
    values: Vec<f64>,
    max_iterations: usize,
    derivative_method: Option<DerivativeMethod>,
    thin_solver: Option<ThinSolver>,
    #[serde(default)]
    search_defer_uncertainties: bool,
    search_probe: Option<SearchProbe>,
    state: Option<FitState>,
}
#[derive(Serialize)]
pub struct Response {
    models: Vec<Registered>,
    results: Vec<Packet>,
}
#[derive(Serialize)]
struct Registered {
    id: u32,
    project: Project,
}
#[derive(Serialize)]
struct Packet {
    id: u32,
    result: Option<Reply>,
    error: Option<String>,
}
#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
enum Reply {
    Valid,
    Prefitted {
        fit: Option<Box<Reply>>,
        error: Option<String>,
    },
    Trial {
        values: Vec<f64>,
        objective: f64,
        free_parameters: usize,
        state: FitState,
    },
    Complete {
        values: Vec<f64>,
        fit: CompactFit,
    },
}
#[derive(Serialize)]
struct CompactFit {
    evaluation: Evaluation,
    errors: BTreeMap<String, Option<f64>>,
    intensity_fractions: Vec<IntensityFraction>,
    iterations: u64,
    converged: bool,
    termination: String,
    free_parameters: usize,
    dof: usize,
    rank: usize,
    reduced_objective: f64,
    stationarity: Option<f64>,
    warnings: Vec<String>,
}
fn values(p: &Project) -> Vec<f64> {
    let mut v: Vec<_> = p.background.iter().map(|p| p.value).collect();
    for s in &p.sites {
        v.extend(s.params.values().map(|p| p.value));
        if let Some(x) = &s.xvbf {
            v.push(x.delta.value);
            for c in x.cs.iter().chain(x.qs.iter()) {
                v.extend([c.center.value, c.width.value, c.weight.value]);
            }
        }
    }
    v
}
fn set_values(p: &mut Project, values: &[f64]) -> Result<(), String> {
    let mut parameters: Vec<_> = p.background.iter_mut().collect();
    for s in &mut p.sites {
        parameters.extend(s.params.values_mut());
        if let Some(x) = &mut s.xvbf {
            parameters.push(&mut x.delta);
            for c in x.cs.iter_mut().chain(x.qs.iter_mut()) {
                parameters.extend([&mut c.center, &mut c.width, &mut c.weight]);
            }
        }
    }
    if parameters.len() != values.len() || values.iter().any(|v| !v.is_finite()) {
        return Err("Invalid comparison parameter values".into());
    }
    for (p, &v) in parameters.into_iter().zip(values) {
        p.value = v;
    }
    Ok(())
}
fn compact(output: Output) -> Reply {
    match output {
        Output::Evaluation(_) => Reply::Valid,
        Output::Trial(t) => Reply::Trial {
            values: values(&t.project),
            objective: t.evaluation.objective,
            free_parameters: t.free_parameters,
            state: t.finalization.state,
        },
        Output::Fit(f) => Reply::Complete {
            values: values(&f.project),
            fit: CompactFit {
                evaluation: f.evaluation,
                errors: f.errors,
                intensity_fractions: f.intensity_fractions,
                iterations: f.iterations,
                converged: f.converged,
                termination: f.termination,
                free_parameters: f.free_parameters,
                dof: f.dof,
                rank: f.rank,
                reduced_objective: f.reduced_objective,
                stationarity: f.stationarity,
                warnings: f.warnings,
            },
        },
    }
}
pub fn run(
    registry: &Mutex<Registry>,
    request: Request,
    token: CancellationToken,
) -> Result<Response, String> {
    if token.is_cancelled() {
        return Err("Calculation canceled.".into());
    }
    if request.operations.len() > 16
        || request.models.len() > 16
        || request.datasets.len() > 16
        || request.release.len() > 32
    {
        return Err("Comparison batch exceeds its resource limit".into());
    }
    let (registered, work) = {
        let mut r = registry
            .lock()
            .map_err(|_| "Comparison state unavailable")?;
        for id in request.release {
            if request.operations.iter().any(|o| o.dataset == id) {
                return Err("Cannot release an active comparison dataset".into());
            }
            r.datasets.remove(&id);
        }
        let mut registered = Vec::new();
        for m in request.models {
            if r.models.contains_key(&m.id)
                || r.models.len() >= 32
                || m.project.spectrum.x.len() > 20000
            {
                return Err("Invalid comparison model registration".into());
            }
            let mut p = m.project;
            p.spectrum.y.clear();
            registered.push(Registered {
                id: m.id,
                project: p.clone(),
            });
            r.models.insert(
                m.id,
                Arc::new(ResidentModel {
                    project: p,
                    prepared: Mutex::new(HashMap::new()),
                }),
            );
        }
        for d in request.datasets {
            if r.datasets.contains_key(&d.id)
                || r.datasets.len() >= 32
                || !(8..=20000).contains(&d.y.len())
                || d.y.iter().any(|v| !v.is_finite())
            {
                return Err("Invalid comparison spectrum registration".into());
            }
            r.datasets.insert(
                d.id,
                Arc::new(ResidentData {
                    y: d.y,
                    counts: OnceLock::new(),
                    unit: OnceLock::new(),
                }),
            );
        }
        let mut work = Vec::new();
        for op in request.operations {
            let model = r
                .models
                .get(&op.model)
                .cloned()
                .ok_or("Unknown comparison model")?;
            let data = r
                .datasets
                .get(&op.dataset)
                .cloned()
                .ok_or("Unknown comparison spectrum")?;
            if model.project.spectrum.x.len() != data.y.len() {
                return Err("Comparison spectrum length mismatch".into());
            }
            work.push((op, model, data));
        }
        (registered, work)
    };
    let results = work
        .into_par_iter()
        .map(|(op, model, data)| {
            let id = op.id;
            let result = (|| {
                if !matches!(
                    op.operation,
                    Operation::Evaluate
                        | Operation::Fit
                        | Operation::FitRecovery
                        | Operation::FinalizeFit
                ) {
                    return Err("Unsupported comparison operation".into());
                }
                let mut p = model.project.clone();
                p.spectrum.y = data.y.clone();
                set_values(&mut p, &op.values)?;
                p.max_iterations = op.max_iterations;
                p.derivative_method = op.derivative_method;
                p.thin_solver = op.thin_solver;
                p.search_defer_uncertainties = op.search_defer_uncertainties;
                p.search_probe = op.search_probe;
                if let Some(next) = op.prefit {
                    if !matches!(op.operation, Operation::Evaluate)
                        || !matches!(next, Operation::Fit | Operation::FitRecovery)
                    {
                        return Err("Invalid prefitted comparison operation".into());
                    }
                    execute(
                        &model,
                        &data,
                        &p,
                        Operation::Evaluate,
                        token.clone(),
                        None,
                        request.reuse_preparation,
                    )?;
                    let fitted = execute(
                        &model,
                        &data,
                        &p,
                        next,
                        token.clone(),
                        None,
                        request.reuse_preparation,
                    );
                    return Ok(match fitted {
                        Ok(c) => Reply::Prefitted {
                            fit: Some(Box::new(compact(c))),
                            error: None,
                        },
                        Err(error) => Reply::Prefitted {
                            fit: None,
                            error: Some(error),
                        },
                    });
                }
                execute(
                    &model,
                    &data,
                    &p,
                    op.operation,
                    token.clone(),
                    op.state,
                    request.reuse_preparation,
                )
                .map(compact)
            })();
            match result {
                Ok(result) => Packet {
                    id,
                    result: Some(result),
                    error: None,
                },
                Err(error) => Packet {
                    id,
                    result: None,
                    error: Some(error),
                },
            }
        })
        .collect();
    if token.is_cancelled() {
        return Err("Calculation canceled.".into());
    }
    Ok(Response {
        models: registered,
        results,
    })
}

fn execute(
    model: &ResidentModel,
    data: &ResidentData,
    p: &Project,
    op: Operation,
    token: CancellationToken,
    state: Option<FitState>,
    reuse: bool,
) -> Result<Output, String> {
    if !reuse {
        return compute_with_state(p, op, token, None, Some(1), state).map(|c| c.result);
    }
    let _scope = Scope::enter(token);
    let _execution = derivatives::ExecutionScope::enter(Some(1))?;
    check_cancellation()?;
    if state.is_some() && !matches!(op, Operation::FinalizeFit) {
        return Err("Unexpected fit finalization state.".into());
    }
    let m = model.prepare(p, data)?;
    let result = match op {
        Operation::Evaluate => {
            Output::Evaluation(finite_evaluation(evaluate_prepared(&m, &m.initial))?)
        }
        Operation::Fit => fit_rpc_prepared(m, None, false)?.into(),
        Operation::FitRecovery => fit_rpc_prepared(m, None, true)?.into(),
        Operation::FinalizeFit => {
            let s = state.ok_or("Missing fit finalization state.")?;
            if s.source_calibration {
                return Err("Unexpected comparison calibration state.".into());
            }
            validate_finalization(&m, &s)?;
            Output::Fit(finish_fit(
                &m,
                s.x,
                s.iterations,
                s.converged,
                s.termination,
            )?)
        }
        _ => return Err("Unsupported comparison operation".into()),
    };
    check_cancellation()?;
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reusable_models_refresh_data_scales_links_simplexes_and_fft_conventions_exactly() {
        let fixtures: serde_json::Value = serde_json::from_str(include_str!(
            "../../../tests/fixtures/transmission-performance.json"
        ))
        .unwrap();
        let mut projects: Vec<Project> = fixtures["cases"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|c| {
                [
                    "thin-control",
                    "singlet-lorentzian-source",
                    "mixed-absorber-profiles-counts",
                    "asymmetric-gaussian-source",
                    "linked-parameters",
                    "xvbf-transmission",
                ]
                .contains(&c["id"].as_str().unwrap())
            })
            .map(|c| serde_json::from_value(c["project"].clone()).unwrap())
            .collect();
        let mixed: serde_json::Value = serde_json::from_str(include_str!(
            "../../../tests/fixtures/solver-qr-mixed-distribution.json"
        ))
        .unwrap();
        projects.push(serde_json::from_value(mixed["project"].clone()).unwrap());
        for original in projects {
            let model = ResidentModel {
                project: original.clone(),
                prepared: Mutex::new(HashMap::new()),
            };
            for method in [None, Some(DerivativeMethod::Numerical)] {
                for step in 0..2 {
                    let mut p = original.clone();
                    p.derivative_method = method;
                    p.background[0].value += step as f64;
                    for s in &mut p.sites {
                        let area = s.params.get_mut("intensity").unwrap();
                        area.value *= 1. + 0.01 * step as f64;
                    }
                    for y in &mut p.spectrum.y {
                        *y += step as f64;
                    }
                    let data = ResidentData {
                        y: p.spectrum.y.clone(),
                        counts: OnceLock::new(),
                        unit: OnceLock::new(),
                    };
                    let cached = model.prepare(&p, &data).unwrap();
                    let fresh = Prepared::new(&p).unwrap();
                    assert_eq!(cached.initial, fresh.initial);
                    assert_eq!(cached.scale, fresh.scale);
                    assert_eq!(cached.lower, fresh.lower);
                    assert_eq!(cached.upper, fresh.upper);
                    assert_eq!(cached.free, fresh.free);
                    assert!(cached.transmission_snapshot.lock().unwrap().is_none());
                    assert_eq!(
                        serde_json::to_string(&evaluate_prepared(&cached, &cached.initial))
                            .unwrap(),
                        serde_json::to_string(&evaluate_prepared(&fresh, &fresh.initial)).unwrap()
                    );
                    assert_eq!(
                        cached
                            .derivative(&cached.initial)
                            .iter()
                            .map(|v| v.to_bits())
                            .collect::<Vec<_>>(),
                        fresh
                            .derivative(&fresh.initial)
                            .iter()
                            .map(|v| v.to_bits())
                            .collect::<Vec<_>>()
                    );
                    let second = model.prepare(&p, &data).unwrap();
                    assert!(Arc::ptr_eq(
                        &cached.evaluation_plan.powers,
                        &second.evaluation_plan.powers
                    ));
                    assert!(Arc::ptr_eq(
                        &cached.evaluation_plan.weights,
                        &second.evaluation_plan.weights
                    ));
                    if let (Some(a), Some(b)) = (&cached.source_fft, &second.source_fft) {
                        assert!(Arc::ptr_eq(a, b));
                    }
                }
            }
            assert_eq!(model.prepared.lock().unwrap().len(), 2);
        }
    }
    fn project() -> Project {
        let v: serde_json::Value = serde_json::from_str(include_str!(
            "../../../tests/fixtures/ftest-boundary-replays.json"
        ))
        .unwrap();
        serde_json::from_value(v["cases"][0]["larger"].clone()).unwrap()
    }
    fn command(p: &Project, operation: Operation, state: Option<FitState>) -> Command {
        Command {
            id: 1,
            model: 1,
            dataset: 1,
            operation,
            prefit: None,
            values: values(p),
            max_iterations: p.max_iterations,
            derivative_method: p.derivative_method,
            thin_solver: p.thin_solver,
            search_defer_uncertainties: p.search_defer_uncertainties,
            search_probe: None,
            state,
        }
    }
    #[test]
    fn compact_trials_and_finalization_retain_complete_numerical_outputs() {
        let mut p = project();
        p.thin_solver = Some(ThinSolver::Joint);
        p.search_defer_uncertainties = true;
        let original =
            compute_with_options(&p, Operation::Fit, CancellationToken::new(), None, Some(1))
                .unwrap();
        let Output::Trial(original) = original.result else {
            panic!("expected deferred trial")
        };
        let registry = Mutex::new(Registry::default());
        let r = run(
            &registry,
            Request {
                reuse_preparation: false,
                models: vec![Model {
                    id: 1,
                    project: p.clone(),
                }],
                datasets: vec![Dataset {
                    id: 1,
                    y: p.spectrum.y.clone(),
                }],
                release: vec![],
                operations: vec![command(&p, Operation::Fit, None)],
            },
            CancellationToken::new(),
        )
        .unwrap();
        let Some(Reply::Trial {
            values: v,
            objective,
            state,
            ..
        }) = &r.results[0].result
        else {
            panic!("expected compact trial")
        };
        assert_eq!(v, &values(&original.project));
        assert_eq!(*objective, original.evaluation.objective);
        assert_eq!(
            serde_json::to_value(state).unwrap(),
            serde_json::to_value(&original.finalization.state).unwrap()
        );
        let r = run(
            &registry,
            Request {
                reuse_preparation: false,
                models: vec![],
                datasets: vec![],
                release: vec![],
                operations: vec![command(
                    &p,
                    Operation::FinalizeFit,
                    Some(original.finalization.state.clone()),
                )],
            },
            CancellationToken::new(),
        )
        .unwrap();
        let expected = finalize_fit(&p, original.finalization.state).unwrap();
        let mut expected_json = serde_json::to_value(&expected).unwrap();
        expected_json.as_object_mut().unwrap().remove("project");
        let Some(Reply::Complete { values: v, fit }) = &r.results[0].result else {
            panic!("expected complete result")
        };
        assert_eq!(v, &values(&expected.project));
        assert_eq!(serde_json::to_value(fit).unwrap(), expected_json);
    }
    #[test]
    fn invalid_references_release_and_cancellation_never_publish_results() {
        let p = project();
        let registry = Mutex::new(Registry::default());
        assert!(run(
            &registry,
            Request {
                reuse_preparation: false,
                models: vec![],
                datasets: vec![],
                release: vec![],
                operations: vec![command(&p, Operation::Fit, None)]
            },
            CancellationToken::new()
        )
        .is_err());
        let token = CancellationToken::new();
        token.cancel();
        assert!(run(
            &registry,
            Request {
                reuse_preparation: false,
                models: vec![],
                datasets: vec![],
                release: vec![],
                operations: vec![]
            },
            token
        )
        .err()
        .unwrap()
        .contains("canceled"));
        run(
            &registry,
            Request {
                reuse_preparation: false,
                models: vec![Model {
                    id: 1,
                    project: p.clone(),
                }],
                datasets: vec![Dataset {
                    id: 1,
                    y: p.spectrum.y.clone(),
                }],
                release: vec![],
                operations: vec![],
            },
            CancellationToken::new(),
        )
        .unwrap();
        assert!(run(
            &registry,
            Request {
                reuse_preparation: false,
                models: vec![],
                datasets: vec![],
                release: vec![1],
                operations: vec![command(&p, Operation::Fit, None)]
            },
            CancellationToken::new()
        )
        .is_err());
        run(
            &registry,
            Request {
                reuse_preparation: false,
                models: vec![],
                datasets: vec![],
                release: vec![1],
                operations: vec![],
            },
            CancellationToken::new(),
        )
        .unwrap();
        assert!(registry.lock().unwrap().datasets.is_empty());
    }
}
