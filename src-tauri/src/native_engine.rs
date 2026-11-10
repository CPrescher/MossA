use mossa_core::{
    native::{self, Operation, Output},
    FitProgress, Project,
};
use std::time::Instant;
use tauri::ipc::{Channel, JavaScriptChannelId};

pub use mossa_core::native::jobs::Sessions as NativeEngine;
fn main_window(window: &tauri::WebviewWindow) -> Result<(), String> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err("Calculations are only available in the analysis window.".into())
    }
}
#[tauri::command]
pub fn native_compute_start(
    window: tauri::WebviewWindow,
    engine: tauri::State<'_, NativeEngine>,
    session: String,
) -> Result<(), String> {
    main_window(&window)?;
    engine.start(session)
}
#[tauri::command]
pub fn native_compute_cancel(
    window: tauri::WebviewWindow,
    engine: tauri::State<'_, NativeEngine>,
    session: String,
) -> Result<(), String> {
    main_window(&window)?;
    engine.cancel(&session)
}
#[derive(serde::Serialize)]
pub struct Response {
    result: Output,
    elapsed: f64,
    execution: native::Execution,
}
#[tauri::command]
pub async fn native_compute(
    window: tauri::WebviewWindow,
    engine: tauri::State<'_, NativeEngine>,
    session: String,
    operation: Operation,
    project: Project,
    progress: Option<JavaScriptChannelId>,
    derivative_workers: Option<usize>,
    state: Option<mossa_core::FitState>,
) -> Result<Response, String> {
    main_window(&window)?;
    let job = engine.job(&session)?;
    let progress: Option<Channel<FitProgress>> =
        progress.map(|id| id.channel_on(window.as_ref().clone()));
    tauri::async_runtime::spawn_blocking(move || {
        let start = Instant::now();
        let notify_token = job.token.clone();
        let callback: Option<Box<dyn FnMut(FitProgress)>> = progress.map(|progress| {
            Box::new(move |state| {
                if !notify_token.is_cancelled() {
                    let _ = progress.send(state);
                }
            }) as Box<dyn FnMut(FitProgress)>
        });
        let computed = native::compute_with_state(
            &project,
            operation,
            job.token.clone(),
            callback,
            derivative_workers,
            state,
        )?;
        if job.token.is_cancelled() {
            return Err("Calculation canceled.".into());
        }
        Ok(Response {
            result: computed.result,
            elapsed: start.elapsed().as_secs_f64() * 1000.,
            execution: computed.execution,
        })
    })
    .await
    .map_err(|e| format!("Native calculation failed: {e}"))?
}

#[tauri::command]
pub async fn native_comparison_batch(
    window: tauri::WebviewWindow,
    engine: tauri::State<'_, NativeEngine>,
    session: String,
    request: native::comparison::Request,
) -> Result<native::comparison::Response, String> {
    main_window(&window)?;
    let job = engine.job(&session)?;
    tauri::async_runtime::spawn_blocking(move || {
        native::comparison::run(&job.comparison, request, job.token.clone())
    })
    .await
    .map_err(|e| format!("Native comparison failed: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn cancellation_rejects_queued_and_future_jobs_without_canceling_other_sessions() {
        let engine = NativeEngine::default();
        engine.start("fit".into()).unwrap();
        engine.start("comparison".into()).unwrap();
        let first = engine.job("fit").unwrap();
        let other = engine.job("comparison").unwrap();
        engine.cancel("fit").unwrap();
        assert!(first.token.is_cancelled());
        assert!(!other.token.is_cancelled());
        assert!(engine.job("fit").is_err());
        drop(first);
        drop(other);
        assert_eq!(engine.active(), 0);
        engine.cancel_all();
        assert!(engine.job("comparison").is_err());
    }
    #[test]
    fn native_parallel_jobs_are_bounded_and_permits_are_released_on_error() {
        let engine = NativeEngine::default();
        engine.start("pool".into()).unwrap();
        let jobs: Vec<_> = (0..mossa_core::native::jobs::MAX_JOBS)
            .map(|_| engine.job("pool").unwrap())
            .collect();
        assert!(engine.job("pool").is_err());
        drop(jobs);
        let job = engine.job("pool").unwrap();
        drop(job);
        assert_eq!(engine.active(), 0);
    }
    #[test]
    fn canceling_a_parallel_scope_signals_every_inflight_native_fit() {
        let engine = NativeEngine::default();
        engine.start("pool".into()).unwrap();
        let jobs: Vec<_> = (0..8).map(|_| engine.job("pool").unwrap()).collect();
        engine.cancel("pool").unwrap();
        assert!(jobs.iter().all(|j| j.token.is_cancelled()));
        drop(jobs);
        assert_eq!(engine.active(), 0);
    }
}
