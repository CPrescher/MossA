//! Native entry points. The mathematical model and solvers are shared with WASM.
use super::*;
pub use basin::CancellationToken;
use std::cell::RefCell;
pub mod comparison;
pub(crate) mod derivatives;
pub mod jobs;
pub use derivatives::Execution;

thread_local! { static CANCELLATION: RefCell<Option<CancellationToken>> = const { RefCell::new(None) }; }
pub(crate) fn cancellation() -> Option<CancellationToken> {
    CANCELLATION.with(|slot| slot.borrow().clone())
}
pub(crate) fn canceled() -> bool {
    CANCELLATION.with(|slot| {
        slot.borrow()
            .as_ref()
            .is_some_and(CancellationToken::is_cancelled)
    })
}
struct Scope(Option<CancellationToken>);
impl Scope {
    fn enter(token: CancellationToken) -> Self {
        Self(CANCELLATION.with(|slot| slot.replace(Some(token))))
    }
}
impl Drop for Scope {
    fn drop(&mut self) {
        CANCELLATION.with(|slot| slot.replace(self.0.take()));
    }
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Operation {
    Evaluate,
    Fit,
    EvaluateSource,
    FitSource,
    FitRecovery,
    FinalizeFit,
}
#[derive(Debug, Serialize)]
#[serde(untagged)]
pub enum Output {
    Evaluation(Evaluation),
    Fit(FitResult),
    Trial(FitTrial),
}
impl From<LocalFitResult> for Output {
    fn from(result: LocalFitResult) -> Self {
        match result {
            LocalFitResult::Complete(fit) => Self::Fit(fit),
            LocalFitResult::Trial(trial) => Self::Trial(trial),
        }
    }
}

pub fn compute(
    project: &Project,
    operation: Operation,
    token: CancellationToken,
    progress: Option<Box<dyn FnMut(FitProgress)>>,
) -> Result<Output, String> {
    Ok(compute_with_options(project, operation, token, progress, None)?.result)
}

pub struct Computation {
    pub result: Output,
    pub execution: Execution,
}
pub fn compute_with_options(
    project: &Project,
    operation: Operation,
    token: CancellationToken,
    progress: Option<Box<dyn FnMut(FitProgress)>>,
    derivative_workers: Option<usize>,
) -> Result<Computation, String> {
    compute_with_state(
        project,
        operation,
        token,
        progress,
        derivative_workers,
        None,
    )
}
pub fn compute_with_state(
    project: &Project,
    operation: Operation,
    token: CancellationToken,
    progress: Option<Box<dyn FnMut(FitProgress)>>,
    derivative_workers: Option<usize>,
    state: Option<FitState>,
) -> Result<Computation, String> {
    let _scope = Scope::enter(token);
    let execution = derivatives::ExecutionScope::enter(derivative_workers)?;
    check_cancellation()?;
    if state.is_some() && !matches!(operation, Operation::FinalizeFit) {
        return Err("Unexpected fit finalization state.".into());
    }
    let output = match operation {
        Operation::Evaluate => Output::Evaluation(evaluate(project)?),
        Operation::EvaluateSource => {
            let model = Prepared::with_source_calibration(project, true)?;
            Output::Evaluation(finite_evaluation(evaluate_prepared(
                &model,
                &model.initial,
            ))?)
        }
        Operation::Fit => fit_rpc_prepared(Prepared::new(project)?, progress, false)?.into(),
        Operation::FitSource => fit_rpc_prepared(
            Prepared::with_source_calibration(project, true)?,
            progress,
            false,
        )?
        .into(),
        Operation::FitRecovery => fit_rpc_prepared(Prepared::new(project)?, progress, true)?.into(),
        Operation::FinalizeFit => Output::Fit(finalize_fit(
            project,
            state.ok_or("Missing fit finalization state.")?,
        )?),
    };
    check_cancellation()?;
    Ok(Computation {
        result: output,
        execution: execution.execution(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn project() -> Project {
        serde_json::from_str(include_str!(
            "../../tests/fixtures/syncmoss-sms-transmission.json"
        ))
        .map(|v: serde_json::Value| serde_json::from_value(v["project"].clone()).unwrap())
        .unwrap()
    }
    #[test]
    fn canceled_work_never_returns_a_fit_and_does_not_poison_reused_threads() {
        let token = CancellationToken::new();
        token.cancel();
        assert!(compute(&project(), Operation::Fit, token, None)
            .unwrap_err()
            .contains("canceled"));
        assert!(compute(
            &project(),
            Operation::Evaluate,
            CancellationToken::new(),
            None
        )
        .is_ok());
    }
    #[test]
    fn progress_can_cancel_a_running_fit_and_recovery_is_cancelable_too() {
        let p = project();
        let token = CancellationToken::new();
        let cancel = token.clone();
        let error = compute(
            &p,
            Operation::Fit,
            token,
            Some(Box::new(move |_| cancel.cancel())),
        )
        .unwrap_err();
        assert!(error.contains("canceled"), "{error}");
        let token = CancellationToken::new();
        let cancel = token.clone();
        let error = compute(
            &p,
            Operation::FitRecovery,
            token,
            Some(Box::new(move |_| cancel.cancel())),
        )
        .unwrap_err();
        assert!(error.contains("canceled"), "{error}");
    }
    #[test]
    fn native_entry_points_retain_the_shared_model_and_source_calibration() {
        let p = project();
        let a = serde_json::to_value(evaluate(&p).unwrap()).unwrap();
        let b = serde_json::to_value(
            compute(&p, Operation::Evaluate, CancellationToken::new(), None).unwrap(),
        )
        .unwrap();
        assert_eq!(a, b);
        let ordinary = serde_json::to_value(fit(&p).unwrap()).unwrap();
        let native = serde_json::to_value(
            compute(&p, Operation::Fit, CancellationToken::new(), None).unwrap(),
        )
        .unwrap();
        assert_eq!(ordinary, native);
    }
    #[test]
    fn cancellation_during_shared_grid_retains_residual_dimensions() {
        let p = project();
        let m = Prepared::new(&p).unwrap();
        let token = CancellationToken::new();
        let _scope = Scope::enter(token.clone());
        let rows = p.spectrum.x.len();
        let velocities = p.spectrum.x.iter().enumerate().map(|(i, &v)| {
            if i == 3 {
                token.cancel();
            }
            v
        });
        let grid = m.absorber_grid(&p, &m.initial, velocities, rows);
        assert_eq!(grid.values.len(), rows);
        assert!(grid.values[3..].iter().all(|&v| v == 0.));
        assert!(canceled());
    }
    #[test]
    fn cancellation_at_projection_handoff_does_not_publish_a_fit_or_poison_reuse() {
        let f: serde_json::Value = serde_json::from_str(include_str!(
            "../../tests/fixtures/variable-projection-slow-trial.json"
        ))
        .unwrap();
        let p: Project = serde_json::from_value(f["project"].clone()).unwrap();
        let token = CancellationToken::new();
        let cancel = token.clone();
        let error = compute(
            &p,
            Operation::Fit,
            token,
            Some(Box::new(move |_progress| {
                if derivatives::joint_continuation_recorded() {
                    cancel.cancel();
                }
            })),
        )
        .unwrap_err();
        assert!(error.contains("canceled"), "{error}");
        assert!(compute(
            &project(),
            Operation::Evaluate,
            CancellationToken::new(),
            None
        )
        .is_ok());
    }
}
