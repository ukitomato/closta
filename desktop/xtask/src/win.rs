use std::path::{Path, PathBuf};
use std::process::Command;

use anyhow::{Context, bail};

use crate::check::LOCK;
use crate::perf_log::{Outcome, PerfLog, PerfScene, references, verdicts};
use crate::scenes::{BASH_PROMPT, HUB_REPLAYS, SIZES, Scene, stopped_replay};

/// The Windows-side copy of `desktop/`, as seen from WSL. The Windows build
/// needs the Windows SDK shader compiler and Windows paths, so it runs on Windows.
pub const WIN_COPY_WSL: &str = "/mnt/c/dev/tools/closta/desktop";
/// The same copy as Windows sees it.
pub const WIN_COPY: &str = r"C:\dev\tools\closta\desktop";
/// Where the replay files are copied for the Windows exe, as seen from WSL. Only `desktop/` is
/// mirrored, so the captures beside it and the written files under `target/` are copied here.
pub const REPLAY_WSL: &str = "/mnt/c/dev/tools/closta/replay";
/// The same folder as Windows sees it.
pub const REPLAY: &str = r"C:\dev\tools\closta\replay";
/// The recorded captures, from `desktop/`.
const CAPTURES: &str =
    "../jetbrains/src/main/kotlin/dev/ukitomato/closta/providers/claude/fixtures";
/// How many jobs a Windows build runs: it shares this machine's memory with WSL.
const JOBS: &str = "4";

fn with_slash(path: &str) -> String {
    if path.ends_with('/') {
        path.to_owned()
    } else {
        format!("{path}/")
    }
}

/// Mirrors `src` into `dest`, leaving the Windows `target\` alone so the
/// dependencies are not rebuilt from scratch every time. Notes at the top of
/// `desktop/` are not part of the build and stay behind.
pub fn rsync_args(src: &Path, dest: &str) -> Vec<String> {
    vec![
        "-a".to_owned(),
        "--delete".to_owned(),
        "--exclude".to_owned(),
        "/target".to_owned(),
        "--exclude".to_owned(),
        "/*.md".to_owned(),
        with_slash(&src.to_string_lossy()),
        with_slash(dest),
    ]
}

pub fn exe_path(release: bool) -> String {
    let profile = if release { "release" } else { "debug" };
    format!(r"{WIN_COPY}\target\{profile}\closta.exe")
}

/// The program and arguments that run `script` in Windows PowerShell under the shared lock: a
/// Windows build takes this machine's memory and processes as a WSL one does, so the two never
/// overlap.
pub fn powershell_command(script: &str) -> (String, Vec<String>) {
    let args = [
        LOCK,
        "powershell.exe",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        script,
    ];
    (
        "flock".to_owned(),
        args.iter().map(|it| (*it).to_owned()).collect(),
    )
}

/// The cargo command line `cargo <command> -j 4 <args> [--features a,b]`.
fn cargo_line(command: &str, args: &[&str], features: &[String]) -> String {
    let mut line = format!("cargo {command} -j {JOBS}");
    for arg in args {
        line.push(' ');
        line.push_str(arg);
    }
    if !features.is_empty() {
        line.push_str(" --features ");
        line.push_str(&features.join(","));
    }
    line
}

/// The PowerShell that runs `cargo` in the Windows copy, then `after`. Cargo's output is left
/// as it is and its exit code becomes the script's, so a failed build fails the task.
fn cargo_script(cargo: String, after: Option<String>) -> String {
    let mut lines = vec![
        "[Console]::OutputEncoding = [Text.Encoding]::UTF8".to_owned(),
        format!("Set-Location '{WIN_COPY}' -ErrorAction Stop"),
        // A standalone Rust install earlier on PATH would ignore rust-toolchain.toml,
        // so rustup's proxies go first.
        "$env:Path = (Split-Path (Get-Command rustup -ErrorAction Stop).Source) + ';' + $env:Path"
            .to_owned(),
        cargo,
    ];
    lines.extend(after);
    // A cargo that never started leaves $LASTEXITCODE unset, and `exit $null` is 0.
    lines.push("if ($null -eq $LASTEXITCODE) { exit 1 }".to_owned());
    lines.push("exit $LASTEXITCODE".to_owned());
    lines.join("; ")
}

/// The PowerShell that builds the exe on Windows with `features`, and starts it after a build
/// that passed when `run`.
pub fn build_script(release: bool, run: bool, features: &[String]) -> String {
    let profile: &[&str] = if release { &["--release"] } else { &[] };
    let start = run.then(|| {
        format!(
            "if ($LASTEXITCODE -eq 0) {{ Start-Process '{}' -ErrorAction Stop }}",
            exe_path(release)
        )
    });
    cargo_script(cargo_line("build", profile, features), start)
}

