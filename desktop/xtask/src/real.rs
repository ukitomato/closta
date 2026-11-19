//! `cargo xtask win-real`: runs the replay build against the real CLI on Windows twice and
//! judges what `real.ps1` saw. The first run opens a WSL folder and a Windows folder and closes
//! itself; the second opens a WSL folder whose CLI starts a fake MCP server (the grandchild) and
//! is closed as by its close button. No prompt is ever sent: each run goes as far as `Running`.
//!
//! Only what a run started is counted and stopped: the app's descendants and the WSL processes
//! that carry the run's mark. Nothing is matched by the name `claude` or `wsl`, so the user's
//! own sessions are left alone.

use std::path::Path;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{Context, bail};
use cargo_metadata::MetadataCommand;

use crate::check::LOCK;
use crate::perf_log::Outcome;
use crate::win::{SHOTS, SHOTS_WSL, ShotOutcome, WIN_COPY, exe_path, powershell_command, quoted};

/// The Windows folder the first run opens.
pub const WIN_FOLDER: &str = r"C:\dev\tools\closta";
/// The first run's picture, at the app's default size.
pub const SHOT: &str = r"C:\dev\tools\closta\shots\real-1600x1000.png";
/// How long the first run stays open after every slot is `Running`.
const CLOSE_AFTER_MS: &str = "3000";
/// How long after its close began a window may take to go.
const GONE_LIMIT_MS: u64 = 10_000;

pub const NO_CONSOLE: &str = "no console window opened";
pub const ALL_RUNNING: &str = "every slot Running";
pub const GONE: &str = "window gone within 10 s";
pub const MARKED: &str = "marked WSL processes seen";
pub const KIDS_SEEN: &str = "Windows descendants seen";
pub const NO_WINDOWS_LEFT: &str = "no Windows process left";
pub const NO_WSL_LEFT: &str = "no marked WSL process left";
pub const HOLD_SEEN: &str = "hold seen";
pub const HOLD_GONE: &str = "hold alive before the close, gone after";
pub const SHOT_TAKEN: &str = "shot";

/// `linux_path` in `distro`, as Windows sees it.
pub fn wsl_unc(distro: &str, linux_path: &str) -> String {
    let inside = linux_path.trim_end_matches('/').replace('/', "\\");
    format!(r"\\wsl.localhost\{distro}{inside}")
}

/// The run's own folder in WSL: under `/tmp`, so no path in it names the user.
fn run_dir(mark: &str) -> String {
    format!("/tmp/{mark}")
}

/// Where the fake MCP server writes `hold-<pid>`, as WSL sees it.
pub fn hold_dir(mark: &str) -> String {
    format!("{}/hold", run_dir(mark))
}

/// The MCP config the second run hands the CLI, as WSL sees it.
pub fn mcp_config_path(mark: &str) -> String {
    format!("{}/mcp.json", run_dir(mark))
}

/// An MCP config with one server: the fake CLI, by its Linux path, holding in `hold_dir`.
pub fn mcp_config_json(fake_cli: &str, hold_dir: &str) -> String {
    serde_json::json!({
        "mcpServers": {
            "closta-hold": { "command": fake_cli, "args": ["--hold", hold_dir] }
        }
    })
    .to_string()
}

/// The first run: both folders, the mark, the ready file, and a close of its own.
pub fn close_run_args(wsl_folder: &str, win_folder: &str, mark: &str, ready: &str) -> Vec<String> {
    [
        "--open-folder",
        wsl_folder,
        "--open-folder",
        win_folder,
        "--mark-children",
        mark,
        "--ready-file",
        ready,
        "--close-after",
        CLOSE_AFTER_MS,
    ]
    .map(str::to_owned)
    .to_vec()
}

/// The second run: one WSL folder with the MCP config, the mark and the ready file. It is
/// closed by the script, as by the close button.
pub fn hold_run_args(wsl_folder: &str, mcp_config: &str, mark: &str, ready: &str) -> Vec<String> {
    [
        "--open-folder",
        wsl_folder,
        "--mcp-config",
        mcp_config,
        "--mark-children",
        mark,
        "--ready-file",
        ready,
    ]
    .map(str::to_owned)
    .to_vec()
}

/// How a run ends: by its own timed close, or by the script closing its window.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Mode {
    Close,
    Hold,
}

