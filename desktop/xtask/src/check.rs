use std::path::Path;
use std::process::Command;

use anyhow::{Context, bail};

use crate::gate::{Busy, Waited, read_load, wait_for_quiet};
use crate::layers;

pub(crate) const LOCK: &str = "/tmp/closta-gradle.lock";

/// One stage of `cargo xtask check`.
pub enum Step {
    Command {
        name: &'static str,
        program: String,
        args: Vec<String>,
    },
    Layers,
    /// Waits for a quiet machine; `perf` measures only when the load is below the core count.
    Gate,
}

impl Step {
    fn name(&self) -> &str {
        match self {
            Step::Command { name, .. } => name,
            Step::Layers => "layers",
            Step::Gate => "gate",
        }
    }
}

fn strings(parts: &[&str]) -> Vec<String> {
    parts.iter().map(|part| (*part).to_owned()).collect()
}

/// A cargo invocation run under the shared lock so heavy builds never overlap.
pub(crate) fn locked_cargo(name: &'static str, cargo_args: &[&str]) -> Step {
    let mut args = strings(&[LOCK, "cargo"]);
    args.extend(strings(cargo_args));
    Step::Command {
        name,
        program: "flock".to_owned(),
        args,
    }
}

/// The stages in the order they run.
pub fn steps() -> Vec<Step> {
    // The GPUI crates are not built for Linux, so they are excluded here and
    // checked for Windows through cargo-xwin instead.
    vec![
        locked_cargo("fmt", &["fmt", "--all", "--check"]),
        Step::Layers,
        locked_cargo(
            "clippy (linux)",
            &[
                "clippy",
                "--workspace",
                "--exclude",
                "closta-platform",
                "--exclude",
                "closta",
                "--all-targets",
                "--",
                "-D",
                "warnings",
            ],
        ),
        locked_cargo(
            "clippy (windows)",
            &[
                "xwin",
                "clippy",
                "--target",
                "x86_64-pc-windows-msvc",
                "-p",
                "closta-platform",
                "-p",
                "closta",
                "-p",
                "closta-providers",
                "--features",
                "closta/replay,closta/profiler",
                "--all-targets",
                "--",
                "-D",
                "warnings",
            ],
        ),
        locked_cargo(
            "test",
            &[
                "nextest",
                "run",
                "--workspace",
                "--exclude",
                "closta-platform",
                "--exclude",
                "closta",
            ],
        ),
        Step::Command {
            name: "deny",
            program: "cargo".to_owned(),
            args: strings(&["deny", "check"]),
        },
    ]
}

/// `cargo xtask perf`: the wall-clock budgets (`#[ignore = "perf"]`), built in release and run
/// one at a time so they do not time each other. They stay out of `check`: they measure time.
/// Only tests named `within_budget` run: a perf test without `within_budget` in its name never
/// runs, and `every_perf_test_is_named_within_budget` stops one. nextest serialises tests under
/// `--no-capture`, which is what runs them one at a time.
///
/// The build comes first so the gate reads the load without the compiler in it, and the run then
/// builds nothing. None of the three takes the lock: `perf` holds it around all of them.
pub fn perf_steps() -> Vec<Step> {
    let run = strings(&PERF_RUN);
    let mut build: Vec<String> = run
        .iter()
        .filter(|it| *it != "--no-capture")
        .cloned()
        .collect();
    build.push("--no-run".to_owned());
    vec![
        Step::Command {
            name: "perf build",
            program: "cargo".to_owned(),
            args: build,
        },
        Step::Gate,
        Step::Command {
            name: "perf",
            program: "cargo".to_owned(),
            args: run,
        },
    ]
}

/// The arguments of the measuring run.
const PERF_RUN: [&str; 14] = [
    "nextest",
    "run",
    "--cargo-profile",
    "release",
    "--workspace",
    "--exclude",
    "closta-platform",
    "--exclude",
    "closta",
    "--run-ignored",
    "ignored-only",
    "-E",
    "test(/within_budget/)",
    "--no-capture",
];

