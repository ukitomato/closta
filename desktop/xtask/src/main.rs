#![allow(clippy::print_stdout, clippy::print_stderr)]

mod layers;

use std::path::PathBuf;
use std::process::ExitCode;

/// The `desktop/` directory, the parent of this crate.
pub fn desktop_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(PathBuf::from)
        .unwrap_or_default()
}

fn main() -> ExitCode {
    let command = std::env::args().nth(1).unwrap_or_default();
    match command.as_str() {
        "layers" => match layers::run(&desktop_root()) {
            Ok(()) => ExitCode::SUCCESS,
            Err(err) => {
                eprintln!("{err}");
                ExitCode::FAILURE
            }
        },
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
    fn desktop_root_contains_workspace_manifest() {
        let manifest = std::fs::read_to_string(desktop_root().join("Cargo.toml")).unwrap();
        assert!(manifest.contains("[workspace]"));
    }
}
