//! A launch inside a WSL distribution: where the project is, the `wsl.exe` command line and its
//! `WSLENV`. Mirrors WslLocation.kt and WslSpawner.kt; the command line replaces what IntelliJ's
//! `patchCommandLine` built in IdeWsl.kt. Pure string rules, tested on any OS.

use std::collections::BTreeSet;
use std::ffi::OsString;
use std::fmt;
use std::path::PathBuf;

use super::{Launch, LaunchError};
use crate::claude::process::{AgentProcess, ProcessSpawner};

/// The script `/bin/sh -c` runs first: it finds the user's login shell (one that reads `"$@"` the
/// POSIX way, else `/bin/sh`) and has it `exec` the program with the arguments untouched, so
/// `~/.local/bin` is on `PATH`. `$0` is [`SHELL_NAME`], `$1` the program, the rest its arguments.
pub const WSL_BOOT: &str = r#"shell=$(getent passwd "$(id -un)" | cut -d: -f7)
case "$shell" in
  */bash|*/zsh|*/sh|*/dash|*/ksh) ;;
  *) shell=/bin/sh ;;
esac
exec "$shell" -l -c 'exec "$@"' "$0" "$@""#;

/// The `$0` of [`WSL_BOOT`]: the name a shell's error message starts with.
pub const SHELL_NAME: &str = "closta";

const HOSTS: [&str; 2] = ["wsl.localhost", "wsl$"];

/// A project that lives in a WSL distribution, as Windows sees it: the distribution's name and the
/// Linux path of the folder in it (starting with `/`; the distribution's root is `/`).
#[derive(Clone, PartialEq, Eq)]
pub struct WslLocation {
    pub distro: String,
    pub linux_path: String,
}

// Written by hand: the Linux path names the user, so only the distribution is shown.
impl fmt::Debug for WslLocation {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("WslLocation")
            .field("distro", &self.distro)
            .finish_non_exhaustive()
    }
}

impl WslLocation {
    /// The WSL location of `path`, or `None` when it is not one: the host is not Windows, or the
    /// path is not a UNC path on a WSL host (`wsl.localhost` or `wsl$`, in any case; `\` and `/`
    /// both separate), or it names no distribution.
    pub fn parse(path: Option<&str>, host_on_windows: bool) -> Option<WslLocation> {
        let slashed = path?.replace('\\', "/");
        let rest = slashed.strip_prefix("//").filter(|_| host_on_windows)?;
        let parts: Vec<&str> = rest.split('/').collect();
        let distro = parts.get(1).filter(|d| !d.is_empty())?;
        if !HOSTS.contains(&parts[0].to_lowercase().as_str()) {
            return None;
        }
        let inside: Vec<&str> = parts[2..]
            .iter()
            .copied()
            .filter(|p| !p.is_empty())
            .collect();
        Some(WslLocation {
            distro: (*distro).to_owned(),
            linux_path: format!("/{}", inside.join("/")),
        })
    }

    /// The UNC path (`\\wsl.localhost\<distro>\…`) Windows reads `linux` by.
    pub fn to_unc(&self, linux: &str) -> String {
        format!(
            r"\\wsl.localhost\{}{}",
            self.distro,
            linux.replace('/', "\\")
        )
    }

    /// The Linux path a launch in `working_dir` runs in: this location's own path for none, the
    /// Linux part of a UNC path in the same distribution (the name compared without regard to
    /// case), and [`LaunchError::WslUnavailable`] for anything else.
    pub fn linux_directory_of(&self, working_dir: Option<&str>) -> Result<String, LaunchError> {
        let Some(working_dir) = working_dir else {
            return Ok(self.linux_path.clone());
        };
        match WslLocation::parse(Some(working_dir), true) {
            Some(there) if same_ignoring_case(&there.distro, &self.distro) => Ok(there.linux_path),
            _ => Err(LaunchError::WslUnavailable {
                distro: self.distro.clone(),
            }),
        }
    }
}

/// The one of `installed` named `name`, without regard to case (a UNC host and a Windows name are
/// case-blind). The installed spelling is returned.
pub fn distro_named<'a>(name: &str, installed: &'a [String]) -> Option<&'a str> {
    installed
        .iter()
        .map(String::as_str)
        .find(|candidate| same_ignoring_case(candidate, name))
}

// Kotlin's `equals(ignoreCase = true)`, close enough for distribution names.
pub(super) fn same_ignoring_case(a: &str, b: &str) -> bool {
    a == b || a.to_lowercase() == b.to_lowercase()
}

