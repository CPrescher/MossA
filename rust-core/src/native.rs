//! Native entry points. The mathematical model and solvers are shared with WASM.
use super::*;
pub use basin::CancellationToken;
use std::cell::RefCell;
pub mod jobs;

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
}
#[derive(Debug, Serialize)]
#[serde(untagged)]
pub enum Output {
    Evaluation(Evaluation),
    Fit(FitResult),
}

pub fn compute(
    project: &Project,
    operation: Operation,
    token: CancellationToken,
    progress: Option<Box<dyn FnMut(FitProgress)>>,
) -> Result<Output, String> {
    let _scope = Scope::enter(token);
    check_cancellation()?;
    let output = match operation {
        Operation::Evaluate => Output::Evaluation(evaluate(project)?),
        Operation::EvaluateSource => {
            let model = Prepared::with_source_calibration(project, true)?;
            Output::Evaluation(finite_evaluation(evaluate_prepared(
                &model,
                &model.initial,
            ))?)
        }
        Operation::Fit => Output::Fit(fit_with_progress(project, progress)?),
        Operation::FitSource => Output::Fit(fit_prepared(
            Prepared::with_source_calibration(project, true)?,
            progress,
        )?),
        Operation::FitRecovery => Output::Fit(fit_prepared_with_solver(
            Prepared::new(project)?,
            progress,
            true,
        )?),
    };
    check_cancellation()?;
    Ok(output)
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
}
