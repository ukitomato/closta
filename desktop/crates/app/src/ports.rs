//! What the New Session dialog asks of this machine, and the planner a folder starts with.

use std::collections::BTreeSet;
use std::path::PathBuf;
use std::sync::Arc;

use closta_providers::claude::launch::LaunchError;
use closta_providers::claude::launch::env::SecretEnv;
use closta_providers::claude::launch::spawn::{NativeProgram, NativeSpawner, locate_claude_exe};
use closta_providers::claude::launch::wsl::{
    WslLocation, WslProgram, WslSpawner, default_distro, installed_distros,
};
use closta_providers::claude::process::ProcessSpawner;
use closta_session::launch::{NativeSessionLaunchPlanner, SessionLaunchPlanner, WslAwarePlanner};
use closta_session::log::TracingLog;
use closta_shell::new_session::{ClaudeOnPath, LaunchChecks, PlannerFor};
use closta_shell::settings::SettingsSink;
use closta_shell::state::Ports;
use futures_lite::future;

/// The checks of this machine: the registry, `PATH` and the disk.
pub struct RealChecks;

/// Whether a `claude.exe` (or only a script) is on `path_var`, a Windows `PATH`.
fn claude_on_path_in(path_var: &str) -> ClaudeOnPath {
    match locate_claude_exe(path_var, &|file| std::path::Path::new(file).is_file()) {
        Ok(_) => ClaudeOnPath::Found,
        Err(LaunchError::ScriptOnly) => ClaudeOnPath::ScriptOnly,
        Err(_) => ClaudeOnPath::Missing,
    }
}

impl LaunchChecks for RealChecks {
    fn installed_distros(&self) -> Vec<String> {
        installed_distros()
    }

    fn claude_on_path(&self) -> ClaudeOnPath {
        if cfg!(windows) {
            let path = std::env::var("PATH").unwrap_or_default();
            claude_on_path_in(&path)
        } else {
            ClaudeOnPath::Found
        }
    }

    fn default_distro(&self) -> Option<String> {
        default_distro()
    }

    fn folder_exists(&self, folder: &str) -> future::Boxed<bool> {
        let folder = PathBuf::from(folder);
        Box::pin(blocking::unblock(move || folder.is_dir()))
    }
}

/// The planner a folder starts with: `claude` on this host, or in the distribution a WSL folder
/// names.
pub struct RealPlannerFor;

fn spawner_for(location: &WslLocation) -> Arc<dyn ProcessSpawner> {
    Arc::new(WslSpawner::new(
        location.clone(),
        WslProgram::Claude,
        BTreeSet::new(),
    ))
}

impl PlannerFor for RealPlannerFor {
    fn planner(&self, folder: &str) -> Arc<dyn SessionLaunchPlanner> {
        let native = NativeSessionLaunchPlanner::new(
            Arc::new(NativeSpawner::new(NativeProgram::Claude, BTreeSet::new())),
            Arc::new(SecretEnv::default),
        );
        Arc::new(WslAwarePlanner::new(
            Arc::new(native),
            WslLocation::parse(Some(folder), true),
            Arc::new(spawner_for),
            Arc::new(TracingLog),
        ))
    }
}

pub fn real_ports(settings: Arc<dyn SettingsSink>) -> Ports {
    Ports {
        checks: Arc::new(RealChecks),
        planner_for: Arc::new(RealPlannerFor),
        settings,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn real_checks_see_a_folder_and_a_missing_one() {
        let dir = std::env::temp_dir();
        let here = dir.to_string_lossy().into_owned();
        let gone = dir
            .join("closta-no-such-folder")
            .to_string_lossy()
            .into_owned();
        smol::block_on(async {
            assert!(RealChecks.folder_exists(&here).await);
            assert!(!RealChecks.folder_exists(&gone).await);
        });
    }

    #[test]
    fn claude_on_path_reads_the_path_it_is_given() {
        assert_eq!(claude_on_path_in(""), ClaudeOnPath::Missing);
    }
}
