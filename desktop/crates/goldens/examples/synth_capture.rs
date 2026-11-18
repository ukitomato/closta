//! Writes the largest synthetic session as `<dir>/synth.ndjson`, one user cue per turn, and the
//! streamed reply of `replay-reply.md` as `<dir>/stream.ndjson`, for `closta --replay`.
#![allow(clippy::print_stderr)]

use std::path::{Path, PathBuf};
use std::process::ExitCode;

use closta_goldens::synthetic::{self, LARGEST, replay_script};

fn main() -> ExitCode {
    let Some(dir) = std::env::args_os().nth(1).map(PathBuf::from) else {
        eprintln!("usage: synth-capture <dir>");
        return ExitCode::FAILURE;
    };
    match write(&dir) {
        Ok(()) => ExitCode::SUCCESS,
        Err(err) => {
            eprintln!("the synthetic replays cannot be written: {err}");
            ExitCode::FAILURE
        }
    }
}

fn write(dir: &Path) -> std::io::Result<()> {
    let reply = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../../jetbrains/src/testFixtures/resources/bench/replay-reply.md");
    let markdown = std::fs::read_to_string(reply)?;
    std::fs::create_dir_all(dir)?;
    std::fs::write(
        dir.join("synth.ndjson"),
        synthetic::replay_file(&synthetic::replay_lines(&LARGEST, 1)),
    )?;
    std::fs::write(
        dir.join("stream.ndjson"),
        synthetic::replay_file(&replay_script::replay_lines(&markdown, "stream")),
    )
}