/// One run of `real.ps1`.
pub struct RealRun {
    pub mode: Mode,
    pub args: Vec<String>,
    /// The ready file, as Windows sees it.
    pub ready: String,
    pub distro: String,
    pub mark: String,
    /// Where the picture goes (the close run only).
    pub shot: Option<String>,
    /// The hold dir, as Windows sees it (the hold run only).
    pub hold_dir: Option<String>,
}

/// The PowerShell that runs `real.ps1` for `run` with the release exe.
pub fn real_script(run: &RealRun) -> String {
    let mode = match run.mode {
        Mode::Close => "Close",
        Mode::Hold => "Hold",
    };
    let args: Vec<String> = run.args.iter().map(|it| quoted(it)).collect();
    let mut script = format!(
        "& {} -Mode {mode} -Exe {} -ArgList @({}) -ReadyFile {} -Distro {} -Mark {}",
        quoted(&format!(r"{WIN_COPY}\xtask\scripts\real.ps1")),
        quoted(&exe_path(true)),
        args.join(","),
        quoted(&run.ready),
        quoted(&run.distro),
        quoted(&run.mark),
    );
    if let Some(shot) = &run.shot {
        script.push_str(&format!(" -Shot {}", quoted(shot)));
    }
    if let Some(hold_dir) = &run.hold_dir {
        script.push_str(&format!(" -HoldDir {}", quoted(hold_dir)));
    }
    script.push_str("; exit $LASTEXITCODE");
    script
}

/// What both runs saw, the worse of the two where both say it.
#[derive(Clone, PartialEq, Eq, Debug, Default)]
pub struct RealReport {
    /// The console windows before the run with the largest rise, and the most seen during it.
    pub consoles_before: u32,
    pub consoles_max: u32,
    /// Every slot's line, of both runs.
    pub ready: Vec<String>,
    pub shot: Option<ShotOutcome>,
    /// The slowest window to go after its close began; `None` when one never went.
    pub gone_ms: Option<u64>,
    /// The fewest marked WSL processes a run saw once it was ready.
    pub marked_wsl: u32,
    /// The fewest Windows descendants of the exe a run remembered once it was ready.
    pub kids: u32,
    /// What was left after the windows went, of both runs. A count not taken is `u32::MAX`.
    pub left_windows: u32,
    pub left_wsl: u32,
    pub hold_pid: Option<u32>,
    pub hold_alive_before: Option<bool>,
    pub hold_left: Option<bool>,
}

/// A count the script printed; one it could not take counts as many.
fn count(text: &str) -> u32 {
    text.trim().parse().unwrap_or(u32::MAX)
}

fn yes(text: &str) -> Option<bool> {
    match text.trim() {
        "yes" => Some(true),
        "no" => Some(false),
        _ => None,
    }
}