/// What runs inside the distribution: `claude` from the login shell's `PATH`, or a path (tests).
#[derive(Clone, PartialEq, Eq)]
pub enum WslProgram {
    Claude,
    Path(String),
}

// Written by hand: a Linux path can name the user.
impl fmt::Debug for WslProgram {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            WslProgram::Claude => f.write_str("Claude"),
            WslProgram::Path(_) => f.write_str("Path(..)"),
        }
    }
}

/// The names of the installed WSL distributions. None are known yet: reading them from the
/// registry comes with starting `wsl.exe`.
pub fn installed_distros() -> Vec<String> {
    Vec::new()
}

/// Starts the program in the distribution of a WSL project, through `wsl.exe`. Mirrors
/// WslSpawner.kt. `wsl.exe` is not started yet: a launch whose distribution is installed still
/// fails with [`LaunchError::WslUnavailable`].
pub struct WslSpawner {
    location: WslLocation,
    program: WslProgram,
    #[expect(
        dead_code,
        reason = "the environment of wsl.exe, which is not started yet"
    )]
    dropped: BTreeSet<String>,
    inherited: Vec<(OsString, OsString)>,
    installed: Option<Vec<String>>,
}

impl WslSpawner {
    /// A spawner for `location` that inherits this process's environment as it is now.
    pub fn new(
        location: WslLocation,
        program: WslProgram,
        dropped: BTreeSet<String>,
    ) -> WslSpawner {
        WslSpawner {
            location,
            program,
            dropped,
            inherited: std::env::vars_os().collect(),
            installed: None,
        }
    }

    /// The same spawner taking `installed` as the installed distributions, instead of
    /// [`installed_distros`] at each launch.
    #[must_use]
    pub fn with_installed(self, installed: Vec<String>) -> WslSpawner {
        WslSpawner {
            installed: Some(installed),
            ..self
        }
    }

    /// The distribution this spawner starts in.
    pub fn distro(&self) -> &str {
        &self.location.distro
    }

    fn inherited_var(&self, name: &str) -> Option<String> {
        self.inherited
            .iter()
            .find(|(key, _)| key.to_string_lossy().eq_ignore_ascii_case(name))
            .map(|(_, value)| value.to_string_lossy().into_owned())
    }
}

// Only the distribution is named: nothing of a launch is in any string form.
impl fmt::Debug for WslSpawner {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "WslSpawner(distro={})", self.location.distro)
    }
}

impl ProcessSpawner for WslSpawner {
    fn spawn(&self, launch: &Launch) -> Result<Box<dyn AgentProcess>, LaunchError> {
        let unavailable = || LaunchError::WslUnavailable {
            distro: self.location.distro.clone(),
        };
        let listed;
        let installed = match &self.installed {
            Some(installed) => installed,
            None => {
                listed = installed_distros();
                &listed
            }
        };
        let distro = distro_named(&self.location.distro, installed).ok_or_else(unavailable)?;
        let system_root = self
            .inherited_var("SystemRoot")
            .unwrap_or_else(|| r"C:\Windows".to_owned());
        let _command = wsl_command(
            &self.location,
            distro,
            launch,
            &self.program,
            &system_root,
            self.inherited_var("WSLENV").as_deref(),
        )?;
        Err(unavailable())
    }
}

/// The `wsl.exe` process of one launch: the program, its arguments and the `WSLENV` to give it.
/// The launch's env values go into the process's environment, never into `args`.
#[derive(Clone, PartialEq, Eq)]
pub struct WslCommand {
    pub program: PathBuf,
    pub args: Vec<String>,
    pub wslenv: String,
}

// Written by hand: the args hold the `--cd` path, which names the user.
impl fmt::Debug for WslCommand {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "WslCommand({} args)", self.args.len())
    }
}

/// The `wsl.exe` command for `launch` at `location`. `distro` is the installed spelling of the
/// distribution's name (from [`distro_named`]); `system_root` is `%SystemRoot%`, so `wsl.exe` is
/// called by its absolute path.
pub fn wsl_command(
    location: &WslLocation,
    distro: &str,
    launch: &Launch,
    program: &WslProgram,
    system_root: &str,
    inherited_wslenv: Option<&str>,
) -> Result<WslCommand, LaunchError> {
    let directory = location.linux_directory_of(launch.cwd.as_deref())?;
    let program_arg = match program {
        WslProgram::Claude => "claude",
        WslProgram::Path(path) => path.as_str(),
    };
    let mut args: Vec<String> = [
        "--distribution",
        distro,
        "--cd",
        &directory,
        "--exec",
        "/bin/sh",
        "-c",
        WSL_BOOT,
        SHELL_NAME,
        program_arg,
    ]
    .into_iter()
    .map(str::to_owned)
    .collect();
    args.extend(launch.args.iter().cloned());
    Ok(WslCommand {
        program: PathBuf::from(format!(r"{system_root}\System32\wsl.exe")),
        args,
        wslenv: wslenv_value(inherited_wslenv, launch.env.names()),
    })
}

