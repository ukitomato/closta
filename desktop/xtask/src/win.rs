use std::path::{Path, PathBuf};
use std::process::Command;

use anyhow::{Context, bail};

use crate::check::LOCK;

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
}
