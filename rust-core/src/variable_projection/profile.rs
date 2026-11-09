//! Opt-in diagnostics. No counters, clocks or trace allocations in normal builds.
use super::*;
#[derive(Clone, Default, Serialize, Debug)]
pub struct ProjectionProfile {
    pub point_calls: u64,
    pub point_evaluations: u64,
    pub point_ns: u64,
    pub basis_ns: u64,
    pub qr_calls: u64,
    pub qr_ns: u64,
    pub jacobians: u64,
    pub jacobian_ns: u64,
    pub weak_jacobians: u64,
    pub numerical_columns: u64,
    pub inner_iterations: u64,
    pub trace: Vec<ProjectionTrace>,
}
#[derive(Clone, Serialize, Debug)]
pub struct ProjectionTrace {
    pub iteration: u64,
    pub objective: f64,
    pub full: Vec<f64>,
}
thread_local! { static PROFILE: RefCell<ProjectionProfile> = RefCell::new(ProjectionProfile::default()); }
pub(crate) fn record(f: impl FnOnce(&mut ProjectionProfile)) {
    PROFILE.with(|p| f(&mut p.borrow_mut()));
}
pub(crate) fn snapshot() -> ProjectionProfile {
    PROFILE.with(|p| p.borrow().clone())
}
pub(crate) struct Scope(ProjectionProfile);
impl Scope {
    pub(crate) fn enter() -> Self {
        Self(PROFILE.with(|p| p.replace(ProjectionProfile::default())))
    }
}
impl Drop for Scope {
    fn drop(&mut self) {
        PROFILE.with(|p| {
            p.replace(std::mem::take(&mut self.0));
        });
    }
}
