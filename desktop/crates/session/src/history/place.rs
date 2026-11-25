//! Where the CLI keeps a project's records: its config directory on this machine, or the one the
//! CLI sees in a WSL distribution, asked of the distribution's login shell. IdeWsl.recordHome and
//! the record source of WslLaunching.kt.

use std::collections::HashMap;
use std::fmt;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::Duration;

use closta_providers::claude::launch::env::SecretEnv;
use closta_providers::claude::launch::probe::{MAX_BYTES, PROBE_TIMEOUT, probe_output_within};
use closta_providers::claude::launch::wsl::{HOME_MARK, PROBE_ARGS, WslLocation, WslProgram};
use closta_providers::claude::launch::{Launch, LaunchError};
use closta_providers::claude::process::ProcessSpawner;
use futures_lite::future;

use crate::log::SessionLog;

/// The CLI's config directory on this machine: `CLAUDE_CONFIG_DIR` when it is not blank, else
/// `%USERPROFILE%\.claude`, read through `env`. Always `None` off Windows: the app runs only there,
/// and Linux's `HOME` is not read.
pub fn native_config_dir(env: &dyn Fn(&str) -> Option<String>) -> Option<PathBuf> {
    if cfg!(windows) {
        windows_config_dir(env)
    } else {
        None
    }
}

/// [`native_config_dir`]'s rule on Windows, joined with `\` as a string so that it reads the same
/// on any OS.
pub fn windows_config_dir(env: &dyn Fn(&str) -> Option<String>) -> Option<PathBuf> {
    if let Some(configured) = env("CLAUDE_CONFIG_DIR").filter(|dir| !dir.trim().is_empty()) {
        return Some(PathBuf::from(configured));
    }
    let profile = env("USERPROFILE")?;
    let profile = profile.trim_end_matches('\\');
    (!profile.is_empty()).then(|| PathBuf::from(format!(r"{profile}\.claude")))
}

/// What the reader of the saved sessions is given: the config directory (asked when it is
/// needed), the folder whose records are read, and whether that folder is resolved to its real
/// path.
#[derive(Clone)]
pub struct RecordSource {
    pub config_dir: Arc<dyn Fn() -> Option<PathBuf> + Send + Sync>,
    pub working_directory: Option<String>,
    pub resolve_links: bool,
}

// Written by hand: the folder and the config directory are paths that name the user.
impl fmt::Debug for RecordSource {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("RecordSource")
            .field("resolve_links", &self.resolve_links)
            .finish_non_exhaustive()
    }
}

/// Where the CLI keeps its records in a WSL distribution, as a UNC path, or `None` when it could
/// not be found.
pub type WslHome = dyn Fn(&WslLocation) -> Option<PathBuf> + Send + Sync;

/// Where the saved sessions of the project in `folder` are read from: for a folder in a WSL
/// distribution the place `wsl_home` finds there, named from the Linux path, which is not
/// resolved; otherwise `native_config` and the folder as it is, resolved to its real path.
pub fn record_source(
    folder: Option<&str>,
    host_on_windows: bool,
    native_config: Option<PathBuf>,
    wsl_home: Arc<WslHome>,
) -> RecordSource {
    match WslLocation::parse(folder, host_on_windows) {
        Some(location) => RecordSource {
            working_directory: Some(location.linux_path.clone()),
            config_dir: Arc::new(move || wsl_home(&location)),
            resolve_links: false,
        },
        None => RecordSource {
            config_dir: Arc::new(move || native_config.clone()),
            working_directory: folder.map(str::to_owned),
            resolve_links: true,
        },
    }
}

/// The spawner that runs a program in a WSL distribution, for the short question of where the
/// CLI keeps its records.
pub type ProbeSpawnerFor =
    Arc<dyn Fn(&WslLocation, WslProgram) -> Arc<dyn ProcessSpawner> + Send + Sync>;

/// The CLI's config directory in `location`'s distribution, as a UNC path, asked of `sh` through
/// the same login shell the CLI runs in, waiting at most [`PROBE_TIMEOUT`].
pub fn wsl_record_home(
    location: &WslLocation,
    spawner_for: &ProbeSpawnerFor,
    log: &dyn SessionLog,
) -> Option<PathBuf> {
    wsl_record_home_within(location, spawner_for, PROBE_TIMEOUT, log)
}

