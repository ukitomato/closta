//! Writes the gallery's conversation as `<dir>/gallery.ndjson`, for `closta --replay`.
#![allow(clippy::print_stderr)]

use std::path::PathBuf;
use std::process::ExitCode;

use closta_goldens::{gallery, synthetic};

fn main() -> ExitCode {
    let Some(dir) = std::env::args_os().nth(1).map(PathBuf::from) else {
        eprintln!("usage: gallery-capture <dir>");
        return ExitCode::FAILURE;
    };
    let text = synthetic::replay_file(&gallery::replay_lines());
    match std::fs::create_dir_all(&dir)
        .and_then(|()| std::fs::write(dir.join("gallery.ndjson"), text))
    {
        Ok(()) => ExitCode::SUCCESS,
        Err(err) => {
            eprintln!("gallery.ndjson cannot be written: {err}");
            ExitCode::FAILURE
        }
    }
}
