use std::path::Path;
use std::process::Command;

use anyhow::{Context, bail};

use crate::layers;

const LOCK: &str = "/tmp/closta-gradle.lock";

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
fn locked_cargo(name: &'static str, cargo_args: &[&str]) -> Step {
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
