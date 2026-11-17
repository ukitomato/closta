//! A spawner that hands out [`FakeProcess`]es from scripts.

use std::sync::{Mutex, MutexGuard, PoisonError};

use crate::claude::fake::process::{FakeProcess, FakeProcessProbe, ProcessScript};
use crate::claude::launch::{Launch, LaunchError};
use crate::claude::process::{AgentProcess, ProcessSpawner};

type NextScript = dyn Fn(&Launch) -> Result<ProcessScript, LaunchError> + Send + Sync;

/// A [`ProcessSpawner`] that asks `next` for the script of each launch. It records every launch,
/// refused ones too, and the probe of every process it handed out.
pub struct FakeSpawner {
    next: Box<NextScript>,
    launches: Mutex<Vec<Launch>>,
    probes: Mutex<Vec<FakeProcessProbe>>,
}

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(PoisonError::into_inner)
}

impl FakeSpawner {
    pub fn new(
        next: impl Fn(&Launch) -> Result<ProcessScript, LaunchError> + Send + Sync + 'static,
    ) -> FakeSpawner {
        FakeSpawner {
            next: Box::new(next),
            launches: Mutex::new(Vec::new()),
            probes: Mutex::new(Vec::new()),
        }
    }

    /// Every launch asked for, in order.
    pub fn launches(&self) -> Vec<Launch> {
        lock(&self.launches).clone()
    }

    /// The probes of the processes handed out, in order.
    pub fn probes(&self) -> Vec<FakeProcessProbe> {
        lock(&self.probes).clone()
    }
}

impl ProcessSpawner for FakeSpawner {
    fn spawn(&self, launch: &Launch) -> Result<Box<dyn AgentProcess>, LaunchError> {
        lock(&self.launches).push(launch.clone());
        let script = (self.next)(launch)?;
        let (process, probe) = FakeProcess::new(script);
        lock(&self.probes).push(probe);
        Ok(Box::new(process))
    }
}
