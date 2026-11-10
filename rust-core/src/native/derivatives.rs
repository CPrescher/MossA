//! Private, bounded native derivative pool. Only independent columns run in
//! parallel: residual arithmetic and column placement retain their serial order.
use super::{cancellation, Scope};
use crate::Prepared;
use nalgebra::DMatrix;
use rayon::prelude::*;
use std::{cell::RefCell, sync::OnceLock};

#[derive(Clone, Debug, serde::Serialize)]
pub struct Execution {
    pub backend: &'static str,
    pub derivative_workers: usize,
    #[cfg(feature = "projection-profile")]
    pub projection_profile: crate::variable_projection::profile::ProjectionProfile,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub projected_parameters: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub projection_fallback: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub projection_handoffs: Vec<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fallback: Option<String>,
}
impl Default for Execution {
    fn default() -> Self {
        Self {
            backend: "native-rust",
            derivative_workers: 1,
            #[cfg(feature = "projection-profile")]
            projection_profile: Default::default(),
            projected_parameters: None,
            projection_fallback: None,
            projection_handoffs: Vec::new(),
            fallback: None,
        }
    }
}
struct Settings {
    requested: Option<usize>,
    execution: Execution,
}
thread_local! {
    static SETTINGS: RefCell<Option<Settings>> = const { RefCell::new(None) };
}
pub(super) struct ExecutionScope(
    Option<Settings>,
    #[cfg(feature = "projection-profile")]
    #[allow(dead_code)]
    crate::variable_projection::profile::Scope,
);
impl ExecutionScope {
    pub fn enter(requested: Option<usize>) -> Result<Self, String> {
        if requested.is_some_and(|n| !(1..=8).contains(&n)) {
            return Err("Derivative workers must be 1–8.".into());
        }
        Ok(Self(
            SETTINGS.with(|slot| {
                slot.replace(Some(Settings {
                    requested,
                    execution: Execution::default(),
                }))
            }),
            #[cfg(feature = "projection-profile")]
            crate::variable_projection::profile::Scope::enter(),
        ))
    }
    pub fn execution(&self) -> Execution {
        let execution = SETTINGS.with(|slot| slot.borrow().as_ref().unwrap().execution.clone());
        #[cfg(feature = "projection-profile")]
        let execution = Execution {
            projection_profile: crate::variable_projection::profile::snapshot(),
            ..execution
        };
        execution
    }
}
impl Drop for ExecutionScope {
    fn drop(&mut self) {
        SETTINGS.with(|slot| slot.replace(self.0.take()));
    }
}
pub(crate) fn record_projection(parameters: usize, fallback: Option<String>) {
    SETTINGS.with(|slot| {
        if let Some(settings) = slot.borrow_mut().as_mut() {
            settings.execution.projected_parameters = Some(parameters);
            settings.execution.projection_fallback = fallback;
        }
    });
}
pub(crate) fn record_joint_continuation(iteration: u64) {
    SETTINGS.with(|slot| {
        if let Some(s) = slot.borrow_mut().as_mut() {
            s.execution.projection_handoffs.push(iteration);
        }
    });
}
#[cfg(test)]
pub(crate) fn joint_continuation_recorded() -> bool {
    SETTINGS.with(|s| {
        s.borrow()
            .as_ref()
            .is_some_and(|s| !s.execution.projection_handoffs.is_empty())
    })
}
fn capacity() -> usize {
    std::thread::available_parallelism()
        .map(|n| n.get().saturating_sub(1).clamp(1, 8))
        .unwrap_or(1)
}
fn workers(model: &Prepared, requested: Option<usize>) -> usize {
    let automatic = if model.free.len() >= 4
        && (model.project.mode == "transmission" || model.source_calibration)
    {
        8
    } else if model.free.len() >= 16 && model.project.spectrum.x.len() >= 256 {
        4
    } else {
        1
    };
    requested
        .unwrap_or(automatic)
        .min(capacity())
        .min(model.free.len())
        .max(1)
}
fn pool() -> Result<&'static rayon::ThreadPool, &'static str> {
    static POOL: OnceLock<Result<rayon::ThreadPool, String>> = OnceLock::new();
    POOL.get_or_init(|| {
        rayon::ThreadPoolBuilder::new()
            .num_threads(capacity())
            .thread_name(|i| format!("mossa-derivative-{i}"))
            .build()
            .map_err(|e| e.to_string())
    })
    .as_ref()
    .map_err(|_| "Native derivative pool could not start; using serial derivatives.")
}
pub(crate) fn columns(model: &Prepared, x: &[f64]) -> Option<DMatrix<f64>> {
    columns_with(model, x.len(), |k| model.derivative_column(x, k))
}
/// Reuse the same bounded pool and cancellation scopes for analytical FFT
/// columns. Placement is deterministic; there are no parallel reductions.
pub(crate) fn columns_with(
    model: &Prepared,
    n: usize,
    column_at: impl Fn(usize) -> Vec<f64> + Sync,
) -> Option<DMatrix<f64>> {
    // Plain Rust library calls remain serial unless a native compute scope has
    // explicitly selected Auto or a worker count. No execution setting is saved.
    let count = SETTINGS.with(|slot| {
        slot.borrow()
            .as_ref()
            .map(|settings| workers(model, settings.requested))
    })?;
    if count <= 1 {
        return None;
    }
    let pool = match pool() {
        Ok(pool) => pool,
        Err(message) => {
            SETTINGS.with(|slot| {
                slot.borrow_mut().as_mut().unwrap().execution.fallback = Some(message.into())
            });
            return None;
        }
    };
    let rows = model.project.spectrum.x.len();
    let mut matrix = DMatrix::zeros(rows, n);
    // Split into exactly count balanced, disjoint column ranges. There is no
    // parallel reduction, altered finite-difference step, or shared mutable model.
    let mut remaining = matrix.as_mut_slice();
    let mut first = 0;
    let mut parts = Vec::with_capacity(count);
    for worker in 0..count {
        let columns = (n - first).div_ceil(count - worker);
        let (part, rest) = remaining.split_at_mut(columns * rows);
        parts.push((first, part));
        remaining = rest;
        first += columns;
    }
    let token = cancellation();
    pool.install(|| {
        parts.into_par_iter().for_each(|(first, part)| {
            // Native cancellation is thread-local. Carry this job's token into each
            // task and restore the previous token before the worker is reused.
            let _scope = token.clone().map(Scope::enter);
            for (offset, column) in part.chunks_exact_mut(rows).enumerate() {
                if super::canceled() {
                    break;
                }
                column.copy_from_slice(&column_at(first + offset));
            }
        })
    });
    SETTINGS.with(|slot| {
        let mut slot = slot.borrow_mut();
        let settings = slot.as_mut().unwrap();
        settings.execution.derivative_workers = settings.execution.derivative_workers.max(count);
    });
    Some(matrix)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::native::{compute_with_options, CancellationToken, Operation};
    use crate::Project;

    fn fixture_projects() -> Vec<(String, Project, Operation)> {
        [
            include_str!("../../../tests/fixtures/transmission-performance.json"),
            include_str!("../../../tests/fixtures/transmission-measured-performance.json"),
        ]
        .iter()
        .flat_map(|text| {
            let value: serde_json::Value = serde_json::from_str(text).unwrap();
            value["cases"]
                .as_array()
                .unwrap()
                .iter()
                .map(|c| {
                    (
                        c["id"].as_str().unwrap().to_string(),
                        {
                            let mut p: crate::Project =
                                serde_json::from_value(c["project"].clone()).unwrap();
                            p.derivative_method = Some(crate::DerivativeMethod::Numerical);
                            p
                        },
                        if c["calibration"] == true {
                            Operation::FitSource
                        } else {
                            Operation::Fit
                        },
                    )
                })
                .collect::<Vec<_>>()
        })
        .collect()
    }
    #[test]
    fn native_models_are_send_sync_and_parallel_columns_preserve_complete_results() {
        fn send_sync<T: Send + Sync>() {}
        send_sync::<Prepared>();
        for (id, project, operation) in fixture_projects() {
            let serial =
                compute_with_options(&project, operation, CancellationToken::new(), None, Some(1))
                    .unwrap();
            let expected = serde_json::to_string(&serial.result).unwrap();
            assert_eq!(serial.execution.derivative_workers, 1);
            for count in [2, 4, 8] {
                let actual = compute_with_options(
                    &project,
                    operation,
                    CancellationToken::new(),
                    None,
                    Some(count),
                )
                .unwrap();
                assert_eq!(
                    serde_json::to_string(&actual.result).unwrap(),
                    expected,
                    "{id}/{count}"
                );
                assert!(actual.execution.derivative_workers <= count);
                assert!(actual.execution.fallback.is_none());
            }
        }
    }
    #[test]
    fn canceled_batches_restore_worker_tokens_and_do_not_poison_later_jobs() {
        let (_, project, _) = fixture_projects().remove(1);
        let model = Prepared::new(&project).unwrap();
        let expected = model.derivative(&model.initial);
        let token = CancellationToken::new();
        token.cancel();
        {
            let _token = Scope::enter(token);
            let _execution = ExecutionScope::enter(Some(4)).unwrap();
            let actual = model.derivative(&model.initial);
            assert!(actual.iter().all(|v| *v == 0.));
        }
        if capacity() > 1 {
            assert!(pool()
                .unwrap()
                .broadcast(|_| super::super::canceled())
                .iter()
                .all(|v| !v));
        }
        let _token = Scope::enter(CancellationToken::new());
        let execution = ExecutionScope::enter(Some(4)).unwrap();
        assert_eq!(model.derivative(&model.initial), expected);
        assert_eq!(execution.execution().derivative_workers, 4.min(capacity()));
    }
    #[test]
    fn nested_progress_computations_restore_outer_execution_settings() {
        let (_, project, operation) = fixture_projects().remove(1);
        let reference =
            compute_with_options(&project, operation, CancellationToken::new(), None, Some(1))
                .unwrap();
        let nested = project.clone();
        let actual = compute_with_options(
            &project,
            operation,
            CancellationToken::new(),
            Some(Box::new(move |_| {
                let result = compute_with_options(
                    &nested,
                    Operation::Evaluate,
                    CancellationToken::new(),
                    None,
                    Some(1),
                )
                .unwrap();
                assert_eq!(result.execution.derivative_workers, 1);
            })),
            Some(4),
        )
        .unwrap();
        assert_eq!(
            serde_json::to_string(&actual.result).unwrap(),
            serde_json::to_string(&reference.result).unwrap()
        );
        assert_eq!(actual.execution.derivative_workers, 4.min(capacity()));
        assert!(SETTINGS.with(|slot| slot.borrow().is_none()));
    }
    #[test]
    fn execution_options_are_validated_and_never_saved_in_the_project() {
        let (_, project, operation) = fixture_projects().remove(0);
        for count in [0, 9] {
            assert!(compute_with_options(
                &project,
                operation,
                CancellationToken::new(),
                None,
                Some(count)
            )
            .is_err());
        }
        assert!(SETTINGS.with(|slot| slot.borrow().is_none()));
        let result =
            compute_with_options(&project, operation, CancellationToken::new(), None, Some(4))
                .unwrap();
        let value = serde_json::to_value(result.result).unwrap();
        assert!(value["project"].get("derivative_workers").is_none());
    }
}