/// The PowerShell that runs the GUI crates' tests on Windows with `features`.
pub fn test_script(features: &[String]) -> String {
    cargo_script(
        cargo_line("test", &["-p", "closta-platform", "-p", "closta"], features),
        None,
    )
}

/// The folders the replay files come from: the recorded captures, and the files the capture
/// commands write under `target/replay`.
pub fn replay_dirs(root: &Path) -> [PathBuf; 2] {
    [root.join(CAPTURES), root.join("target").join("replay")]
}

/// Each replay file among `files` with where it is copied to; other files are left out.
pub fn replay_copies(files: &[PathBuf]) -> Vec<(PathBuf, PathBuf)> {
    files
        .iter()
        .filter(|file| file.extension().is_some_and(|it| it == "ndjson"))
        .filter_map(|file| {
            let name = file.file_name()?;
            Some((file.clone(), Path::new(REPLAY_WSL).join(name)))
        })
        .collect()
}

/// Copies the captures and the written replay files to [`REPLAY_WSL`].
pub fn copy_replays(root: &Path) -> anyhow::Result<()> {
    let mut files = Vec::new();
    for dir in replay_dirs(root) {
        let entries = std::fs::read_dir(&dir).with_context(|| {
            format!(
                "could not list {} (run `cargo xtask gallery-capture` and `cargo xtask synth-capture` first)",
                dir.display()
            )
        })?;
        for entry in entries {
            files.push(entry?.path());
        }
    }
    files.sort();
    let copies = replay_copies(&files);
    std::fs::create_dir_all(REPLAY_WSL)
        .with_context(|| format!("could not create {REPLAY_WSL}"))?;
    for (from, to) in &copies {
        std::fs::copy(from, to)
            .with_context(|| format!("could not copy {} to {}", from.display(), to.display()))?;
    }
    println!("==> copied {} replay files to {REPLAY}", copies.len());
    Ok(())
}

/// Mirrors `desktop/` into the Windows copy.
fn sync(root: &Path) -> anyhow::Result<()> {
    println!("==> rsync to {WIN_COPY_WSL}");
    let status = Command::new("rsync")
        .args(rsync_args(root, WIN_COPY_WSL))
        .status()
        .context("could not start `rsync`")?;
    if !status.success() {
        bail!("rsync failed with {status}");
    }
    Ok(())
}

/// Runs `script` in PowerShell under the lock; `what` names it when it fails.
fn powershell(script: &str, what: &str) -> anyhow::Result<()> {
    let (program, args) = powershell_command(script);
    let status = Command::new(&program)
        .args(&args)
        .status()
        .with_context(|| format!("could not start `{program}` for powershell.exe"))?;
    if !status.success() {
        bail!("{what} failed with {status}");
    }
    Ok(())
}

/// Copies `desktop/` to Windows and builds it there with `features`.
pub fn win_build(root: &Path, release: bool, run: bool, features: &[String]) -> anyhow::Result<()> {
    sync(root)?;
    println!("==> cargo build on Windows");
    powershell(&build_script(release, run, features), "the Windows build")?;
    println!("{}", exe_path(release));
    Ok(())
}

/// Copies `desktop/` and the replay files to Windows and runs the GUI crates' tests there.
pub fn win_test(root: &Path, features: &[String]) -> anyhow::Result<()> {
    sync(root)?;
    copy_replays(root)?;
    println!("==> cargo test on Windows");
    powershell(&test_script(features), "the Windows tests")
}

/// The flags of `win-build` and `win-test`.
#[derive(Clone, PartialEq, Eq, Debug, Default)]
pub struct WinFlags {
    pub release: bool,
    pub run: bool,
    pub features: Vec<String>,
}

/// Reads `--features a,b` and, when `build`, `--release` and `--run`.
pub fn parse_flags(args: &[String], build: bool) -> Result<WinFlags, String> {
    let mut flags = WinFlags::default();
    let mut args = args.iter();
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--release" if build => flags.release = true,
            "--run" if build => flags.run = true,
            "--features" => {
                let list = args.next().ok_or("--features needs a list")?;
                flags.features.extend(
                    list.split(',')
                        .filter(|it| !it.is_empty())
                        .map(str::to_owned),
                );
            }
            other => return Err(format!("unknown flag: {other:?}")),
        }
    }
    Ok(flags)
}