/// The lock `perf` waits for, around the whole of `perf-held` run by `exe`.
pub fn perf_locked(exe: &Path) -> (String, Vec<String>) {
    let mut args = strings(&["-w", "1800", LOCK]);
    args.push(exe.display().to_string());
    args.push("perf-held".to_owned());
    ("flock".to_owned(), args)
}

/// The exit code a child's status passes on; a child killed by a signal has none.
pub fn exit_code_of(status: Option<i32>) -> u8 {
    status.and_then(|code| u8::try_from(code).ok()).unwrap_or(1)
}

/// The exit code `perf-held` ends with: 2 when the machine stayed busy, 1 for any other failure.
pub fn held_exit_code(result: &anyhow::Result<()>) -> u8 {
    match result {
        Ok(()) => 0,
        Err(err) if err.downcast_ref::<Busy>().is_some() => 2,
        Err(_) => 1,
    }
}

/// Runs `program` and returns the exit code it ended with, as `perf` passes it on.
pub fn run_child(program: &str, args: &[String]) -> u8 {
    match Command::new(program).args(args).status() {
        Ok(status) => exit_code_of(status.code()),
        Err(err) => {
            eprintln!("could not start `{program}`: {err}");
            1
        }
    }
}

/// The `gate` step: waits while the 1-minute load is at or above the core count, then says the
/// load it runs at, or ends with `Busy`.
fn wait_for_a_quiet_machine() -> anyhow::Result<()> {
    let cores = std::thread::available_parallelism().map_or(1, usize::from);
    let waited = wait_for_quiet(
        &mut || read_load(std::fs::read_to_string("/proc/loadavg").ok().as_deref()),
        &mut std::thread::sleep,
        cores,
    );
    match waited {
        Waited::Quiet(Some(load)) => println!("perf: load {load:.1} of {cores} cores"),
        Waited::Quiet(None) => println!("perf: the load could not be read; perf runs"),
        Waited::Busy(load) => return Err(Busy { load, cores }.into()),
    }
    Ok(())
}

/// `cargo xtask real-cli`: the round trip with the real `claude` on PATH (`#[ignore = "real-cli"]`).
/// It stays out of `check`: it needs a signed-in CLI. It sends no user message, so it costs nothing.
pub fn real_cli_steps() -> Vec<Step> {
    vec![locked_cargo(
        "real-cli",
        &[
            "nextest",
            "run",
            "-p",
            "closta-providers",
            "--run-ignored",
            "ignored-only",
            "-E",
            "binary(real_cli)",
            "--no-capture",
        ],
    )]
}