/// The `WSLENV` that passes `names` into Linux: the inherited entries in order (empty ones
/// dropped), except an entry whose name before `/` is exactly one of `names` (case-sensitive),
/// then each of `names` once as `<NAME>/u`, joined by `:`.
pub fn wslenv_value<'a>(inherited: Option<&str>, names: impl Iterator<Item = &'a str>) -> String {
    let mut added: Vec<&str> = Vec::new();
    for name in names {
        if !added.contains(&name) {
            added.push(name);
        }
    }
    let kept = inherited
        .unwrap_or_default()
        .split(':')
        .filter(|entry| !entry.is_empty())
        .filter(|entry| {
            let name = entry.split_once('/').map_or(*entry, |(name, _)| name);
            !added.contains(&name)
        })
        .map(str::to_owned);
    kept.chain(added.iter().map(|name| format!("{name}/u")))
        .collect::<Vec<_>>()
        .join(":")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::claude::launch::spec::{CHECKPOINTING_ENV, LaunchSpec};
    #[cfg(unix)]
    use crate::claude::launch::spec::{SANDBOX_SETTINGS, TOOL_USE_PROMPT};

    fn parse(path: &str) -> Option<WslLocation> {
        WslLocation::parse(Some(path), true)
    }

    fn at(distro: &str, linux_path: &str) -> WslLocation {
        WslLocation {
            distro: distro.to_owned(),
            linux_path: linux_path.to_owned(),
        }
    }

    fn launch(args: &[&str], env: &[(&str, &str)], cwd: Option<&str>) -> Launch {
        Launch {
            args: args.iter().map(|a| (*a).to_owned()).collect(),
            env: env
                .iter()
                .map(|(k, v)| ((*k).to_owned(), (*v).to_owned()))
                .collect(),
            cwd: cwd.map(str::to_owned),
        }
    }

    #[test]
    fn a_unc_path_on_a_wsl_host_is_split_into_the_distribution_and_the_linux_path() {
        assert_eq!(
            parse(r"\\wsl.localhost\Ubuntu\home\u\p"),
            Some(at("Ubuntu", "/home/u/p"))
        );
        assert_eq!(
            parse("//wsl.localhost/Ubuntu/home/u/p"),
            Some(at("Ubuntu", "/home/u/p"))
        );
        assert_eq!(
            parse(r"\\wsl$\Ubuntu-26.04\home\u\p"),
            Some(at("Ubuntu-26.04", "/home/u/p"))
        );
        assert_eq!(parse(r"\\WSL.LOCALHOST\Ubuntu\"), Some(at("Ubuntu", "/")));
        assert_eq!(parse(r"\\wsl.localhost\Ubuntu"), Some(at("Ubuntu", "/")));
    }

    #[test]
    fn anything_else_is_not_a_wsl_project() {
        assert_eq!(parse(r"C:\work\p"), None);
        assert_eq!(parse("/home/u/p"), None);
        assert_eq!(parse(r"\\server\share\p"), None);
        assert_eq!(parse(r"\\wsl.localhost\"), None);
        assert_eq!(parse(r"\\wsl.localhost"), None);
        assert_eq!(WslLocation::parse(None, true), None);
        assert_eq!(
            WslLocation::parse(Some(r"\\wsl.localhost\Ubuntu\home\u\p"), false),
            None
        );
    }

    #[test]
    fn the_unc_path_of_a_linux_path() {
        let location = at("Ubuntu", "/home/u/p");
        assert_eq!(
            location.to_unc("/home/u/.claude"),
            r"\\wsl.localhost\Ubuntu\home\u\.claude"
        );
        assert_eq!(location.to_unc("/"), r"\\wsl.localhost\Ubuntu\");
    }

    #[test]
    fn the_working_folder_is_the_own_path_or_the_linux_part_of_a_unc_path_in_the_same_distribution()
    {
        let location = at("Ubuntu", "/home/u/p");
        assert_eq!(
            location.linux_directory_of(None).as_deref(),
            Ok("/home/u/p")
        );
        assert_eq!(
            location
                .linux_directory_of(Some(r"\\wsl.localhost\Ubuntu\home\u\p\wt"))
                .as_deref(),
            Ok("/home/u/p/wt")
        );
        assert_eq!(
            location
                .linux_directory_of(Some("//WSL$/UBUNTU/srv"))
                .as_deref(),
            Ok("/srv")
        );
    }

    #[test]
    fn a_working_folder_in_another_distribution_or_outside_wsl_cannot_be_started() {
        let location = at("Ubuntu", "/home/u/p");
        let unavailable = Err(LaunchError::WslUnavailable {
            distro: "Ubuntu".to_owned(),
        });
        assert_eq!(
            location.linux_directory_of(Some(r"\\wsl.localhost\Debian\x")),
            unavailable
        );
        assert_eq!(location.linux_directory_of(Some(r"C:\work")), unavailable);
    }

    #[test]
    fn a_distribution_is_found_without_regard_to_case() {
        let installed = ["Ubuntu-26.04".to_owned(), "Debian".to_owned()];
        assert_eq!(
            distro_named("UBUNTU-26.04", &installed),
            Some("Ubuntu-26.04")
        );
        assert_eq!(distro_named("debian", &installed), Some("Debian"));
        assert_eq!(distro_named("Arch", &installed), None);
    }

    fn command(location: &WslLocation, launch: &Launch) -> Result<WslCommand, LaunchError> {
        wsl_command(
            location,
            "Ubuntu",
            launch,
            &WslProgram::Claude,
            r"C:\Windows",
            None,
        )
    }

    #[test]
    fn the_arguments_and_the_environment_go_through_in_the_linux_folder() {
        let location = at("ubuntu", "/home/u/p");
        let launch = launch(
            &["-p"],
            &[("ANTHROPIC_API_KEY", "test-secret-value")],
            Some(r"\\wsl.localhost\UBUNTU\home\u\p\wt"),
        );
        let made = command(&location, &launch).expect("in the distribution");
        assert_eq!(made.args[3], "/home/u/p/wt");
        assert_eq!(made.args[made.args.len() - 2..], ["claude", "-p"]);
        assert_eq!(made.wslenv, "ANTHROPIC_API_KEY/u");
        assert!(!made.args.iter().any(|a| a.contains("test-secret-value")));
    }

    #[test]
    fn no_working_folder_runs_in_the_locations_own_folder() {
        let made =
            command(&at("ubuntu", "/home/u/p"), &launch(&[], &[], None)).expect("own folder");
        assert_eq!(made.args[2..4], ["--cd", "/home/u/p"]);
    }

    #[test]
    fn a_working_folder_in_another_distribution_is_not_started() {
        let launch = launch(&[], &[], Some(r"\\wsl.localhost\Debian\home\u"));
        assert_eq!(
            command(&at("ubuntu", "/home/u/p"), &launch),
            Err(LaunchError::WslUnavailable {
                distro: "ubuntu".to_owned()
            })
        );
    }

    #[test]
    fn the_wsl_argv_is_boot_then_claude_then_the_args() {
        let location = at("ubuntu-26.04", "/home/u/p");
        let launch = launch(&["-p", "--verbose"], &[], None);
        let made = wsl_command(
            &location,
            "Ubuntu-26.04",
            &launch,
            &WslProgram::Claude,
            r"C:\Windows",
            None,
        )
        .expect("own folder");
        assert_eq!(made.program, PathBuf::from(r"C:\Windows\System32\wsl.exe"));
        assert_eq!(
            made.args,
            [
                "--distribution",
                "Ubuntu-26.04",
                "--cd",
                "/home/u/p",
                "--exec",
                "/bin/sh",
                "-c",
                WSL_BOOT,
                "closta",
                "claude",
                "-p",
                "--verbose",
            ]
        );

        let fake = wsl_command(
            &location,
            "Ubuntu-26.04",
            &launch,
            &WslProgram::Path("/x/fake".to_owned()),
            r"C:\Windows",
            None,
        )
        .expect("own folder");
        assert_eq!(fake.args[9..], ["/x/fake", "-p", "--verbose"]);
    }

    #[test]
    fn env_values_never_reach_the_wsl_argv() {
        let mut spec = LaunchSpec::new("s");
        spec.env.insert("ANTHROPIC_API_KEY", "sk-secret");
        let launch = Launch::of(&spec).expect("a valid spec");
        let made = command(&at("Ubuntu", "/home/u/p"), &launch).expect("own folder");
        assert!(!made.args.iter().any(|a| a.contains("sk-secret")));
        assert_eq!(
            made.wslenv,
            format!("ANTHROPIC_API_KEY/u:{CHECKPOINTING_ENV}/u")
        );
        assert!(!format!("{made:?}").contains("sk-secret"));
    }

    #[test]
    fn a_folder_with_spaces_and_cjk_is_one_cd_argument() {
        let launch = launch(
            &[],
            &[],
            Some(r"\\wsl.localhost\Ubuntu-26.04\home\u\My Project 日本"),
        );
        let made = wsl_command(
            &at("Ubuntu-26.04", "/home/u"),
            "Ubuntu-26.04",
            &launch,
            &WslProgram::Claude,
            r"C:\Windows",
            None,
        )
        .expect("in the distribution");
        assert_eq!(made.args[3], "/home/u/My Project 日本");
    }

    #[test]
    fn the_debug_of_a_location_names_the_distribution_and_no_path() {
        let shown = format!("{:?}", at("Ubuntu", "/home/someone/p"));
        assert_eq!(shown, r#"WslLocation { distro: "Ubuntu", .. }"#);
        assert!(!shown.contains("someone"), "{shown}");
    }

    #[test]
    fn the_debug_of_a_command_counts_the_args_and_shows_no_folder() {
        let made = command(
            &at("Ubuntu", "/home/someone/p"),
            &launch(&["-p"], &[], None),
        )
        .expect("own folder");
        assert_eq!(format!("{made:?}"), "WslCommand(11 args)");
    }

    #[test]
    fn wslenv_keeps_what_was_there_and_adds_each_name_once() {
        let names = ["ANTHROPIC_MODEL", CHECKPOINTING_ENV];
        assert_eq!(
            wslenv_value(
                Some("USERPROFILE/p:anthropic_model/u:ANTHROPIC_MODEL/l:"),
                names.into_iter()
            ),
            format!("USERPROFILE/p:anthropic_model/u:ANTHROPIC_MODEL/u:{CHECKPOINTING_ENV}/u")
        );
        assert_eq!(
            wslenv_value(None, names.into_iter()),
            format!("ANTHROPIC_MODEL/u:{CHECKPOINTING_ENV}/u")
        );
        assert_eq!(
            wslenv_value(Some("A/u"), ["B", "B"].into_iter()),
            "A/u:B/u",
            "a name given twice is added once"
        );
    }

    // The cases of the wsl.exe argv probe, which all went through wsl.exe and this boot unchanged.
    #[cfg(unix)]
    fn cases() -> Vec<String> {
        vec![
            "plain".into(),
            "a b".into(),
            "  lead and trail  ".into(),
            String::new(),
            r#"say "hi""#.into(),
            r"C:\path\".into(),
            r"back\\slash".into(),
            r#"\""#.into(),
            r#"a\\"b"#.into(),
            "'single'".into(),
            "$HOME $(id) ".to_owned() + "`x`",
            "%PATH%".into(),
            "x;y&z|w<>^".into(),
            "日本語 😀".into(),
            SANDBOX_SETTINGS.into(),
            TOOL_USE_PROMPT.into(),
        ]
    }

    #[cfg(unix)]
    #[test]
    fn boot_hands_the_arguments_to_the_shell_unchanged() {
        // An empty HOME, so the user's own login files are not read.
        let home = std::env::temp_dir().join(format!("closta-wsl-boot-{}", std::process::id()));
        std::fs::create_dir_all(&home).expect("a scratch home");
        let output = std::process::Command::new("/bin/sh")
            .env_clear()
            .env("HOME", &home)
            .env("PATH", "/usr/bin:/bin")
            .args(["-c", WSL_BOOT, SHELL_NAME, "printf", "%s\\0"])
            .args(cases())
            .output();
        std::fs::remove_dir_all(&home).expect("the scratch home goes");
        let output = output.expect("/bin/sh runs");
        assert!(output.status.success(), "{:?}", output.status);
        let mut got: Vec<String> = output
            .stdout
            .split(|b| *b == 0)
            .map(|piece| String::from_utf8_lossy(piece).into_owned())
            .collect();
        assert_eq!(got.pop().as_deref(), Some(""), "every case ends with a NUL");
        assert_eq!(got, cases());
    }
}