/// Whether `tasklist.exe /FI "IMAGENAME eq LogonUI.exe" /NH` printed a running LogonUI: the
/// screen is locked, and nothing drawn can be seen or measured.
pub fn is_locked(tasklist_output: &str) -> bool {
    tasklist_output.to_ascii_lowercase().contains("logonui.exe")
}

/// Whether the Windows screen is locked now.
pub fn screen_locked() -> anyhow::Result<bool> {
    let output = Command::new("tasklist.exe")
        .args(["/FI", "IMAGENAME eq LogonUI.exe", "/NH"])
        .output()
        .context("could not start `tasklist.exe`")?;
    if !output.status.success() {
        bail!("tasklist.exe failed with {}", output.status);
    }
    Ok(is_locked(&String::from_utf8_lossy(&output.stdout)))
}

/// Where the measuring exe writes the CSV of `scene`, as Windows sees it.
pub fn perf_csv(scene: PerfScene) -> String {
    format!(r"{PERF}\{}.csv", scene.name())
}

/// The same CSV as seen from WSL.
pub fn perf_csv_wsl(scene: PerfScene) -> PathBuf {
    Path::new(PERF_WSL).join(format!("{}.csv", scene.name()))
}

/// Where the measuring exe writes its CSVs, as seen from WSL and from Windows.
const PERF_WSL: &str = "/mnt/c/dev/tools/closta/perf";
const PERF: &str = r"C:\dev\tools\closta\perf";
/// How long `measure.ps1` lets one run go before it kills it; the exe gives up by itself at
/// 180 s.
const MEASURE_TIMEOUT_SEC: u32 = 200;

/// The arguments the measuring exe runs `scene` with.
pub fn scene_args(scene: PerfScene) -> Vec<String> {
    let replay = |name: &str| format!(r"{REPLAY}\{name}");
    let args: Vec<String> = match scene {
        PerfScene::Synth => vec![
            "--replay".into(),
            replay("synth.ndjson"),
            "--window".into(),
            "1440x900".into(),
            "--scroll-through".into(),
            "--exit-after-replay".into(),
            "12000".into(),
        ],
        PerfScene::Stream => vec![
            "--replay".into(),
            replay("stream.ndjson"),
            "--pace".into(),
            "30".into(),
            "--exit-after-replay".into(),
            "3000".into(),
        ],
        // Four streaming replays and the four cards of the hub, so the list aggregates
        // eight slots while four of them keep updating.
        PerfScene::NeedsYou => {
            let mut args = Vec::new();
            for _ in 0..4 {
                args.extend(["--replay".to_owned(), replay("stream.ndjson")]);
            }
            for (file, prompt, stop_at) in &HUB_REPLAYS[..4] {
                args.extend(stopped_replay(file, prompt, *stop_at));
            }
            args.extend(["--pace", "30", "--exit-after-replay", "3000"].map(str::to_owned));
            args
        }
        PerfScene::Idle => vec![
            "--replay".into(),
            replay("gallery.ndjson"),
            "--replay".into(),
            replay("02-tool-bash-autorun.ndjson"),
            "--prompt".into(),
            BASH_PROMPT.into(),
            "--replay".into(),
            replay("synth.ndjson"),
            "--exit-after-replay".into(),
            "12000".into(),
        ],
    };
    args
}

/// A PowerShell single-quoted string.
pub(crate) fn quoted(text: &str) -> String {
    format!("'{}'", text.replace('\'', "''"))
}

/// The PowerShell that runs `measure.ps1` for `scene` with the release exe.
pub fn measure_script(scene: PerfScene) -> String {
    let args: Vec<String> = scene_args(scene).iter().map(|it| quoted(it)).collect();
    format!(
        "& {} -Exe {} -ArgList @({}) -Csv {} -TimeoutSec {MEASURE_TIMEOUT_SEC}; exit $LASTEXITCODE",
        quoted(&format!(r"{WIN_COPY}\xtask\scripts\measure.ps1")),
        quoted(&exe_path(true)),
        args.join(","),
        quoted(&perf_csv(scene)),
    )
}

/// Where `win-shot` puts its pictures, as seen from WSL and from Windows. Outside the repo: a
/// picture can show the user's names, so it is never committed.
pub const SHOTS_WSL: &str = "/mnt/c/dev/tools/closta/shots";
pub const SHOTS: &str = r"C:\dev\tools\closta\shots";

/// What came of shooting one scene at one size. Anything but `Saved` holds the shot.
#[derive(Clone, PartialEq, Eq, Debug)]
pub enum ShotOutcome {
    /// The picture, as seen from WSL.
    Saved(String),
    /// Every sampled pixel had the same colour: nothing was drawn.
    Blank,
    /// The exe showed no window.
    NoWindow,
    /// The exe did not write its ready file in time.
    NotReady,
    /// The screen was locked.
    Locked,
    /// The window is larger than the screen's work area, so it cannot be seen whole.
    TooBig,
}

