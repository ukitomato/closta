//! The New Session dialog's decisions: where the session runs, what the folder lacks, the recent
//! folders, and the launch a folder makes. Nothing here touches the screen or the disk; the
//! checks come in through [`LaunchChecks`].

use std::sync::Arc;

use std::sync::atomic::AtomicBool;

use closta_core::ports::{SavedSessions, SavedSessionsError};
use closta_model::{SavedSessionSummary, SavedTranscript};
use closta_providers::claude::launch::wsl::{WslLocation, distro_named};
use closta_session::history::SavedListing;
use closta_session::launch::SessionLaunchPlanner;
use futures_lite::future;

use crate::copy;
use crate::slot::{SlotLaunch, SlotResume};
use crate::state::Ports;

/// Where a session's `claude` runs, decided by the folder.
#[derive(Clone, PartialEq, Eq, Debug)]
pub enum Runtime {
    Wsl { distro: String },
    Win32,
}

/// What a search of `PATH` for `claude` found.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ClaudeOnPath {
    Found,
    ScriptOnly,
    Missing,
}

/// What the dialog asks of the machine.
pub trait LaunchChecks: Send + Sync {
    fn installed_distros(&self) -> Vec<String>;
    fn claude_on_path(&self) -> ClaudeOnPath;
    fn default_distro(&self) -> Option<String>;
    fn folder_exists(&self, folder: &str) -> future::Boxed<bool>;
}

/// The planner that starts a session in `folder`.
pub trait PlannerFor: Send + Sync {
    fn planner(&self, folder: &str) -> Arc<dyn SessionLaunchPlanner>;
}

/// The sessions the CLI saved for a project, read in the background and never on the
/// foreground.
pub trait SavedFor: Send + Sync {
    /// The saved sessions of the project in `folder`; the same folder gives the same ones.
    fn saved(&self, folder: &str) -> Arc<dyn SavedSessions>;
    /// Reads the list in the background; `None` once `stop` turns true.
    fn list(&self, folder: &str, stop: Arc<AtomicBool>) -> future::Boxed<Option<SavedListing>>;
}

/// A [`SavedFor`] that finds nothing saved anywhere: the stand-in until the app has a real one.
pub struct NoSaved;

struct NothingSaved;

impl SavedSessions for NothingSaved {
    fn list(
        &self,
        _stop: &dyn Fn() -> bool,
    ) -> Result<Vec<SavedSessionSummary>, SavedSessionsError> {
        Ok(Vec::new())
    }

    fn read(
        &self,
        _id: &str,
        _stop: &dyn Fn() -> bool,
    ) -> Result<SavedTranscript, SavedSessionsError> {
        Err(SavedSessionsError::NoPlace)
    }
}

impl SavedFor for NoSaved {
    fn saved(&self, _folder: &str) -> Arc<dyn SavedSessions> {
        Arc::new(NothingSaved)
    }

    fn list(&self, _folder: &str, stop: Arc<AtomicBool>) -> future::Boxed<Option<SavedListing>> {
        Box::pin(async move {
            (!stop.load(std::sync::atomic::Ordering::SeqCst)).then(SavedListing::default)
        })
    }
}

/// What a folder lacks, in the order the dialog names it.
#[derive(Clone, PartialEq, Eq, Debug)]
pub enum Problem {
    DistroMissing(String),
    FolderMissing,
    ClaudeMissing,
    ScriptOnly,
}

/// The runtime `folder` asks for: WSL for a UNC path on a WSL host (the distribution's name as
/// typed), Windows for anything else.
pub fn runtime_of(folder: &str) -> Runtime {
    match WslLocation::parse(Some(folder.trim()), true) {
        Some(location) => Runtime::Wsl {
            distro: location.distro,
        },
        None => Runtime::Win32,
    }
}

pub fn problem_text(problem: &Problem) -> String {
    match problem {
        Problem::DistroMissing(distro) => copy::distro_missing(distro),
        Problem::FolderMissing => copy::FOLDER_MISSING.to_owned(),
        Problem::ClaudeMissing => copy::CLAUDE_EXE_MISSING.to_owned(),
        Problem::ScriptOnly => copy::CLAUDE_SCRIPT_ONLY.to_owned(),
    }
}

