#![allow(clippy::print_stdout, clippy::print_stderr)]

use std::process::ExitCode;

fn main() -> ExitCode {
    let command = std::env::args().nth(1).unwrap_or_default();
    eprintln!("unknown command: {command:?}");
    ExitCode::FAILURE
}
