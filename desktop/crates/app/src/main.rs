#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(feature = "replay")]
mod args;
#[cfg(feature = "replay")]
mod replay;

use std::process::ExitCode;

/// What a bad argument ends the app with.
const USAGE: u8 = 2;

#[allow(clippy::print_stderr)]
fn main() -> ExitCode {
    #[cfg(feature = "replay")]
    if let Err(error) = replay_slots() {
        eprintln!("closta: {error}");
        return ExitCode::from(USAGE);
    }
    #[cfg(not(feature = "replay"))]
    if std::env::args().nth(1).is_some() {
        eprintln!("closta: this build takes no arguments");
        return ExitCode::from(USAGE);
    }
    closta_platform::run(closta_shell::header::app_header(
        &closta_core::describe_app(&closta_providers::BuildInfo),
    ));
    ExitCode::SUCCESS
}

/// The slots of the replays the app was started with.
#[cfg(feature = "replay")]
fn replay_slots() -> Result<Vec<closta_shell::slot::SlotLaunch>, String> {
    let args = args::parse(std::env::args().skip(1))?;
    let pace = std::time::Duration::from_millis(args.pace_ms);
    args.replays
        .iter()
        .map(|replay| replay::slot_launch(replay, pace).map(|(launch, _)| launch))
        .collect()
}