/// Reads the lines `real.ps1` printed, of one run or of both runs one after the other.
pub fn parse_report(output: &str) -> RealReport {
    let mut report = RealReport::default();
    let mut before = None;
    let mut worst_rise = None;
    let mut marked: Option<u32> = None;
    let mut kids: Option<u32> = None;
    // Each run starts with its `CONSOLES` line; one that said no count says none was seen.
    let (mut runs, mut marked_runs, mut kids_runs) = (0, 0, 0);
    let mut gone: Option<Option<u64>> = None;
    for line in output.lines().map(str::trim) {
        if let Some(max) = line.strip_prefix("CONSOLES MAX ") {
            let max = count(max);
            let before = before.take().unwrap_or(0);
            let rise = max.saturating_sub(before);
            if worst_rise.is_none_or(|worst| rise > worst) {
                worst_rise = Some(rise);
                report.consoles_before = before;
                report.consoles_max = max;
            }
        } else if let Some(n) = line.strip_prefix("CONSOLES ") {
            before = Some(count(n));
            runs += 1;
        } else if let Some(slots) = line.strip_prefix("READY ") {
            report.ready.extend(
                slots
                    .split(';')
                    .filter(|it| !it.is_empty())
                    .map(str::to_owned),
            );
        } else if let Some(n) = line.strip_prefix("MARKED wsl=") {
            // Seen only when counted: a count WSL could not give is none.
            let n = n.trim().parse().unwrap_or(0);
            marked = Some(marked.map_or(n, |seen: u32| seen.min(n)));
            marked_runs += 1;
        } else if let Some(n) = line.strip_prefix("KIDS ") {
            let n = n.trim().parse().unwrap_or(0);
            kids = Some(kids.map_or(n, |seen: u32| seen.min(n)));
            kids_runs += 1;
        } else if let Some(why) = line.strip_prefix("SHOT HELD") {
            report.shot = Some(match why.trim() {
                "locked" => ShotOutcome::Locked,
                "blank" => ShotOutcome::Blank,
                _ => ShotOutcome::NoWindow,
            });
        } else if let Some(png) = line.strip_prefix("SHOT ") {
            report.shot = Some(ShotOutcome::Saved(png.to_owned()));
        } else if line == "NOT GONE" {
            gone = Some(None);
        } else if let Some(ms) = line.strip_prefix("GONE ") {
            let ms = ms.trim().parse().ok();
            gone = match (gone, ms) {
                (Some(None), _) | (_, None) => Some(None),
                (Some(Some(seen)), Some(ms)) => Some(Some(u64::max(seen, ms))),
                (None, Some(ms)) => Some(Some(ms)),
            };
        } else if let Some(n) = line.strip_prefix("LEFT windows=") {
            report.left_windows = report.left_windows.saturating_add(count(n));
        } else if let Some(n) = line.strip_prefix("LEFT wsl=") {
            report.left_wsl = report.left_wsl.saturating_add(count(n));
        } else if let Some(alive) = line.strip_prefix("HOLD ALIVE ") {
            report.hold_alive_before = yes(alive);
        } else if let Some(left) = line.strip_prefix("HOLD LEFT ") {
            report.hold_left = yes(left);
        } else if let Some(pid) = line.strip_prefix("HOLD ") {
            report.hold_pid = pid.trim().parse().ok();
        }
    }
    report.marked_wsl = if marked_runs < runs {
        0
    } else {
        marked.unwrap_or(0)
    };
    report.kids = if kids_runs < runs {
        0
    } else {
        kids.unwrap_or(0)
    };
    report.gone_ms = gone.flatten();
    report
}

/// Whether a run's output got as far as both leftover counts: a script that died sooner says
/// nothing about what it left.
pub fn finished(output: &str) -> bool {
    let lines: Vec<&str> = output.lines().map(str::trim).collect();
    ["LEFT windows=", "LEFT wsl="]
        .iter()
        .all(|prefix| lines.iter().any(|line| line.starts_with(prefix)))
}

fn judged(pass: bool) -> Outcome {
    if pass { Outcome::Pass } else { Outcome::Fail }
}

/// Each check and how it came out. Only the picture can be held; everything else passes or
/// fails.
pub fn verdicts(report: &RealReport) -> Vec<(&'static str, Outcome)> {
    let all_running =
        !report.ready.is_empty() && report.ready.iter().all(|it| it.starts_with("Running "));
    let shot = match report.shot {
        Some(ShotOutcome::Saved(_)) => Outcome::Pass,
        _ => Outcome::Held,
    };
    vec![
        (
            NO_CONSOLE,
            judged(report.consoles_max <= report.consoles_before),
        ),
        (ALL_RUNNING, judged(all_running)),
        (
            GONE,
            judged(report.gone_ms.is_some_and(|ms| ms <= GONE_LIMIT_MS)),
        ),
        // No marked process seen means the leftover count below proves nothing.
        (MARKED, judged(report.marked_wsl > 0)),
        // No descendant remembered means the Windows leftover count proves nothing.
        (KIDS_SEEN, judged(report.kids > 0)),
        (NO_WINDOWS_LEFT, judged(report.left_windows == 0)),
        (NO_WSL_LEFT, judged(report.left_wsl == 0)),
        (HOLD_SEEN, judged(report.hold_pid.is_some())),
        // A grandchild that was dead before the close would pass by its file alone.
        (
            HOLD_GONE,
            judged(report.hold_alive_before == Some(true) && report.hold_left == Some(false)),
        ),
        (SHOT_TAKEN, shot),
    ]
}

fn outcome_word(outcome: Outcome) -> &'static str {
    match outcome {
        Outcome::Pass => "pass",
        Outcome::Fail => "FAIL",
        Outcome::Held => "held",
    }
}

fn shown<T: ToString>(value: Option<T>) -> String {
    value.map_or_else(|| "-".to_owned(), |value| value.to_string())
}

