#![allow(clippy::print_stdout, clippy::print_stderr)]

mod check;
mod layers;
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
        "win-build" => {
            let flags: Vec<String> = std::env::args().skip(2).collect();
            if let Some(flag) = flags.iter().find(|f| *f != "--release" && *f != "--run") {
                eprintln!("unknown win-build flag: {flag:?}");
                return ExitCode::FAILURE;
            }
            let has = |name: &str| flags.iter().any(|f| f == name);
            match win::win_build(&desktop_root(), has("--release"), has("--run")) {
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
