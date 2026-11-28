#![allow(clippy::print_stdout, clippy::print_stderr)]

mod capture;
mod check;
mod gate;
mod layers;
mod perf_log;
mod real;
mod scenes;
mod win;

use std::ffi::OsString;
use std::path::PathBuf;
use std::process::ExitCode;

/// The `desktop/` directory, the parent of this crate.
pub fn desktop_root() -> PathBuf {
    desktop_root_from(
        std::env::var_os("CARGO_MANIFEST_DIR"),
        env!("CARGO_MANIFEST_DIR"),
    )
}

/// Prefers the manifest dir cargo sets at run time, since a binary built in
/// another worktree (shared target dir) carries that worktree's path.
fn desktop_root_from(runtime: Option<OsString>, built: &str) -> PathBuf {
    let manifest = runtime.map_or_else(|| PathBuf::from(built), PathBuf::from);
    manifest.parent().map(PathBuf::from).unwrap_or_default()
}

fn main() -> ExitCode {
    let command = std::env::args().nth(1).unwrap_or_default();
    if let Some(example) = capture::EXAMPLES.into_iter().find(|it| *it == command) {
        let root = desktop_root();
        return match check::run_steps(&root, &capture::steps(example, &root)) {
            Ok(()) => ExitCode::SUCCESS,
            Err(err) => {
                eprintln!("{err:#}");
                ExitCode::FAILURE
            }
        };
    }
    match command.as_str() {
        "layers" => match layers::run(&desktop_root()) {
            Ok(()) => ExitCode::SUCCESS,
            Err(err) => {
                eprintln!("{err:#}");
                ExitCode::FAILURE
            }
        },
        "check" => match check::run_steps(&desktop_root(), &check::steps()) {
            Ok(()) => ExitCode::SUCCESS,
            Err(err) => {
                eprintln!("{err:#}");
                ExitCode::FAILURE
            }
        },
        "perf" => {
            let exe = match std::env::current_exe() {
                Ok(exe) => exe,
                Err(err) => {
                    eprintln!("perf: could not find this program: {err}");
                    return ExitCode::FAILURE;
                }
            };
            println!("perf: waiting for the build lock");
            let (program, args) = check::perf_locked(&exe);
            let code = check::run_child(&program, &args);
            if let Some(note) = check::perf_exit_note(code) {
                eprintln!("{note}");
            }
            ExitCode::from(code)
        }
        "perf-held" => {
            let result = check::run_steps(&desktop_root(), &check::perf_steps());
            if let Err(err) = &result {
                eprintln!("{err:#}");
            }
            ExitCode::from(check::held_exit_code(&result))
        }
        "real-cli" => match check::run_steps(&desktop_root(), &check::real_cli_steps()) {
            Ok(()) => ExitCode::SUCCESS,
            Err(err) => {
                eprintln!("{err:#}");
                ExitCode::FAILURE
            }
        },
        "win-build" | "win-test" => {
            let build = command == "win-build";
            let args: Vec<String> = std::env::args().skip(2).collect();
            let flags = match win::parse_flags(&args, build) {
                Ok(flags) => flags,
                Err(err) => {
                    eprintln!("{command}: {err}");
                    return ExitCode::FAILURE;
                }
            };
            let root = desktop_root();
            let result = if build {
                win::win_build(&root, flags.release, flags.run, &flags.features)
            } else {
                win::win_test(&root, &flags.features)
            };
            match result {
                Ok(()) => ExitCode::SUCCESS,
                Err(err) => {
                    eprintln!("{err:#}");
                    ExitCode::FAILURE
                }
            }
        }
        "win-perf" => {
            let mut scenes = Vec::new();
            for name in std::env::args().skip(2) {
                match perf_log::PerfScene::from_name(&name) {
                    Some(scene) => scenes.push(scene),
                    None => {
                        eprintln!(
                            "win-perf: unknown scene {name:?} (synth, stream, idle, needs-you or resume)"
                        );
                        return ExitCode::FAILURE;
                    }
                }
            }
            if scenes.is_empty() {
                scenes = perf_log::PerfScene::ALL.to_vec();
            }
            match win::win_perf(&desktop_root(), &scenes) {
                Ok(()) => ExitCode::SUCCESS,
                Err(err) => {
                    eprintln!("{err:#}");
                    ExitCode::FAILURE
                }
            }
        }
        "win-real" => match real::win_real(&desktop_root()) {
            Ok(()) => ExitCode::SUCCESS,
            Err(err) => {
                eprintln!("{err:#}");
                ExitCode::FAILURE
            }
        },
        "win-shot" => {
            let which = std::env::args().nth(2).unwrap_or_default();
            let chosen = if which == "all" {
                scenes::scenes()
            } else if let Some(scene) = scenes::find(&which) {
                vec![scene]
            } else {
                let names: Vec<_> = scenes::scenes().iter().map(|it| it.name).collect();
                eprintln!(
                    "win-shot: name a scene or all ({}), got {which:?}",
                    names.join(", ")
                );
                return ExitCode::FAILURE;
            };
            match win::win_shot(&desktop_root(), &chosen) {
                Ok(()) => ExitCode::SUCCESS,
                Err(err) => {
                    eprintln!("{err:#}");
                    ExitCode::FAILURE
                }
            }
        }
        _ => {
            eprintln!("unknown command: {command:?}");
            ExitCode::FAILURE
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn runtime_manifest_dir_wins() {
        let root = desktop_root_from(Some("/a/desktop/xtask".into()), "/b/desktop/xtask");
        assert_eq!(root, PathBuf::from("/a/desktop"));
    }

    #[test]
    fn built_manifest_dir_is_the_fallback() {
        let root = desktop_root_from(None, "/b/desktop/xtask");
        assert_eq!(root, PathBuf::from("/b/desktop"));
    }

    #[test]
    fn desktop_root_contains_workspace_manifest() {
        let manifest = std::fs::read_to_string(desktop_root().join("Cargo.toml")).unwrap();
        assert!(manifest.contains("[workspace]"));
    }
}
