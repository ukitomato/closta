//! A spawner that hands out the processes a test chooses: from scripts, or any it builds.

use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

use crate::claude::fake::process::{FakeProcess, FakeProcessProbe, ProcessScript};
use crate::claude::launch::{Launch, LaunchError};
use crate::claude::process::{AgentProcess, ProcessSpawner};

type NextProcess = dyn Fn(&Launch) -> Result<Box<dyn AgentProcess>, LaunchError> + Send + Sync;

/// A [`ProcessSpawner`] that asks `next` for the answer to each launch. It records every launch,
/// refused ones too, and the probe of every scripted process it handed out.
pub struct FakeSpawner {
    next: Box<NextProcess>,
    launches: Mutex<Vec<Launch>>,
    probes: Arc<Mutex<Vec<FakeProcessProbe>>>,
    wsl_distro: Option<String>,
}

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(PoisonError::into_inner)
}

impl FakeSpawner {
    /// Hands out a [`FakeProcess`] played from the script `next` gives for each launch.
    pub fn new(
        next: impl Fn(&Launch) -> Result<ProcessScript, LaunchError> + Send + Sync + 'static,
    ) -> FakeSpawner {
        let probes = Arc::new(Mutex::new(Vec::new()));
        let kept = Arc::clone(&probes);
        let mut spawner = FakeSpawner::answering(move |launch| {
            let (process, probe) = FakeProcess::new(next(launch)?);
            lock(&kept).push(probe);
            Ok(Box::new(process) as Box<dyn AgentProcess>)
        });
        spawner.probes = probes;
        spawner
    }

    /// Hands out whatever `next` answers for each launch.
    pub fn answering(
        next: impl Fn(&Launch) -> Result<Box<dyn AgentProcess>, LaunchError> + Send + Sync + 'static,
    ) -> FakeSpawner {
        FakeSpawner {
            next: Box::new(next),
            launches: Mutex::new(Vec::new()),
            probes: Arc::new(Mutex::new(Vec::new())),
            wsl_distro: None,
        }
    }

    /// The same spawner, saying that it starts in the WSL distribution `distro`.
    pub fn with_wsl_distro(self, distro: &str) -> FakeSpawner {
        FakeSpawner {
            wsl_distro: Some(distro.to_owned()),
            ..self
        }
    }

    /// Every launch asked for, in order.
    pub fn launches(&self) -> Vec<Launch> {
        lock(&self.launches).clone()
    }

    /// The probes of the scripted processes handed out, in order.
    pub fn probes(&self) -> Vec<FakeProcessProbe> {
        lock(&self.probes).clone()
    }
}

impl ProcessSpawner for FakeSpawner {
    fn spawn(&self, launch: &Launch) -> Result<Box<dyn AgentProcess>, LaunchError> {
        lock(&self.launches).push(launch.clone());
        (self.next)(launch)
    }

    fn wsl_distro(&self) -> Option<&str> {
        self.wsl_distro.as_deref()
    }
}
