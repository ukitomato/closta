use std::path::Path;
use std::process::Command;

use anyhow::{Context, bail};

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
}

impl Step {
    fn name(&self) -> &str {
        match self {
            Step::Command { name, .. } => name,
            Step::Layers => "layers",
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
pub fn perf_steps() -> Vec<Step> {
    vec![locked_cargo(
        "perf",
        &[
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
        ],
    )]
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
        let [Step::Command { program, args, .. }] = steps.as_slice() else {
            panic!("one command");
        };
        assert_eq!(program, "flock");
        assert_eq!(args[..3], strings(&[LOCK, "cargo", "nextest"]));
        for pair in [
            ["--cargo-profile", "release"],
            ["--run-ignored", "ignored-only"],
        ] {
            assert!(args.windows(2).any(|it| it == pair), "{pair:?}");
        }
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