/// What `folder` lacks that is known without looking at the disk: a distribution that is not
/// installed, or no native `claude.exe` for a Windows folder. An empty folder lacks nothing.
pub fn quick_problem(folder: &str, checks: &dyn LaunchChecks) -> Option<Problem> {
    if folder.trim().is_empty() {
        return None;
    }
    match runtime_of(folder) {
        Runtime::Wsl { distro } => distro_named(&distro, &checks.installed_distros())
            .is_none()
            .then_some(Problem::DistroMissing(distro)),
        Runtime::Win32 => match checks.claude_on_path() {
            ClaudeOnPath::Found => None,
            ClaudeOnPath::ScriptOnly => Some(Problem::ScriptOnly),
            ClaudeOnPath::Missing => Some(Problem::ClaudeMissing),
        },
    }
}

/// The dialog's state.
#[derive(Clone, PartialEq, Eq, Debug, Default)]
pub struct NewSessionDialog {
    pub folder: String,
    pub problem: Option<Problem>,
    pub checking: bool,
}

impl NewSessionDialog {
    /// A folder is typed, nothing is known to be missing, and no check is running.
    pub fn can_start(&self) -> bool {
        !self.folder.trim().is_empty() && self.problem.is_none() && !self.checking
    }
}

/// How many recent folders are kept.
pub const RECENT_LIMIT: usize = 10;

/// The folders sessions were started in, newest first.
#[derive(Clone, PartialEq, Eq, Debug, Default)]
pub struct RecentFolders {
    folders: Vec<String>,
}

impl RecentFolders {
    /// Puts `folder` (trimmed) first, dropping an earlier copy and the oldest beyond
    /// [`RECENT_LIMIT`]. A blank folder is not kept.
    pub fn push(&mut self, folder: &str) {
        let folder = folder.trim();
        if folder.is_empty() {
            return;
        }
        self.folders.retain(|kept| kept != folder);
        self.folders.insert(0, folder.to_owned());
        self.folders.truncate(RECENT_LIMIT);
    }

    pub fn list(&self) -> &[String] {
        &self.folders
    }
}

/// The last non-empty part of `folder` (split at `\` and `/`): a session's title.
pub fn folder_title(folder: &str) -> String {
    folder
        .rsplit(['\\', '/'])
        .find(|part| !part.is_empty())
        .unwrap_or_default()
        .to_owned()
}

/// Where the folder field starts: the home of the default distribution.
pub fn default_folder(checks: &dyn LaunchChecks) -> Option<String> {
    let distro = checks.default_distro()?;
    Some(format!(r"\\wsl.localhost\{distro}\home"))
}

/// The launch of a session in `folder` (trimmed), a member of that folder's project. Its
/// relaunch makes the same launch again.
pub fn launch_in(folder: &str, ports: &Ports) -> SlotLaunch {
    let folder = folder.trim().to_owned();
    let again = {
        let folder = folder.clone();
        let ports = ports.clone();
        Arc::new(move || launch_in(&folder, &ports))
    };
    SlotLaunch {
        title: copy::NEW_SESSION_TITLE.to_owned(),
        planner: ports.planner_for.planner(&folder),
        working_directory: Some(folder.clone()),
        companion: None,
        relaunch: Some(again),
        project: Some(folder),
        settles_on_failure: false,
        session_id: None,
        resume: None,
    }
}