/// Runs the stages in order, stopping at the first failure.
pub fn run_steps(root: &Path, steps: &[Step]) -> anyhow::Result<()> {
    for step in steps {
        let name = step.name();
        println!("==> {name}");
        match step {
            Step::Layers => layers::run(root).with_context(|| format!("step `{name}` failed"))?,
            Step::Gate => wait_for_a_quiet_machine()?,
            Step::Command { program, args, .. } => {
                let status = Command::new(program)
                    .args(args)
                    .current_dir(root)
                    .status()
                    .with_context(|| format!("step `{name}` could not start `{program}`"))?;
                if !status.success() {
                    bail!("step `{name}` failed with {status}");
                }
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn command(name: &'static str, program: &str, args: &[&str]) -> Step {
        Step::Command {
            name,
            program: program.to_owned(),
            args: strings(args),
        }
    }

    #[test]
    fn windows_clippy_covers_the_gui_crates_and_the_providers() {
        let steps = steps();
        let Some(Step::Command { args, .. }) =
            steps.iter().find(|s| s.name() == "clippy (windows)")
        else {
            panic!("a clippy (windows) step");
        };
        for package in ["closta-platform", "closta", "closta-providers"] {
            let pair = ["-p", package];
            assert!(args.windows(2).any(|it| it == pair), "{pair:?}");
        }
        let features = ["--features", "closta/replay,closta/profiler"];
        assert!(args.windows(2).any(|it| it == features), "{args:?}");
    }

    #[test]
    fn steps_run_in_the_documented_order() {
        let names: Vec<_> = steps().iter().map(|s| s.name().to_owned()).collect();
        assert_eq!(
            names,
            [
                "fmt",
                "layers",
                "clippy (linux)",
                "clippy (windows)",
                "test",
                "deny"
            ]
        );
    }

    #[test]
    fn cargo_steps_hold_the_gradle_lock() {
        for step in steps() {
            if let Step::Command {
                name,
                program,
                args,
            } = step
            {
                if name == "deny" {
                    assert_eq!(program, "cargo");
                } else {
                    assert_eq!(program, "flock", "{name}");
                    assert_eq!(args[0], "/tmp/closta-gradle.lock", "{name}");
                    assert_eq!(args[1], "cargo", "{name}");
                }
            }
        }
    }

    #[test]
    fn perf_runs_only_the_ignored_budgets_in_release_under_the_lock() {
        let steps = perf_steps();
        let Some(Step::Command { program, args, .. }) = steps.last() else {
            panic!("a last command");
        };
        assert_eq!(program, "cargo");
        assert_eq!(args[..2], strings(&["nextest", "run"]));
        for pair in [
            ["--cargo-profile", "release"],
            ["--run-ignored", "ignored-only"],
            ["-E", "test(/within_budget/)"],
        ] {
            assert!(args.windows(2).any(|it| it == pair), "{pair:?}");
        }
    }

    #[test]
    fn perf_builds_waits_for_a_quiet_machine_then_runs() {
        let steps = perf_steps();
        let [
            Step::Command {
                program: build_program,
                args: build,
                ..
            },
            Step::Gate,
            Step::Command {
                program: run_program,
                args: run,
                ..
            },
        ] = steps.as_slice()
        else {
            panic!("build, gate, run");
        };
        assert_eq!(build_program, "cargo");
        assert_eq!(run_program, "cargo");
        assert!(build.iter().any(|it| it == "--no-run"), "{build:?}");
        assert!(!build.iter().any(|it| it == "--no-capture"), "{build:?}");
        let release = ["--cargo-profile", "release"];
        assert!(build.windows(2).any(|it| it == release), "{build:?}");
        assert!(run.iter().any(|it| it == "--no-capture"), "{run:?}");
        assert!(!run.iter().any(|it| it == "--no-run"), "{run:?}");
        let without: Vec<_> = run.iter().filter(|it| *it != "--no-capture").collect();
        let built: Vec<_> = build.iter().filter(|it| *it != "--no-run").collect();
        assert_eq!(without, built, "the run builds nothing the build did not");
    }

    #[test]
    fn perf_takes_the_lock_once_around_the_three() {
        let exe = Path::new("/x/target/debug/xtask");
        let (program, args) = perf_locked(exe);
        assert_eq!(program, "flock");
        assert_eq!(
            args,
            strings(&["-w", "1800", LOCK, "/x/target/debug/xtask", "perf-held"])
        );
    }

    #[test]
    fn a_busy_machine_ends_perf_held_with_two() {
        let busy = crate::gate::Busy {
            load: 30.0,
            cores: 28,
        };
        assert_eq!(held_exit_code(&Ok(())), 0);
        assert_eq!(held_exit_code(&Err(busy.into())), 2);
        assert_eq!(
            held_exit_code(&Err(anyhow::Error::new(busy).context("step `gate`"))),
            2
        );
        assert_eq!(
            held_exit_code(&Err(anyhow::anyhow!("step `perf` failed"))),
            1
        );
    }

    #[test]
    fn perf_passes_the_child_exit_code_through() {
        assert_eq!(exit_code_of(Some(2)), 2);
        assert_eq!(exit_code_of(Some(1)), 1);
        assert_eq!(exit_code_of(Some(0)), 0);
        assert_eq!(exit_code_of(None), 1);
        for code in [0, 1, 2] {
            let script = strings(&["-c", &format!("exit {code}")]);
            assert_eq!(run_child("sh", &script), code, "a child exiting {code}");
        }
        assert_eq!(run_child("/nonexistent/closta-xtask-child", &[]), 1);
    }

    #[test]
    fn real_cli_runs_only_the_real_cli_binary_under_the_lock() {
        let steps = real_cli_steps();
        let [
            Step::Command {
                name,
                program,
                args,
            },
        ] = steps.as_slice()
        else {
            panic!("one command");
        };
        assert_eq!(*name, "real-cli");
        assert_eq!(program, "flock");
        assert_eq!(args[..3], strings(&[LOCK, "cargo", "nextest"]));
        for pair in [
            ["-p", "closta-providers"],
            ["--run-ignored", "ignored-only"],
            ["-E", "binary(real_cli)"],
        ] {
            assert!(args.windows(2).any(|it| it == pair), "{pair:?}");
        }
        assert!(args.iter().any(|it| it == "--no-capture"));
    }

    /// The `.rs` files under `dir`, at any depth.
    fn rust_files(dir: &Path, found: &mut Vec<std::path::PathBuf>) {
        let Ok(entries) = std::fs::read_dir(dir) else {
            return;
        };
        for entry in entries {
            let path = entry.unwrap().path();
            if path.is_dir() {
                rust_files(&path, found);
            } else if path.extension().is_some_and(|it| it == "rs") {
                found.push(path);
            }
        }
    }

    /// The names of the functions marked `#[ignore = "perf"]` in `text`, however the attribute is
    /// spaced; the name is on the first later line that starts a fn, skipping comments and
    /// attributes.
    fn perf_test_names(text: &str) -> Vec<String> {
        let mut names = Vec::new();
        let mut lines = text.lines();
        while let Some(line) = lines.next() {
            let squeezed: String = line.split_whitespace().collect();
            if !(line.trim_start().starts_with("#[")
                && squeezed.contains("ignore")
                && squeezed.contains("\"perf\""))
            {
                continue;
            }
            let name = lines
                .by_ref()
                .map(str::trim)
                .filter(|it| !it.starts_with("//") && !it.starts_with("#["))
                .find_map(|it| {
                    ["fn ", "pub fn ", "async fn ", "pub async fn "]
                        .iter()
                        .find_map(|prefix| it.strip_prefix(prefix))
                })
                .and_then(|rest| rest.split(['(', '<']).next())
                .unwrap_or_else(|| panic!("a perf test without a fn"));
            names.push(name.trim().to_owned());
        }
        names
    }

    #[test]
    fn the_perf_scanner_reads_any_spacing_and_skips_comments() {
        let text = "#[test]\n#[ignore=\"perf\"]\n/// Runs a fn the budget names.\n// fn decoy() {}\n\
                    #[allow(dead_code)]\npub fn slow_within_budget() {}\n\
                    #[ignore = \"other\"]\nfn not_perf() {}\n";
        assert_eq!(perf_test_names(text), ["slow_within_budget"]);
    }

    #[test]
    fn every_perf_test_is_named_within_budget() {
        let crates = Path::new(env!("CARGO_MANIFEST_DIR")).join("../crates");
        let mut files = Vec::new();
        for krate in std::fs::read_dir(&crates).unwrap() {
            let krate = krate.unwrap().path();
            rust_files(&krate.join("src"), &mut files);
            rust_files(&krate.join("tests"), &mut files);
        }
        let mut names = Vec::new();
        for file in &files {
            let text = std::fs::read_to_string(file).unwrap();
            for name in perf_test_names(&text) {
                names.push((file.display().to_string(), name));
            }
        }
        assert!(!names.is_empty(), "no perf test under {}", crates.display());
        let unnamed: Vec<_> = names
            .iter()
            .filter(|(_, name)| !name.contains("within_budget"))
            .collect();
        assert!(
            unnamed.is_empty(),
            "perf tests `cargo xtask perf` never runs: {unnamed:?}"
        );
    }

    #[test]
    fn run_steps_stops_at_first_failure() {
        let dir = std::env::temp_dir().join(format!("closta-xtask-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let marker = dir.join("ran");
        let plan = [
            command("first", "true", &[]),
            command("second", "false", &[]),
            command("third", "touch", &[marker.to_str().unwrap()]),
        ];
        let err = run_steps(&dir, &plan).unwrap_err();
        assert!(err.to_string().contains("second"));
        assert!(!marker.exists());
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