/// [`wsl_record_home`], waiting at most `timeout`. Blocks the calling thread, which is already
/// one of `blocking`'s. One line says whether the place was found, or why not; never the path.
pub fn wsl_record_home_within(
    location: &WslLocation,
    spawner_for: &ProbeSpawnerFor,
    timeout: Duration,
    log: &dyn SessionLog,
) -> Option<PathBuf> {
    let found = ask_record_home(location, spawner_for, timeout);
    match &found {
        Ok(_) => log.info(&format!(
            "WSL {}: the CLI's records were found",
            location.distro
        )),
        Err(reason) => log.warn(&format!(
            "WSL {}: the CLI's config directory could not be found ({reason})",
            location.distro
        )),
    }
    found.ok()
}

/// The place, or the reason it was not found (IdeWsl.recordHome's four).
fn ask_record_home(
    location: &WslLocation,
    spawner_for: &ProbeSpawnerFor,
    timeout: Duration,
) -> Result<PathBuf, String> {
    let spawner = spawner_for(location, WslProgram::Path("sh".to_owned()));
    let launch = Launch {
        args: PROBE_ARGS.map(str::to_owned).to_vec(),
        env: SecretEnv::default(),
        cwd: Some(location.to_unc("/")),
    };
    let process = spawner.spawn(&launch).map_err(|error| match error {
        LaunchError::WslUnavailable { .. } => "the distribution was not found".to_owned(),
        _ => "the probe could not be started".to_owned(),
    })?;
    let output = future::block_on(probe_output_within(process, timeout, MAX_BYTES))
        .ok_or_else(|| format!("no answer within {} seconds", PROBE_TIMEOUT.as_secs()))?;
    location
        .record_home(&output)
        .map(PathBuf::from)
        .ok_or_else(|| format!("the answer had no {HOME_MARK} line"))
}

/// The CLI's config directory of each distribution, asked by `ask` the first time it is needed and
/// kept for the life of the app once found. A `None` is not kept: it is asked again next time.
/// Distributions are told apart without regard to case.
pub struct RecordHomes {
    ask: Arc<WslHome>,
    found: Mutex<HashMap<String, PathBuf>>,
}

impl RecordHomes {
    pub fn new(ask: Arc<WslHome>) -> RecordHomes {
        RecordHomes {
            ask,
            found: Mutex::new(HashMap::new()),
        }
    }

    /// The config directory in `location`'s distribution.
    pub fn home(&self, location: &WslLocation) -> Option<PathBuf> {
        let key = location.distro.to_lowercase();
        if let Some(found) = self.found().get(&key) {
            return Some(found.clone());
        }
        // Asked without the lock held: a question may take seconds, and other distributions'
        // places are not kept waiting on it.
        let found = (self.ask)(location)?;
        self.found().insert(key, found.clone());
        Some(found)
    }

    fn found(&self) -> MutexGuard<'_, HashMap<String, PathBuf>> {
        self.found.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

#[cfg(test)]
mod tests {
    use std::io;
    use std::sync::atomic::{AtomicUsize, Ordering};

    use closta_providers::claude::fake::process::{ProcessBeat, ProcessScript, ProcessTermination};
    use closta_providers::claude::fake::spawner::FakeSpawner;

    use super::super::test_log::Logged;
    use super::*;

    const WSL_FOLDER: &str = r"\\wsl.localhost\Ubuntu\home\me\p";

    fn ubuntu() -> WslLocation {
        WslLocation {
            distro: "Ubuntu".to_owned(),
            linux_path: "/".to_owned(),
        }
    }

    fn env_of(pairs: &'static [(&'static str, &'static str)]) -> impl Fn(&str) -> Option<String> {
        move |name| {
            pairs
                .iter()
                .find(|(key, _)| *key == name)
                .map(|(_, value)| (*value).to_owned())
        }
    }

    fn not_asked() -> Arc<WslHome> {
        Arc::new(|_| panic!("the distribution is not asked"))
    }

    #[cfg(not(windows))]
    #[test]
    fn off_windows_there_is_no_native_config_dir() {
        let every = env_of(&[
            ("CLAUDE_CONFIG_DIR", r"D:\c"),
            ("USERPROFILE", r"C:\Users\me"),
            ("HOME", "/home/me"),
        ]);
        assert_eq!(native_config_dir(&every), None);
        assert_eq!(native_config_dir(&|_| None), None);
    }