/// The outcome `shot.ps1` printed, with `png` the picture it was asked to save (as seen from
/// WSL); `None` when the output says none of them (the script itself failed).
pub fn shot_outcome(output: &str, png: &str) -> Option<ShotOutcome> {
    output.lines().rev().find_map(|line| {
        let line = line.trim();
        if line.starts_with("class=") && line.contains(" size=") {
            Some(ShotOutcome::Saved(png.to_owned()))
        } else if line.starts_with("BLANK") {
            Some(ShotOutcome::Blank)
        } else if line.starts_with("NO GUI WINDOW") {
            Some(ShotOutcome::NoWindow)
        } else if line.starts_with("NOT READY") {
            Some(ShotOutcome::NotReady)
        } else if line.starts_with("TOO BIG") {
            Some(ShotOutcome::TooBig)
        } else {
            None
        }
    })
}

/// `<scene>-<w>x<h>`, the stem of a shot's picture and ready file.
pub fn shot_stem(scene: &Scene, (width, height): (u32, u32)) -> String {
    format!("{}-{width}x{height}", scene.name)
}

/// The PowerShell that shoots `scene` at `size` with the release exe. `shot.ps1` adds
/// `--window` and `--ready-file` to the scene's arguments.
pub fn shot_script(scene: &Scene, size: (u32, u32)) -> String {
    let stem = shot_stem(scene, size);
    let args: Vec<String> = scene.args.iter().map(|it| quoted(it)).collect();
    format!(
        "& {} -Exe {} -ArgList @({}) -Width {} -Height {} -ReadyFile {} -Out {}; exit $LASTEXITCODE",
        quoted(&format!(r"{WIN_COPY}\xtask\scripts\shot.ps1")),
        quoted(&exe_path(true)),
        args.join(","),
        size.0,
        size.1,
        quoted(&format!(r"{SHOTS}\{stem}.ready")),
        quoted(&format!(r"{SHOTS}\{stem}.png")),
    )
}

/// Shoots `scene` at `size` once on Windows.
fn shoot(scene: &Scene, size: (u32, u32)) -> anyhow::Result<ShotOutcome> {
    let stem = shot_stem(scene, size);
    println!("==> shoot {stem}");
    let (program, args) = powershell_command(&shot_script(scene, size));
    let output = Command::new(&program)
        .args(&args)
        .output()
        .with_context(|| format!("could not start `{program}` for powershell.exe"))?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    print!("{stdout}");
    let png = format!("{SHOTS_WSL}/{stem}.png");
    shot_outcome(&stdout, &png).with_context(|| {
        format!(
            "shot.ps1 for {stem} ended with {} and said no outcome: {}",
            output.status,
            String::from_utf8_lossy(&output.stderr).trim()
        )
    })
}

fn shot_word(outcome: &ShotOutcome) -> String {
    match outcome {
        ShotOutcome::Saved(png) => png.clone(),
        ShotOutcome::Blank => "held: blank".to_owned(),
        ShotOutcome::NoWindow => "held: no window".to_owned(),
        ShotOutcome::NotReady => "held: not ready in 60 s".to_owned(),
        ShotOutcome::Locked => "held: the screen is locked".to_owned(),
        ShotOutcome::TooBig => "held: larger than the screen".to_owned(),
    }
}

/// `cargo xtask win-shot <scene>|all`: builds the replay exe once, then shoots each scene at
/// each of [`SIZES`] into [`SHOTS`] and prints a table. Anything but a saved picture is held,
/// never passed; a locked screen holds every shot and ends without a build. Fails only when a
/// shot could not be run at all.
pub fn win_shot(root: &Path, scenes: &[Scene]) -> anyhow::Result<()> {
    let mut results = Vec::new();
    if screen_locked()? {
        for scene in scenes {
            for size in SIZES {
                results.push((shot_stem(scene, size), ShotOutcome::Locked));
            }
        }
    } else {
        let features = ["closta/replay".to_owned(), "closta/profiler".to_owned()];
        win_build(root, true, false, &features)?;
        copy_replays(root)?;
        std::fs::create_dir_all(SHOTS_WSL)
            .with_context(|| format!("could not create {SHOTS_WSL}"))?;
        for scene in scenes {
            for size in SIZES {
                let outcome = if screen_locked()? {
                    ShotOutcome::Locked
                } else {
                    shoot(scene, size)?
                };
                results.push((shot_stem(scene, size), outcome));
            }
        }
    }
    println!("| shot | outcome |");
    println!("|---|---|");
    for (stem, outcome) in &results {
        println!("| {stem} | {} |", shot_word(outcome));
    }
    Ok(())
}