/// The table of verdicts and what they were judged on. No path: the picture is only `saved`.
pub fn table(report: &RealReport) -> String {
    let shot = match &report.shot {
        Some(ShotOutcome::Saved(_)) => "saved",
        Some(ShotOutcome::Locked) => "the screen is locked",
        Some(ShotOutcome::Blank) => "blank",
        Some(_) => "no window",
        None => "not taken",
    };
    let values = [
        format!("{} -> {}", report.consoles_before, report.consoles_max),
        report.ready.join("; "),
        shown(report.gone_ms.map(|ms| format!("{ms} ms"))),
        report.marked_wsl.to_string(),
        report.kids.to_string(),
        report.left_windows.to_string(),
        report.left_wsl.to_string(),
        shown(report.hold_pid),
        format!(
            "before {} / after {}",
            shown(report.hold_alive_before),
            shown(report.hold_left)
        ),
        shot.to_owned(),
    ];
    let mut lines = vec![
        "| check | seen | outcome |".to_owned(),
        "|---|---|---|".to_owned(),
    ];
    for ((name, outcome), value) in verdicts(report).iter().zip(values) {
        lines.push(format!("| {name} | {value} | {} |", outcome_word(*outcome)));
    }
    lines.join("\n")
}

/// Builds the fake CLI for Linux and says where it is.
fn build_fake_cli(root: &Path) -> anyhow::Result<String> {
    println!("==> cargo build the fake CLI");
    let status = Command::new("flock")
        .args([
            LOCK,
            "cargo",
            "build",
            "-j",
            "4",
            "-p",
            "closta-providers",
            "--features",
            "fake",
            "--bin",
            "closta-fake-claude",
        ])
        .current_dir(root)
        .status()
        .context("could not start `cargo build` for the fake CLI")?;
    if !status.success() {
        bail!("building the fake CLI failed with {status}");
    }
    let metadata = MetadataCommand::new()
        .current_dir(root)
        .no_deps()
        .exec()
        // Its error can quote cargo's stderr, which can hold paths.
        .map_err(|_| anyhow::anyhow!("`cargo metadata` failed"))?;
    Ok(metadata
        .target_directory
        .join("debug")
        .join("closta-fake-claude")
        .into_string())
}

/// Runs `real.ps1` for `run` and returns what it printed.
fn run_script(run: &RealRun, what: &str) -> anyhow::Result<String> {
    println!("==> win-real: the {what} run");
    let (program, args) = powershell_command(&real_script(run));
    let output = Command::new(&program)
        .args(&args)
        .output()
        .with_context(|| format!("could not start `{program}` for powershell.exe"))?;
    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    // Neither stdout nor stderr is printed: they can hold paths.
    if !finished(&stdout) {
        bail!(
            "real.ps1 for the {what} run ended with {} before it counted what was left",
            output.status
        );
    }
    Ok(stdout)
}

/// Both runs, from the folders to the output of each.
fn run_both(root: &Path, mark: &str, distro: &str) -> anyhow::Result<String> {
    let fake_cli = build_fake_cli(root)?;
    std::fs::create_dir_all(hold_dir(mark)).context("could not create the run's folder")?;
    std::fs::write(
        mcp_config_path(mark),
        mcp_config_json(&fake_cli, &hold_dir(mark)),
    )
    .context("could not write the MCP config")?;
    std::fs::create_dir_all(SHOTS_WSL).context("could not create the shots folder")?;
    let repo = root
        .parent()
        .context("desktop/ has no parent folder")?
        .to_str()
        .context("the repository's path is not UTF-8")?;
    let wsl_folder = wsl_unc(distro, repo);

    let ready = format!(r"{SHOTS}\real-close.ready");
    let close = run_script(
        &RealRun {
            mode: Mode::Close,
            args: close_run_args(&wsl_folder, WIN_FOLDER, mark, &ready),
            ready,
            distro: distro.to_owned(),
            mark: mark.to_owned(),
            shot: Some(SHOT.to_owned()),
            hold_dir: None,
        },
        "close",
    )?;
    let ready = format!(r"{SHOTS}\real-hold.ready");
    let hold = run_script(
        &RealRun {
            mode: Mode::Hold,
            args: hold_run_args(&wsl_folder, &mcp_config_path(mark), mark, &ready),
            ready,
            distro: distro.to_owned(),
            mark: mark.to_owned(),
            shot: None,
            hold_dir: Some(wsl_unc(distro, &hold_dir(mark))),
        },
        "hold",
    )?;
    Ok(close + &hold)
}