    #[test]
    fn the_windows_config_dir_is_claude_config_dir_or_the_profile_s_dot_claude() {
        let profile = PathBuf::from(r"C:\Users\me\.claude");
        assert_eq!(
            windows_config_dir(&env_of(&[
                ("CLAUDE_CONFIG_DIR", r"D:\c"),
                ("USERPROFILE", r"C:\Users\me")
            ])),
            Some(PathBuf::from(r"D:\c"))
        );
        assert_eq!(
            windows_config_dir(&env_of(&[
                ("CLAUDE_CONFIG_DIR", "  "),
                ("USERPROFILE", r"C:\Users\me")
            ])),
            Some(profile.clone())
        );
        assert_eq!(
            windows_config_dir(&env_of(&[("USERPROFILE", r"C:\Users\me")])),
            Some(profile.clone())
        );
        assert_eq!(
            windows_config_dir(&env_of(&[("USERPROFILE", "C:\\Users\\me\\")])),
            Some(profile)
        );
        assert_eq!(windows_config_dir(&|_| None), None);
        assert_eq!(
            windows_config_dir(&env_of(&[("CLAUDE_CONFIG_DIR", " ")])),
            None
        );
    }

    #[test]
    fn outside_wsl_the_records_are_read_by_the_folder_resolved() {
        let native = PathBuf::from(r"C:\Users\me\.claude");

        let source = record_source(Some(r"C:\work\p"), true, Some(native.clone()), not_asked());

        assert_eq!((source.config_dir)(), Some(native));
        assert_eq!(source.working_directory.as_deref(), Some(r"C:\work\p"));
        assert!(source.resolve_links);
        assert_eq!(
            (record_source(None, true, None, not_asked()).config_dir)(),
            None
        );
    }

    #[test]
    fn in_wsl_they_are_read_from_the_distribution_by_the_linux_path_unresolved() {
        let unc = PathBuf::from(r"\\wsl.localhost\Ubuntu\home\me\.claude");
        let asked = Arc::new(Mutex::new(Vec::new()));
        let kept = Arc::clone(&asked);
        let answer = unc.clone();
        let wsl_home: Arc<WslHome> = Arc::new(move |location| {
            kept.lock()
                .unwrap_or_else(PoisonError::into_inner)
                .push(location.clone());
            Some(answer.clone())
        });

        let source = record_source(
            Some(WSL_FOLDER),
            true,
            Some(PathBuf::from(r"C:\x")),
            wsl_home,
        );

        assert!(
            asked
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .is_empty(),
            "nothing is asked until the place is needed"
        );
        assert_eq!((source.config_dir)(), Some(unc));
        assert_eq!(
            *asked.lock().unwrap_or_else(PoisonError::into_inner),
            [WslLocation {
                distro: "Ubuntu".to_owned(),
                linux_path: "/home/me/p".to_owned(),
            }]
        );
        assert_eq!(source.working_directory.as_deref(), Some("/home/me/p"));
        assert!(!source.resolve_links);

        let native = PathBuf::from(r"C:\x");
        let off_windows = record_source(Some(WSL_FOLDER), false, Some(native.clone()), not_asked());
        assert_eq!((off_windows.config_dir)(), Some(native));
        assert_eq!(off_windows.working_directory.as_deref(), Some(WSL_FOLDER));
        assert!(off_windows.resolve_links);
    }

    #[test]
    fn record_source_debug_shows_only_whether_links_are_resolved() {
        let source = record_source(
            Some(r"C:\Users\me\p"),
            true,
            Some(PathBuf::from(r"C:\Users\me\.claude")),
            not_asked(),
        );

        assert_eq!(
            format!("{source:?}"),
            "RecordSource { resolve_links: true, .. }"
        );
    }

    /// A `ProbeSpawnerFor` that hands out `spawner` and keeps every program it was asked for.
    fn spawner_for(spawner: Arc<FakeSpawner>) -> (ProbeSpawnerFor, Arc<Mutex<Vec<WslProgram>>>) {
        let programs = Arc::new(Mutex::new(Vec::new()));
        let kept = Arc::clone(&programs);
        let spawner_for: ProbeSpawnerFor = Arc::new(move |_, program| {
            kept.lock()
                .unwrap_or_else(PoisonError::into_inner)
                .push(program);
            Arc::clone(&spawner) as Arc<dyn ProcessSpawner>
        });
        (spawner_for, programs)
    }

    fn answering(lines: &'static [&'static str]) -> Arc<FakeSpawner> {
        Arc::new(FakeSpawner::new(move |_| {
            Ok(ProcessScript::replaying(
                lines.iter().map(|line| (*line).to_owned()).collect(),
            ))
        }))
    }