/// The exit codes of `measure.ps1` that hold a scene: 3, the run was killed for not ending;
/// 4, no window came up or it was minimized.
const HELD_CODES: [i32; 2] = [3, 4];

/// What came of measuring one scene.
enum Measured {
    Log(PerfLog),
    Held(&'static str),
}

/// Runs `scene` once on Windows and reads its CSV.
fn measure(scene: PerfScene) -> anyhow::Result<Measured> {
    println!("==> measure {}", scene.name());
    let (program, args) = powershell_command(&measure_script(scene));
    let status = Command::new(&program)
        .args(&args)
        .status()
        .with_context(|| format!("could not start `{program}` for powershell.exe"))?;
    match status.code() {
        Some(0) => {}
        Some(code) if HELD_CODES.contains(&code) => {
            return Ok(Measured::Held("the run timed out or showed no window"));
        }
        _ => bail!("measuring {} failed with {status}", scene.name()),
    }
    let csv = perf_csv_wsl(scene);
    let text = std::fs::read_to_string(&csv)
        .with_context(|| format!("could not read {}", csv.display()))?;
    Ok(Measured::Log(PerfLog::parse(&text)?))
}

fn outcome_word(outcome: Outcome) -> &'static str {
    match outcome {
        Outcome::Pass => "pass",
        Outcome::Fail => "FAIL",
        Outcome::Held => "held",
    }
}

fn shown(value: Option<f64>) -> String {
    value.map_or_else(|| "-".to_owned(), |value| format!("{value:.3}"))
}

/// The table of one scene's verdicts and reference values.
pub fn table(scene: PerfScene, log: &PerfLog) -> (String, bool) {
    let mut lines = vec![format!("| {} | value | budget | outcome |", scene.name())];
    lines.push("|---|---|---|---|".to_owned());
    let judged = verdicts(scene, log);
    let failed = judged.iter().any(|it| it.outcome == Outcome::Fail);
    for verdict in &judged {
        lines.push(format!(
            "| {} | {} | {} | {} |",
            verdict.name,
            shown(verdict.value),
            verdict.budget,
            outcome_word(verdict.outcome),
        ));
    }
    for (name, value) in references(scene, log) {
        lines.push(format!("| {name} p99 | {} | - | reference |", shown(value)));
    }
    let frames = log
        .rows
        .iter()
        .filter(|row| row.metric == "frame_ms")
        .count();
    lines.push(format!("| frames presented | {frames} | - | count |"));
    (lines.join("\n"), failed)
}