/// `cargo xtask win-real`: builds the replay exe, runs it against the real CLI twice and prints
/// the verdicts. Fails when one failed or a run could not be judged.
pub fn win_real(root: &Path) -> anyhow::Result<()> {
    let distro = std::env::var("WSL_DISTRO_NAME")
        .context("WSL_DISTRO_NAME is not set: win-real runs from WSL")?;
    crate::win::win_build(root, true, false, &["closta/replay".to_owned()])?;
    let unix_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let mark = format!("closta-real-{unix_ms}");
    let output = run_both(root, &mark, &distro);
    // The run's folder goes whatever happened.
    let removed = match std::fs::remove_dir_all(run_dir(&mark)) {
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
        other => other,
    };
    let report = parse_report(&output?);
    removed.context("could not remove the run's folder")?;
    println!("{}", table(&report));
    let failed: Vec<&str> = verdicts(&report)
        .into_iter()
        .filter(|(_, outcome)| *outcome == Outcome::Fail)
        .map(|(name, _)| name)
        .collect();
    if !failed.is_empty() {
        bail!("failed: {}", failed.join(", "));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn strings(parts: &[&str]) -> Vec<String> {
        parts.iter().map(|part| (*part).to_owned()).collect()
    }

    fn outcome(judged: &[(&'static str, Outcome)], name: &str) -> Outcome {
        judged
            .iter()
            .find(|(it, _)| *it == name)
            .unwrap_or_else(|| panic!("no verdict {name}"))
            .1
    }

    /// What both runs print when everything went right.
    const PASSING: &str = "CONSOLES 2\n\
        READY Running 2.1.3;Running 2.1.3\n\
        MARKED wsl=3\n\
        KIDS 4\n\
        SHOT C:\\dev\\tools\\closta\\shots\\real-1600x1000.png\n\
        CONSOLES MAX 2\n\
        GONE 1840\n\
        LEFT windows=0\n\
        LEFT wsl=0\n\
        CONSOLES 2\n\
        READY Running 2.1.3\n\
        MARKED wsl=2\n\
        KIDS 2\n\
        HOLD 4242\n\
        HOLD ALIVE yes\n\
        CONSOLES MAX 2\n\
        GONE 950\n\
        LEFT windows=0\n\
        LEFT wsl=0\n\
        HOLD LEFT no\n";

    #[test]
    fn the_close_run_opens_both_folders_with_a_mark_and_closes_itself() {
        let args = close_run_args(
            r"\\wsl.localhost\Ubuntu\repo",
            WIN_FOLDER,
            "closta-real-1",
            r"C:\dev\tools\closta\shots\real-close.ready",
        );
        assert_eq!(
            args,
            strings(&[
                "--open-folder",
                r"\\wsl.localhost\Ubuntu\repo",
                "--open-folder",
                r"C:\dev\tools\closta",
                "--mark-children",
                "closta-real-1",
                "--ready-file",
                r"C:\dev\tools\closta\shots\real-close.ready",
                "--close-after",
                "3000",
            ])
        );
    }

    #[test]
    fn the_hold_run_passes_the_mcp_config_and_no_close_after() {
        let args = hold_run_args(
            r"\\wsl.localhost\Ubuntu\repo",
            "/tmp/closta-real-1/mcp.json",
            "closta-real-1",
            r"C:\dev\tools\closta\shots\real-hold.ready",
        );
        assert_eq!(
            args,
            strings(&[
                "--open-folder",
                r"\\wsl.localhost\Ubuntu\repo",
                "--mcp-config",
                "/tmp/closta-real-1/mcp.json",
                "--mark-children",
                "closta-real-1",
                "--ready-file",
                r"C:\dev\tools\closta\shots\real-hold.ready",
            ])
        );
        assert!(!args.iter().any(|arg| arg == "--close-after"));
        // The config lives under /tmp, so its path names no user.
        assert_eq!(
            mcp_config_path("closta-real-1"),
            "/tmp/closta-real-1/mcp.json"
        );
    }

    #[test]
    fn the_mcp_config_holds_the_fake_cli_by_its_linux_path() {
        let json = mcp_config_json(
            "/work/target/debug/closta-fake-claude",
            "/tmp/closta-real-1/hold",
        );
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();
        let server = &value["mcpServers"]["closta-hold"];
        assert_eq!(server["command"], "/work/target/debug/closta-fake-claude");
        assert_eq!(
            server["args"],
            serde_json::json!(["--hold", "/tmp/closta-real-1/hold"])
        );
        assert_eq!(value["mcpServers"].as_object().unwrap().len(), 1);
    }

    #[test]
    fn a_wsl_folder_is_named_by_its_unc_path() {
        assert_eq!(
            wsl_unc("Ubuntu-26.04", "/work/closta-desktop"),
            r"\\wsl.localhost\Ubuntu-26.04\work\closta-desktop"
        );
        assert_eq!(wsl_unc("Ubuntu", "/tmp/"), r"\\wsl.localhost\Ubuntu\tmp");
        assert_eq!(WIN_FOLDER, r"C:\dev\tools\closta");
    }

    #[test]
    fn the_hold_dir_is_given_as_a_unc_path() {
        assert_eq!(hold_dir("closta-real-7"), "/tmp/closta-real-7/hold");
        assert_eq!(
            wsl_unc("Ubuntu", &hold_dir("closta-real-7")),
            r"\\wsl.localhost\Ubuntu\tmp\closta-real-7\hold"
        );
        let script = real_script(&RealRun {
            mode: Mode::Hold,
            args: strings(&["--open-folder", "x"]),
            ready: r"C:\r.ready".to_owned(),
            distro: "Ubuntu".to_owned(),
            mark: "closta-real-7".to_owned(),
            shot: None,
            hold_dir: Some(wsl_unc("Ubuntu", &hold_dir("closta-real-7"))),
        });
        assert_eq!(
            script,
            r"& 'C:\dev\tools\closta\desktop\xtask\scripts\real.ps1' -Mode Hold -Exe 'C:\dev\tools\closta\desktop\target\release\closta.exe' -ArgList @('--open-folder','x') -ReadyFile 'C:\r.ready' -Distro 'Ubuntu' -Mark 'closta-real-7' -HoldDir '\\wsl.localhost\Ubuntu\tmp\closta-real-7\hold'; exit $LASTEXITCODE"
        );
        let close = real_script(&RealRun {
            mode: Mode::Close,
            args: Vec::new(),
            ready: r"C:\r.ready".to_owned(),
            distro: "Ubuntu".to_owned(),
            mark: "m".to_owned(),
            shot: Some(SHOT.to_owned()),
            hold_dir: None,
        });
        assert!(
            close.ends_with(
                r"-Mark 'm' -Shot 'C:\dev\tools\closta\shots\real-1600x1000.png'; exit $LASTEXITCODE"
            ),
            "{close}"
        );
    }

    #[test]
    fn the_report_is_read_from_the_scripts_lines() {
        let report = parse_report(PASSING);
        assert_eq!(
            report,
            RealReport {
                consoles_before: 2,
                consoles_max: 2,
                ready: strings(&["Running 2.1.3", "Running 2.1.3", "Running 2.1.3"]),
                shot: Some(ShotOutcome::Saved(
                    r"C:\dev\tools\closta\shots\real-1600x1000.png".to_owned()
                )),
                gone_ms: Some(1840),
                marked_wsl: 2,
                kids: 2,
                left_windows: 0,
                left_wsl: 0,
                hold_pid: Some(4242),
                hold_alive_before: Some(true),
                hold_left: Some(false),
            }
        );
        assert!(verdicts(&report).iter().all(|(_, it)| *it == Outcome::Pass));
        // A run that printed nothing has nothing to pass.
        let empty = parse_report("");
        assert!(verdicts(&empty).iter().any(|(_, it)| *it == Outcome::Fail));
    }

    #[test]
    fn a_new_console_or_a_leftover_fails_and_an_unseen_mark_fails() {
        let console = parse_report(&PASSING.replacen("CONSOLES MAX 2", "CONSOLES MAX 3", 1));
        assert_eq!((console.consoles_before, console.consoles_max), (2, 3));
        assert_eq!(outcome(&verdicts(&console), NO_CONSOLE), Outcome::Fail);
        // The second run's rise counts even when its baseline is lower.
        let later = parse_report(&PASSING.replacen(
            "CONSOLES 2\nREADY Running 2.1.3\n",
            "CONSOLES 1\nREADY Running 2.1.3\n",
            1,
        ));
        assert_eq!(outcome(&verdicts(&later), NO_CONSOLE), Outcome::Fail);

        let windows = parse_report(&PASSING.replacen("LEFT windows=0", "LEFT windows=1", 1));
        assert_eq!(windows.left_windows, 1);
        assert_eq!(outcome(&verdicts(&windows), NO_WINDOWS_LEFT), Outcome::Fail);
        let wsl = parse_report(&PASSING.replace("LEFT wsl=0", "LEFT wsl=1"));
        assert_eq!(wsl.left_wsl, 2);
        assert_eq!(outcome(&verdicts(&wsl), NO_WSL_LEFT), Outcome::Fail);
        // A count the script could not take is not a zero.
        let unknown = parse_report(&PASSING.replacen("LEFT wsl=0", "LEFT wsl=unknown", 1));
        assert_eq!(outcome(&verdicts(&unknown), NO_WSL_LEFT), Outcome::Fail);

        let unseen = parse_report(&PASSING.replacen("MARKED wsl=2", "MARKED wsl=0", 1));
        assert_eq!(unseen.marked_wsl, 0);
        assert_eq!(outcome(&verdicts(&unseen), MARKED), Outcome::Fail);
        // A count WSL could not give is no proof that the mark was seen, in either run.
        let uncounted = parse_report(&PASSING.replacen("MARKED wsl=2", "MARKED wsl=unknown", 1));
        assert_eq!(uncounted.marked_wsl, 0);
        assert_eq!(outcome(&verdicts(&uncounted), MARKED), Outcome::Fail);
        let all_uncounted = parse_report(
            &PASSING
                .replace("MARKED wsl=3", "MARKED wsl=unknown")
                .replace("MARKED wsl=2", "MARKED wsl=unknown"),
        );
        assert_eq!(outcome(&verdicts(&all_uncounted), MARKED), Outcome::Fail);
        let not_counted = parse_report(&PASSING.replacen("MARKED wsl=3\n", "", 1));
        assert_eq!(outcome(&verdicts(&not_counted), MARKED), Outcome::Fail);

        // No descendant remembered means the leftover count proves nothing.
        assert_eq!(
            outcome(&verdicts(&parse_report(PASSING)), KIDS_SEEN),
            Outcome::Pass
        );
        let childless = parse_report(&PASSING.replacen("KIDS 2", "KIDS 0", 1));
        assert_eq!(childless.kids, 0);
        assert_eq!(outcome(&verdicts(&childless), KIDS_SEEN), Outcome::Fail);
        let unremembered = parse_report(&PASSING.replacen("KIDS 4\n", "", 1));
        assert_eq!(unremembered.kids, 0);
        assert_eq!(outcome(&verdicts(&unremembered), KIDS_SEEN), Outcome::Fail);

        let failed =
            parse_report(&PASSING.replacen("Running 2.1.3;", "Failed VersionCheckFailed;", 1));
        assert_eq!(outcome(&verdicts(&failed), ALL_RUNNING), Outcome::Fail);
    }

    #[test]
    fn a_shot_that_was_not_saved_is_held_not_failed() {
        let saved = r"SHOT C:\dev\tools\closta\shots\real-1600x1000.png";
        for (line, expected) in [
            ("SHOT HELD locked", ShotOutcome::Locked),
            ("SHOT HELD blank", ShotOutcome::Blank),
            ("SHOT HELD no window", ShotOutcome::NoWindow),
        ] {
            let report = parse_report(&PASSING.replace(saved, line));
            assert_eq!(report.shot, Some(expected), "{line}");
            assert_eq!(
                outcome(&verdicts(&report), SHOT_TAKEN),
                Outcome::Held,
                "{line}"
            );
        }
        let none = parse_report(&PASSING.replace(saved, ""));
        assert_eq!(none.shot, None);
        assert_eq!(outcome(&verdicts(&none), SHOT_TAKEN), Outcome::Held);
        assert_eq!(
            outcome(&verdicts(&parse_report(PASSING)), SHOT_TAKEN),
            Outcome::Pass
        );
    }

    #[test]
    fn a_hold_that_was_dead_before_the_close_fails() {
        let dead = parse_report(&PASSING.replace("HOLD ALIVE yes", "HOLD ALIVE no"));
        assert_eq!(dead.hold_alive_before, Some(false));
        assert_eq!(dead.hold_left, Some(false));
        assert_eq!(outcome(&verdicts(&dead), HOLD_GONE), Outcome::Fail);

        let unchecked = parse_report(&PASSING.replace("HOLD ALIVE yes\n", ""));
        assert_eq!(unchecked.hold_alive_before, None);
        assert_eq!(outcome(&verdicts(&unchecked), HOLD_GONE), Outcome::Fail);

        let left = parse_report(&PASSING.replace("HOLD LEFT no", "HOLD LEFT yes"));
        assert_eq!(outcome(&verdicts(&left), HOLD_GONE), Outcome::Fail);

        // A pid whose life could not be checked is neither alive nor gone.
        let unknown_before = parse_report(&PASSING.replace("HOLD ALIVE yes", "HOLD ALIVE unknown"));
        assert_eq!(unknown_before.hold_alive_before, None);
        assert_eq!(
            outcome(&verdicts(&unknown_before), HOLD_GONE),
            Outcome::Fail
        );
        let unknown_after = parse_report(&PASSING.replace("HOLD LEFT no", "HOLD LEFT unknown"));
        assert_eq!(unknown_after.hold_left, None);
        assert_eq!(outcome(&verdicts(&unknown_after), HOLD_GONE), Outcome::Fail);
        let script = include_str!("../scripts/real.ps1");
        assert!(script.contains("kill -0 $id 2>/dev/null && echo yes || echo no"));
        assert!(script.contains("'unknown'"));

        let unseen = parse_report(&PASSING.replace("HOLD 4242\n", "NO HOLD\n"));
        assert_eq!(unseen.hold_pid, None);
        assert_eq!(outcome(&verdicts(&unseen), HOLD_SEEN), Outcome::Fail);
    }

    #[test]
    fn gone_is_read_from_the_closing_line() {
        // The slowest run is the one judged.
        assert_eq!(parse_report(PASSING).gone_ms, Some(1840));
        let slow = parse_report(&PASSING.replace("GONE 950", "GONE 10001"));
        assert_eq!(slow.gone_ms, Some(10_001));
        assert_eq!(outcome(&verdicts(&slow), GONE), Outcome::Fail);
        let edge = parse_report(&PASSING.replace("GONE 950", "GONE 10000"));
        assert_eq!(outcome(&verdicts(&edge), GONE), Outcome::Pass);
        // A run whose window never went, or that never wrote its closing line, fails.
        let stuck = parse_report(&PASSING.replace("GONE 1840", "NOT GONE"));
        assert_eq!(stuck.gone_ms, None);
        assert_eq!(outcome(&verdicts(&stuck), GONE), Outcome::Fail);
        let script = include_str!("../scripts/real.ps1");
        assert!(script.contains("'^closing (\\d+)$'"));
        assert!(script.contains("GONE $("));
        assert!(script.contains("'NOT GONE'"));
    }

    #[test]
    fn a_run_is_finished_only_when_it_printed_both_leftover_counts() {
        assert!(finished("LEFT windows=0\nLEFT wsl=0\n"));
        assert!(!finished("CONSOLES 2\nLEFT windows=0\n"));
        assert!(!finished(""));
    }

    #[test]
    fn the_real_script_counts_consoles_and_leftovers_and_kills_only_its_own() {
        let script = include_str!("../scripts/real.ps1");
        for needed in [
            "ConsoleWindowClass",
            "ParentProcessId",
            "environ",
            "kill -0",
            "CloseMainWindow",
            "PrintWindow",
            ", 2)",
            "Stop-Process",
            "CLOSTA_SMOKE_MARK=",
            "LogonUI",
            "finally",
        ] {
            assert!(script.contains(needed), "real.ps1 lacks {needed}");
        }
        assert!(!script.contains("CopyFromScreen"));
        let lower = script.to_ascii_lowercase();
        for banned in [
            "get-process claude",
            "get-process wsl",
            "-name claude",
            "-name wsl",
        ] {
            assert!(!lower.contains(banned), "real.ps1 has {banned}");
        }
        // No process is stopped by its name, not even the exe's: the user may run their own.
        for banned in [
            "get-process closta",
            "-name closta",
            "get-process -name $name",
        ] {
            assert!(!lower.contains(banned), "real.ps1 has {banned}");
        }
        // Whatever ended the run, the exe it started and the descendants it remembered are
        // stopped, and the ready file goes, without a failed stop cutting the cleanup short.
        let cleanup = &script[script.rfind("} finally {").unwrap()..];
        assert!(cleanup.contains("$process.Kill()"));
        assert!(cleanup.contains("Descendants"));
        assert!(cleanup.contains("Stop-Process -Id $id -Force -ErrorAction SilentlyContinue"));
        assert!(cleanup.contains("Remove-Item -LiteralPath $ReadyFile"));
        for line in cleanup.lines().filter(|line| line.contains("Stop-Process")) {
            assert!(line.contains("-ErrorAction SilentlyContinue"), "{line}");
        }
        assert!(script.contains("Say \"KIDS $($kids.Count)\""));
    }
}