/// The launch that puts the saved session `summary` of the project in `folder` back, under its
/// own id and title. Its relaunch is the folder's, which starts a new session.
pub fn resume_in(folder: &str, summary: &SavedSessionSummary, ports: &Ports) -> SlotLaunch {
    let folder = folder.trim();
    SlotLaunch {
        title: summary.title.clone(),
        session_id: Some(summary.id.clone()),
        resume: Some(SlotResume {
            saved: ports.saved_for.saved(folder),
            saved_title: Some(summary.title.clone()),
        }),
        ..launch_in(folder, ports)
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;
    use std::sync::atomic::{AtomicUsize, Ordering};

    use closta_session::launch::{SessionLaunch, SessionLaunchPlanner};
    use closta_session::status::SessionFailure;
    use futures_lite::future;

    use super::*;
    use crate::copy;
    use crate::settings::MemorySettings;

    struct Machine {
        distros: Vec<String>,
        claude: ClaudeOnPath,
        default: Option<String>,
        folder_looks: AtomicUsize,
    }

    impl Machine {
        fn new(distros: &[&str], claude: ClaudeOnPath) -> Machine {
            Machine {
                distros: distros.iter().map(|d| (*d).to_owned()).collect(),
                claude,
                default: distros.first().map(|d| (*d).to_owned()),
                folder_looks: AtomicUsize::new(0),
            }
        }
    }

    impl LaunchChecks for Machine {
        fn installed_distros(&self) -> Vec<String> {
            self.distros.clone()
        }
        fn claude_on_path(&self) -> ClaudeOnPath {
            self.claude
        }
        fn default_distro(&self) -> Option<String> {
            self.default.clone()
        }
        fn folder_exists(&self, _folder: &str) -> future::Boxed<bool> {
            self.folder_looks.fetch_add(1, Ordering::SeqCst);
            Box::pin(async { true })
        }
    }

    struct Idle;

    impl SessionLaunchPlanner for Idle {
        fn plan(
            &self,
            _session_id: &str,
            _working_directory: Option<&str>,
        ) -> future::Boxed<Result<SessionLaunch, SessionFailure>> {
            Box::pin(async { Err(SessionFailure::ScriptOnly) })
        }
    }

    struct Planners {
        asked: std::sync::Mutex<Vec<String>>,
    }

    impl PlannerFor for Planners {
        fn planner(&self, folder: &str) -> Arc<dyn SessionLaunchPlanner> {
            self.asked.lock().unwrap().push(folder.to_owned());
            Arc::new(Idle)
        }
    }

    #[test]
    fn a_unc_folder_is_wsl_and_anything_else_win32() {
        assert_eq!(
            runtime_of(r"\\wsl.localhost\Ubuntu-26.04\home\x"),
            Runtime::Wsl {
                distro: "Ubuntu-26.04".into()
            }
        );
        for other in [r"C:\work", "/home/x", r"\\server\share", "", "relative"] {
            assert_eq!(runtime_of(other), Runtime::Win32, "{other}");
        }
    }

    #[test]
    fn a_wsl_folder_is_read_whatever_its_slashes_case_and_spaces() {
        let slashes = "  //wsl.localhost/ubuntu-26.04/home/x ";
        let dollar = r"\\WSL$\Ubuntu-26.04\home";
        assert_eq!(
            runtime_of(slashes),
            Runtime::Wsl {
                distro: "ubuntu-26.04".into()
            }
        );
        assert_eq!(
            runtime_of(dollar),
            Runtime::Wsl {
                distro: "Ubuntu-26.04".into()
            }
        );
        let machine = Machine::new(&["Ubuntu-26.04"], ClaudeOnPath::Missing);
        assert_eq!(quick_problem(slashes, &machine), None);
        assert_eq!(quick_problem(dollar, &machine), None);
    }

    #[test]
    fn problems_come_in_order_and_the_folder_is_not_looked_at() {
        let machine = Machine::new(&["Debian"], ClaudeOnPath::Missing);
        let missing = quick_problem(r"\\wsl.localhost\Ubuntu-26.04\home", &machine);
        assert_eq!(missing, Some(Problem::DistroMissing("Ubuntu-26.04".into())));
        assert_eq!(
            problem_text(&missing.unwrap()),
            "Ubuntu-26.04 is not installed."
        );
        assert_eq!(
            quick_problem(r"C:\work", &machine),
            Some(Problem::ClaudeMissing)
        );
        assert_eq!(
            problem_text(&Problem::ClaudeMissing),
            copy::CLAUDE_EXE_MISSING
        );
        let script = Machine::new(&[], ClaudeOnPath::ScriptOnly);
        assert_eq!(
            quick_problem(r"C:\work", &script),
            Some(Problem::ScriptOnly)
        );
        assert_eq!(problem_text(&Problem::ScriptOnly), copy::CLAUDE_SCRIPT_ONLY);
        assert_eq!(problem_text(&Problem::FolderMissing), copy::FOLDER_MISSING);
        let found = Machine::new(&[], ClaudeOnPath::Found);
        assert_eq!(quick_problem(r"C:\work", &found), None);
        for m in [&machine, &script, &found] {
            assert_eq!(m.folder_looks.load(Ordering::SeqCst), 0);
        }
    }

    #[test]
    fn an_empty_folder_cannot_start_and_says_nothing() {
        let machine = Machine::new(&[], ClaudeOnPath::Missing);
        assert_eq!(quick_problem("", &machine), None);
        assert_eq!(quick_problem("   ", &machine), None);
        let dialog = NewSessionDialog::default();
        assert!(!dialog.can_start());
        let ready = |folder: &str, problem, checking| NewSessionDialog {
            folder: folder.into(),
            problem,
            checking,
        };
        assert!(ready(r"C:\work", None, false).can_start());
        assert!(!ready("  ", None, false).can_start());
        assert!(!ready(r"C:\work", Some(Problem::FolderMissing), false).can_start());
        assert!(!ready(r"C:\work", None, true).can_start());
    }

    #[test]
    fn recent_folders_keep_ten_newest_first_without_repeats() {
        let mut recent = RecentFolders::default();
        for n in 0..12 {
            recent.push(&format!(r"C:\f{n}"));
        }
        assert_eq!(recent.list().len(), RECENT_LIMIT);
        assert_eq!(recent.list()[0], r"C:\f11");
        assert_eq!(recent.list()[9], r"C:\f2");
        recent.push(r"C:\f5");
        assert_eq!(recent.list().len(), RECENT_LIMIT);
        assert_eq!(recent.list()[0], r"C:\f5");
        assert_eq!(recent.list().iter().filter(|f| *f == r"C:\f5").count(), 1);
    }

    #[test]
    fn recent_folders_keep_a_folder_trimmed_and_never_a_blank_one() {
        let mut recent = RecentFolders::default();
        recent.push(r"C:\work");
        recent.push("   ");
        recent.push("");
        assert_eq!(recent.list(), [r"C:\work"]);
        recent.push(r"  C:\work  ");
        assert_eq!(recent.list(), [r"C:\work"]);
        recent.push("\tC:\\other\n");
        assert_eq!(recent.list(), [r"C:\other", r"C:\work"]);
    }

    #[test]
    fn the_title_is_the_last_part_of_the_folder() {
        assert_eq!(folder_title(r"C:\work\closta"), "closta");
        assert_eq!(folder_title(r"C:\work\closta\"), "closta");
        assert_eq!(folder_title(r"\\wsl.localhost\Ubuntu\home/x/proj/"), "proj");
        assert_eq!(folder_title(r"C:\"), "C:");
    }

    #[test]
    fn the_default_folder_is_the_default_distros_home() {
        let machine = Machine::new(&["Ubuntu-26.04", "Debian"], ClaudeOnPath::Found);
        assert_eq!(
            default_folder(&machine).as_deref(),
            Some(r"\\wsl.localhost\Ubuntu-26.04\home")
        );
        let none = Machine::new(&[], ClaudeOnPath::Found);
        assert_eq!(default_folder(&none), None);
    }

    #[test]
    fn a_launch_in_a_folder_relaunches_in_the_same_folder() {
        let planners = Arc::new(Planners {
            asked: std::sync::Mutex::new(Vec::new()),
        });
        let ports = Ports {
            checks: Arc::new(Machine::new(&[], ClaudeOnPath::Found)),
            planner_for: Arc::clone(&planners) as _,
            settings: Arc::new(MemorySettings),
            saved_for: Arc::new(NoSaved),
        };
        let launch = launch_in(r"  C:\work\closta ", &ports);
        assert_eq!(launch.title, "New session");
        assert_eq!(launch.project.as_deref(), Some(r"C:\work\closta"));
        assert_eq!(launch.working_directory.as_deref(), Some(r"C:\work\closta"));
        assert!(launch.companion.is_none());
        let again = (launch.relaunch.expect("a relaunch"))();
        assert_eq!(again.title, "New session");
        assert_eq!(again.project.as_deref(), Some(r"C:\work\closta"));
        assert_eq!(again.working_directory.as_deref(), Some(r"C:\work\closta"));
        assert!(again.relaunch.is_some());
        assert_eq!(
            *planners.asked.lock().unwrap(),
            [r"C:\work\closta", r"C:\work\closta"]
        );
    }
}
