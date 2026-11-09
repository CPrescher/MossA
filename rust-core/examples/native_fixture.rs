//! Headless transport for parity/cancellation tests of the production native core.
//! Desktop runs this same API in-process through Tauri commands, not a sidecar.
use mossa_core::{
    native::{self, jobs::Sessions, Operation},
    Project,
};
use serde_json::{json, Value};
use std::{
    io::{self, BufRead, Write},
    time::Instant,
};
fn emit(value: Value) {
    let mut out = io::stdout().lock();
    writeln!(out, "{value}").unwrap();
    out.flush().unwrap();
}
fn main() {
    let engine = Sessions::default();
    let mut handles = vec![];
    for line in io::stdin().lock().lines() {
        let message: Value = serde_json::from_str(&line.unwrap()).unwrap();
        let id = message["id"].as_u64().unwrap();
        let args = &message["args"];
        let session = args["session"].as_str().unwrap_or("");
        match message["command"].as_str().unwrap() {
            "native_compute_start" => emit(match engine.start(session.into()) {
                Ok(()) => json!({"id":id,"result":null}),
                Err(error) => json!({"id":id,"error":error}),
            }),
            "native_compute_cancel" => emit(match engine.cancel(session) {
                Ok(()) => json!({"id":id,"result":null}),
                Err(error) => json!({"id":id,"error":error}),
            }),
            "status" => emit(json!({"id":id,"result":{"active":engine.active()}})),
            "native_comparison_batch" => {
                let job = match engine.job(session) {
                    Ok(j) => j,
                    Err(e) => {
                        emit(json!({"id":id,"error":e}));
                        continue;
                    }
                };
                let request = match serde_json::from_value(args["request"].clone()) {
                    Ok(r) => r,
                    Err(e) => {
                        emit(json!({"id":id,"error":e.to_string()}));
                        continue;
                    }
                };
                handles.push(std::thread::spawn(move || {
                    let result =
                        native::comparison::run(&job.comparison, request, job.token.clone());
                    drop(job);
                    emit(match result {
                        Ok(result) => json!({"id":id,"result":result}),
                        Err(error) => json!({"id":id,"error":error}),
                    });
                }));
            }
            "native_compute" => {
                let job = match engine.job(session) {
                    Ok(job) => job,
                    Err(error) => {
                        emit(json!({"id":id,"error":error}));
                        continue;
                    }
                };
                let project: Project = match serde_json::from_value(args["project"].clone()) {
                    Ok(project) => project,
                    Err(error) => {
                        drop(job);
                        emit(json!({"id":id,"error":error.to_string()}));
                        continue;
                    }
                };
                let publish = args["progress"].as_bool().unwrap_or(false);
                let operation: Operation =
                    serde_json::from_value(args["operation"].clone()).unwrap();
                let derivative_workers: Option<usize> = match serde_json::from_value(
                    args.get("derivativeWorkers")
                        .cloned()
                        .unwrap_or(Value::Null),
                ) {
                    Ok(value) => value,
                    Err(error) => {
                        drop(job);
                        emit(json!({"id":id,"error":error.to_string()}));
                        continue;
                    }
                };
                let state: Option<mossa_core::FitState> =
                    match serde_json::from_value(args.get("state").cloned().unwrap_or(Value::Null))
                    {
                        Ok(value) => value,
                        Err(error) => {
                            drop(job);
                            emit(json!({"id":id,"error":error.to_string()}));
                            continue;
                        }
                    };
                handles.push(std::thread::spawn(move || {
                    let start = Instant::now(); let token = job.token.clone();
                    let callback: Option<Box<dyn FnMut(mossa_core::FitProgress)>> = if publish { Some(Box::new(move |progress| { if !token.is_cancelled() { emit(json!({"id":id,"progress":progress})); } })) } else { None };
                    let result = native::compute_with_state(&project, operation, job.token.clone(), callback, derivative_workers, state);
                    let response = match result {
                        Ok(computed) if !job.token.is_cancelled() => json!({"id":id,"result":{"result":computed.result,"elapsed":start.elapsed().as_secs_f64()*1000.,"execution":computed.execution}}),
                        Ok(_) => json!({"id":id,"error":"Calculation canceled."}),
                        Err(error) => json!({"id":id,"error":error}),
                    };
                    drop(job); emit(response);
                }));
            }
            _ => emit(json!({"id":id,"error":"Unknown command"})),
        }
    }
    engine.cancel_all();
    for thread in handles {
        let _ = thread.join();
    }
}