/// `cargo xtask win-perf [scenes]`: builds the measuring exe, runs each scene on Windows and
/// prints its verdicts. A locked screen holds every scene and ends without a build. Fails, after
/// every scene ran, when a verdict failed or a scene could not be measured.
pub fn win_perf(root: &Path, scenes: &[PerfScene]) -> anyhow::Result<()> {
    if screen_locked()? {
        for scene in scenes {
            println!("held: {} — the screen is locked", scene.name());
        }
        return Ok(());
    }
    let features = ["closta/replay".to_owned(), "closta/profiler".to_owned()];
    win_build(root, true, false, &features)?;
    copy_replays(root)?;
    let mut failed = Vec::new();
    for scene in scenes {
        if screen_locked()? {
            println!("held: {} — the screen is locked", scene.name());
            continue;
        }
        // A scene that fails is reported and the next one still runs.
        match measure(*scene) {
            Ok(Measured::Held(why)) => println!("held: {} — {why}", scene.name()),
            Ok(Measured::Log(log)) => {
                let (table, scene_failed) = table(*scene, &log);
                println!("{table}");
                if scene_failed {
                    failed.push(format!("{} (over budget)", scene.name()));
                }
            }
            Err(err) => {
                println!("failed: {} — {err:#}", scene.name());
                failed.push(format!("{} (did not run)", scene.name()));
            }
        }
    }
    if !failed.is_empty() {
        bail!("failed: {}", failed.join(", "));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::path::{Path, PathBuf};

    use super::*;

    fn strings(parts: &[&str]) -> Vec<String> {
        parts.iter().map(|part| (*part).to_owned()).collect()
    }

    #[test]
    fn rsync_args_keep_windows_target() {
        let args = rsync_args(Path::new("/src/desktop"), WIN_COPY_WSL);
        assert_eq!(
            args,
            [
                "-a",
                "--delete",
                "--exclude",
                "/target",
                "--exclude",
                "/*.md",
                "/src/desktop/",
                "/mnt/c/dev/tools/closta/desktop/",
            ]
        );
    }

    #[test]
    fn windows_calls_hold_the_gradle_lock() {
        let (program, args) = powershell_command("exit 0");
        assert_eq!(program, "flock");
        assert_eq!(
            args,
            strings(&[
                "/tmp/closta-gradle.lock",
                "powershell.exe",
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "exit 0",
            ])
        );
    }

    #[test]
    fn powershell_script_propagates_cargo_exit_code() {
        let script = build_script(false, false, &[]);
        assert!(script.contains("[Console]::OutputEncoding = [Text.Encoding]::UTF8"));
        assert!(script.contains(r"Set-Location 'C:\dev\tools\closta\desktop'"));
        assert!(!script.contains("Select-String"));
        assert!(script.ends_with("exit $LASTEXITCODE"));
    }

    #[test]
    fn powershell_script_puts_rustup_first_on_path() {
        let script = build_script(false, false, &[]);
        let path = script
            .find("(Get-Command rustup -ErrorAction Stop).Source")
            .unwrap();
        assert!(path < script.find("cargo build").unwrap());
    }

    #[test]
    fn powershell_script_fails_when_cargo_never_started() {
        for script in [build_script(false, false, &[]), test_script(&[])] {
            assert!(
                script.contains("if ($null -eq $LASTEXITCODE) { exit 1 }; exit $LASTEXITCODE"),
                "{script}"
            );
        }
    }

    #[test]
    fn the_windows_build_is_limited_to_four_jobs_and_passes_features() {
        assert!(build_script(false, false, &[]).contains("; cargo build -j 4; "));
        let features = strings(&["closta/replay", "closta/profiler"]);
        let script = build_script(true, false, &features);
        assert!(
            script.contains(
                "; cargo build -j 4 --release --features closta/replay,closta/profiler; "
            ),
            "{script}"
        );
    }

    #[test]
    fn win_test_runs_the_gui_crates_tests() {
        assert!(
            test_script(&[]).contains("; cargo test -j 4 -p closta-platform -p closta; "),
            "{}",
            test_script(&[])
        );
        let script = test_script(&strings(&["closta/replay"]));
        assert!(
            script.contains(
                "; cargo test -j 4 -p closta-platform -p closta --features closta/replay; "
            ),
            "{script}"
        );
        assert!(script.contains(r"Set-Location 'C:\dev\tools\closta\desktop'"));
        assert!(!script.contains("Start-Process"));
    }

    #[test]
    fn release_and_run_flags_change_the_script() {
        let debug = build_script(false, false, &[]);
        assert!(!debug.contains("--release"));
        assert!(!debug.contains("Start-Process"));

        let run = build_script(true, true, &[]);
        let start = format!("Start-Process '{}' -ErrorAction Stop", exe_path(true));
        let guarded = format!("if ($LASTEXITCODE -eq 0) {{ {start} }}");
        assert!(run.contains(&guarded), "{run}");
        assert_eq!(run.matches("Start-Process").count(), 1);
    }

    #[test]
    fn exe_path_points_at_the_closta_binary() {
        assert_eq!(
            exe_path(false),
            r"C:\dev\tools\closta\desktop\target\debug\closta.exe"
        );
        assert_eq!(
            exe_path(true),
            r"C:\dev\tools\closta\desktop\target\release\closta.exe"
        );
    }

    #[test]
    fn replays_are_copied_from_the_captures_and_the_written_files() {
        let [captures, written] = replay_dirs(Path::new("/w/desktop"));
        assert_eq!(
            captures,
            PathBuf::from(
                "/w/desktop/../jetbrains/src/main/kotlin/dev/ukitomato/closta/providers/claude/fixtures"
            )
        );
        assert_eq!(written, PathBuf::from("/w/desktop/target/replay"));

        let files = [
            captures.join("01-baseline-text.ndjson"),
            captures.join("manifest.json"),
            captures.join("FINDINGS.md"),
            written.join("gallery.ndjson"),
        ];
        assert_eq!(
            replay_copies(&files),
            [
                (
                    files[0].clone(),
                    PathBuf::from("/mnt/c/dev/tools/closta/replay/01-baseline-text.ndjson")
                ),
                (
                    files[3].clone(),
                    PathBuf::from("/mnt/c/dev/tools/closta/replay/gallery.ndjson")
                ),
            ]
        );
        assert_eq!(REPLAY, r"C:\dev\tools\closta\replay");
    }

    #[test]
    fn win_flags_take_release_run_and_a_comma_list_of_features() {
        let flags = parse_flags(
            &strings(&[
                "--release",
                "--features",
                "closta/replay,closta/profiler",
                "--run",
            ]),
            true,
        )
        .unwrap();
        assert_eq!(
            flags,
            WinFlags {
                release: true,
                run: true,
                features: strings(&["closta/replay", "closta/profiler"]),
            }
        );
        assert_eq!(parse_flags(&[], false).unwrap(), WinFlags::default());
        assert!(parse_flags(&strings(&["--release"]), false).is_err());
        assert!(parse_flags(&strings(&["--features"]), true).is_err());
        assert!(parse_flags(&strings(&["--jobs"]), true).is_err());
    }

    #[test]
    fn a_locked_screen_is_seen_in_the_tasklist_output() {
        assert!(is_locked(
            "LogonUI.exe                  14212 Console                    1     52,604 K\r\n"
        ));
        assert!(is_locked("logonui.exe 1 Console 1 1 K"));
        assert!(!is_locked(
            "INFO: No tasks are running which match the specified criteria.\r\n"
        ));
        assert!(!is_locked(""));
    }

    #[test]
    fn the_measure_script_kills_a_run_that_does_not_end() {
        let path = crate::desktop_root().join("xtask/scripts/measure.ps1");
        let script = std::fs::read_to_string(path).unwrap();
        for needed in [
            "WaitForExit",
            "Kill()",
            "exit 3",
            "IsIconic",
            "SetForegroundWindow",
            "Stop-Process",
        ] {
            assert!(script.contains(needed), "measure.ps1 lacks {needed}");
        }
        // Whatever ended the run, every process of the exe's name is stopped last.
        let stop = script.rfind("Stop-Process").unwrap();
        assert!(stop > script.rfind("WaitForExit").unwrap());
        assert!(stop > script.rfind("Kill()").unwrap());
        assert!(script[..stop].contains("finally"));
    }

    #[test]
    fn the_measure_script_fails_a_run_that_ends_before_its_window() {
        let path = crate::desktop_root().join("xtask/scripts/measure.ps1");
        let script = std::fs::read_to_string(path).unwrap();
        // An exe that ended before a window came up (a bad argument, a bad cue) gives its own
        // exit code, which fails the scene, and is never held as "no window".
        let ended = script
            .find("if ($process.HasExited)")
            .expect("measure.ps1 does not look at an exe that already ended");
        let held = script.find("'held: no window came up'").unwrap();
        assert!(
            ended < held,
            "the ended exe is looked at after the held case"
        );
        assert!(script[ended..held].contains("exit $process.ExitCode"));
        assert!(script.contains("GetForegroundWindow"));
    }

    #[test]
    fn perf_scenes_run_with_the_planned_arguments() {
        let replay = |name: &str| format!(r"C:\dev\tools\closta\replay\{name}");
        assert_eq!(
            scene_args(PerfScene::Synth),
            [
                "--replay".to_owned(),
                replay("synth.ndjson"),
                "--window".to_owned(),
                "1440x900".to_owned(),
                "--scroll-through".to_owned(),
                "--exit-after-replay".to_owned(),
                "12000".to_owned(),
            ]
        );
        assert_eq!(
            scene_args(PerfScene::Stream),
            [
                "--replay".to_owned(),
                replay("stream.ndjson"),
                "--pace".to_owned(),
                "30".to_owned(),
                "--exit-after-replay".to_owned(),
                "3000".to_owned(),
            ]
        );
        assert_eq!(
            scene_args(PerfScene::Idle),
            [
                "--replay".to_owned(),
                replay("gallery.ndjson"),
                "--replay".to_owned(),
                replay("02-tool-bash-autorun.ndjson"),
                "--prompt".to_owned(),
                "Run this exact bash command and report its output: echo hello-from-capture"
                    .to_owned(),
                "--replay".to_owned(),
                replay("synth.ndjson"),
                "--exit-after-replay".to_owned(),
                "12000".to_owned(),
            ]
        );
    }

    #[test]
    fn the_measure_call_passes_the_scene_and_its_csv() {
        let script = measure_script(PerfScene::Idle);
        assert!(
            script.starts_with(
                r"& 'C:\dev\tools\closta\desktop\xtask\scripts\measure.ps1' -Exe 'C:\dev\tools\closta\desktop\target\release\closta.exe' -ArgList @('--replay',"
            ),
            "{script}"
        );
        assert!(script.contains(
            "'--prompt','Run this exact bash command and report its output: echo hello-from-capture'"
        ));
        assert!(script.ends_with(
            r"-Csv 'C:\dev\tools\closta\perf\idle.csv' -TimeoutSec 200; exit $LASTEXITCODE"
        ));
        assert_eq!(quoted("it's"), "'it''s'");
        assert_eq!(
            perf_csv_wsl(PerfScene::Synth),
            PathBuf::from("/mnt/c/dev/tools/closta/perf/synth.csv")
        );
    }
    #[test]
    fn shot_output_maps_to_an_outcome() {
        let png = "/mnt/c/dev/tools/closta/shots/thread-bash-1024x700.png";
        assert_eq!(
            shot_outcome("class=Zed::Window title=Closta size=1792x1225\r\n", png),
            Some(ShotOutcome::Saved(png.to_owned()))
        );
        assert_eq!(
            shot_outcome("note: x\nBLANK (every sampled pixel is #000000)\n", png),
            Some(ShotOutcome::Blank)
        );
        assert_eq!(
            shot_outcome("NO GUI WINDOW (exited=True code=2)", png),
            Some(ShotOutcome::NoWindow)
        );
        assert_eq!(
            shot_outcome("NOT READY after 60 s", png),
            Some(ShotOutcome::NotReady)
        );
        assert_eq!(
            shot_outcome("TOO BIG (4480x2520 > 3840x2340)", png),
            Some(ShotOutcome::TooBig)
        );
        assert_eq!(shot_outcome("Exception: something broke", png), None);
        assert_eq!(shot_outcome("", png), None);
    }

    #[test]
    fn the_shot_script_waits_for_ready_prints_the_window_and_kills_the_app() {
        let path = crate::desktop_root().join("xtask/scripts/shot.ps1");
        let script = std::fs::read_to_string(path).unwrap();
        for needed in [
            "ReadyFile",
            "PrintWindow",
            ", 2)",
            "Kill",
            "finally",
            "Stop-Process",
        ] {
            assert!(script.contains(needed), "shot.ps1 lacks {needed}");
        }
        assert!(!script.contains("CopyFromScreen"));
        // The ready file of an earlier run is removed before the exe starts.
        let remove = script.find("Remove-Item -LiteralPath $ReadyFile").unwrap();
        assert!(remove < script.find("Start-Process -FilePath").unwrap());
        for (word, code) in [
            ("NO GUI WINDOW (", "$code = 1"),
            ("BLANK (", "$code = 4"),
            ("NOT READY after", "$code = 5"),
            ("TOO BIG (", "exit 6"),
        ] {
            let at = script.find(word).unwrap_or_else(|| panic!("no {word}"));
            assert!(script[at..].contains(code), "{word} without {code}");
            assert!(script.ends_with("exit $code\n"));
        }
        // Whatever ended the shot, every process of the exe's name is stopped last.
        let stop = script.rfind("Stop-Process").unwrap();
        assert!(stop > script.rfind("PrintWindow").unwrap());
        assert!(script[..stop].contains("finally"));
    }

    #[test]
    fn the_shot_call_passes_the_scene_size_ready_file_and_picture() {
        let scene = crate::scenes::find("thread-bash").unwrap();
        let script = shot_script(&scene, (1024, 700));
        assert!(
            script.starts_with(
                r"& 'C:\dev\tools\closta\desktop\xtask\scripts\shot.ps1' -Exe 'C:\dev\tools\closta\desktop\target\release\closta.exe' -ArgList @('--replay','C:\dev\tools\closta\replay\02-tool-bash-autorun.ndjson','--prompt','Run this exact bash command and report its output: echo hello-from-capture')"
            ),
            "{script}"
        );
        assert!(
            script.ends_with(
                r"-Width 1024 -Height 700 -ReadyFile 'C:\dev\tools\closta\shots\thread-bash-1024x700.ready' -Out 'C:\dev\tools\closta\shots\thread-bash-1024x700.png'; exit $LASTEXITCODE"
            ),
            "{script}"
        );
        assert_eq!(shot_stem(&scene, (2560, 1440)), "thread-bash-2560x1440");
    }

    #[test]
    fn the_needs_you_run_replays_eight_slots_with_four_streaming() {
        let args = scene_args(PerfScene::NeedsYou);
        let replays: Vec<_> = args
            .windows(2)
            .filter(|pair| pair[0] == "--replay")
            .map(|pair| pair[1].as_str())
            .collect();
        assert_eq!(replays.len(), 8);
        let streaming = replays
            .iter()
            .filter(|it| it.ends_with(r"\stream.ndjson"))
            .count();
        assert_eq!(streaming, 4);
        assert!(args.windows(2).any(|pair| pair == ["--pace", "30"]));
        assert!(
            args.windows(2)
                .any(|pair| pair == ["--exit-after-replay", "3000"])
        );
    }
}
