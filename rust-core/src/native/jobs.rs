use super::CancellationToken;
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc, Mutex,
    },
};
pub const MAX_JOBS: usize = 32;
#[derive(Clone, Default)]
pub struct Sessions(Arc<Inner>);
#[derive(Default)]
struct Inner {
    sessions: Mutex<HashMap<String, Session>>,
    active: AtomicUsize,
}
struct Session {
    token: CancellationToken,
    comparison: Arc<Mutex<super::comparison::Registry>>,
}
pub struct Job {
    engine: Sessions,
    pub token: CancellationToken,
    pub comparison: Arc<Mutex<super::comparison::Registry>>,
}
impl Drop for Job {
    fn drop(&mut self) {
        self.engine.0.active.fetch_sub(1, Ordering::SeqCst);
    }
}
impl Sessions {
    pub fn active(&self) -> usize {
        self.0.active.load(Ordering::SeqCst)
    }
    pub fn start(&self, session: String) -> Result<(), String> {
        if session.len() > 160 || session.is_empty() {
            return Err("Invalid calculation session".into());
        }
        let mut sessions = self
            .0
            .sessions
            .lock()
            .map_err(|_| "Calculation state is unavailable")?;
        if sessions.len() >= 64 || sessions.contains_key(&session) {
            return Err("Calculation session already exists or too many sessions are open".into());
        }
        sessions.insert(
            session,
            Session {
                token: CancellationToken::new(),
                comparison: Arc::new(Mutex::new(super::comparison::Registry::default())),
            },
        );
        Ok(())
    }
    pub fn job(&self, session: &str) -> Result<Job, String> {
        let (token, comparison) = self
            .0
            .sessions
            .lock()
            .map_err(|_| "Calculation state is unavailable")?
            .get(session)
            .map(|s| (s.token.clone(), s.comparison.clone()))
            .ok_or("Calculation canceled or session closed.")?;
        if token.is_cancelled() {
            return Err("Calculation canceled.".into());
        }
        self.0
            .active
            .try_update(Ordering::SeqCst, Ordering::SeqCst, |n| {
                (n < MAX_JOBS).then_some(n + 1)
            })
            .map_err(|_| {
                "Too many native calculations are running. Wait for a calculation to finish."
            })?;
        Ok(Job {
            engine: self.clone(),
            token,
            comparison,
        })
    }
    pub fn cancel(&self, session: &str) -> Result<(), String> {
        if let Some(token) = self
            .0
            .sessions
            .lock()
            .map_err(|_| "Calculation state is unavailable")?
            .remove(session)
        {
            token.token.cancel();
        }
        Ok(())
    }
    pub fn cancel_all(&self) {
        if let Ok(mut sessions) = self.0.sessions.lock() {
            for (_, token) in sessions.drain() {
                token.token.cancel();
            }
        }
    }
}