    fn silent() -> Arc<FakeSpawner> {
        Arc::new(FakeSpawner::new(|_| {
            Ok(ProcessScript {
                beats: vec![ProcessBeat::AwaitStdin],
                termination: ProcessTermination::Complete,
                stdin_fails: false,
            })
        }))
    }

    fn refusing(error: LaunchError) -> Arc<FakeSpawner> {
        Arc::new(FakeSpawner::new(move |_| Err(error.clone())))
    }

    const MARKED: &[&str] = &[
        "a profile says hello",
        "CLAUDE_AGENT_HOME=/home/me",
        "CLAUDE_AGENT_CONFIG=",
    ];

    fn ask(spawner: &Arc<FakeSpawner>, log: &Logged) -> Option<PathBuf> {
        let (spawner_for, _) = spawner_for(Arc::clone(spawner));
        wsl_record_home_within(&ubuntu(), &spawner_for, Duration::from_millis(50), log)
    }

    #[test]
    fn the_probe_runs_sh_with_the_printf_in_the_root_of_the_distribution() {
        let spawner = answering(MARKED);
        let (spawner_for, programs) = spawner_for(Arc::clone(&spawner));
        let log = Logged::default();

        let home = wsl_record_home(&ubuntu(), &spawner_for, &log);

        assert_eq!(
            *programs.lock().unwrap_or_else(PoisonError::into_inner),
            [WslProgram::Path("sh".to_owned())]
        );
        let launches = spawner.launches();
        assert_eq!(launches.len(), 1);
        assert_eq!(launches[0].args, PROBE_ARGS);
        assert_eq!(launches[0].args[0], "-c");
        assert!(launches[0].args[1].starts_with("printf "));
        assert!(launches[0].env.is_empty());
        assert_eq!(launches[0].cwd.as_deref(), Some(r"\\wsl.localhost\Ubuntu\"));
        assert_eq!(
            home,
            Some(PathBuf::from(r"\\wsl.localhost\Ubuntu\home\me\.claude"))
        );
        assert_eq!(
            log.lines(),
            ["INFO WSL Ubuntu: the CLI's records were found"]
        );
    }

    #[test]
    fn each_way_to_no_place_logs_its_reason() {
        let ways = [
            (
                refusing(LaunchError::WslUnavailable {
                    distro: "Ubuntu".to_owned(),
                }),
                "the distribution was not found",
            ),
            (
                refusing(LaunchError::Spawn(io::ErrorKind::PermissionDenied)),
                "the probe could not be started",
            ),
            (silent(), "no answer within 5 seconds"),
            (
                answering(&["HOME=/home/me", "CLAUDE_AGENT_CONFIG=/home/me/c"]),
                "the answer had no CLAUDE_AGENT_HOME= line",
            ),
        ];
        for (spawner, reason) in ways {
            let log = Logged::default();

            assert_eq!(ask(&spawner, &log), None, "{reason}");

            assert_eq!(
                log.lines(),
                [format!(
                    "WARN WSL Ubuntu: the CLI's config directory could not be found ({reason})"
                )]
            );
            for line in log.lines() {
                assert!(!line.contains("/home"), "{line}");
                assert!(!line.contains("me"), "{line}");
            }
        }
    }

    #[test]
    fn the_probe_process_is_destroyed_on_every_way() {
        for spawner in [answering(MARKED), silent(), answering(&["nothing marked"])] {
            ask(&spawner, &Logged::default());

            let probes = spawner.probes();
            assert_eq!(probes.len(), 1);
            assert!(probes[0].destroyed());
            assert!(probes[0].forcibly_destroyed(), "the process is dropped too");
        }
    }

    #[test]
    fn a_found_home_is_kept_and_none_is_asked_again() {
        let asked = Arc::new(AtomicUsize::new(0));
        let counted = Arc::clone(&asked);
        let homes = RecordHomes::new(Arc::new(move |_| {
            match counted.fetch_add(1, Ordering::SeqCst) {
                0 => None,
                _ => Some(PathBuf::from(r"\\wsl.localhost\Ubuntu\home\me\.claude")),
            }
        }));
        let lower = WslLocation {
            distro: "ubuntu".to_owned(),
            linux_path: "/".to_owned(),
        };
        let found = Some(PathBuf::from(r"\\wsl.localhost\Ubuntu\home\me\.claude"));

        assert_eq!(homes.home(&ubuntu()), None);
        assert_eq!(homes.home(&lower), found);
        assert_eq!(homes.home(&ubuntu()), found);

        assert_eq!(asked.load(Ordering::SeqCst), 2);
    }
}
