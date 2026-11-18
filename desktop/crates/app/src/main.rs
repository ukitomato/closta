#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(feature = "replay")]
mod args;
#[cfg(feature = "replay")]
mod replay;

use std::process::ExitCode;

use closta_platform::PlatformOptions;

/// What a bad argument ends the app with.
const USAGE: u8 = 2;

#[allow(clippy::print_stderr)]
fn main() -> ExitCode {
    let header =
        closta_shell::header::app_header(&closta_core::describe_app(&closta_providers::BuildInfo));
    #[cfg(feature = "replay")]
    let options = match replay_options(header) {
        Ok(options) => options,
        Err(error) => {
            eprintln!("closta: {error}");
            return ExitCode::from(USAGE);
        }
    };
    #[cfg(not(feature = "replay"))]
    let options = {
        if std::env::args().nth(1).is_some() {
            eprintln!("closta: this build takes no arguments");
            return ExitCode::from(USAGE);
        }
        PlatformOptions {
            header,
            slots: Vec::new(),
            window: None,
            panes: None,
        }
    };
    closta_platform::run(options);
    ExitCode::SUCCESS
}

/// The window and the slots of the replays the app was started with.
#[cfg(feature = "replay")]
fn replay_options(header: closta_shell::header::AppHeader) -> Result<PlatformOptions, String> {
    let args = args::parse(std::env::args().skip(1))?;
    let pace = std::time::Duration::from_millis(args.pace_ms);
    let slots = args
        .replays
        .iter()
        .map(|replay| replay::slot_launch(replay, pace).map(|(launch, _)| launch))
        .collect::<Result<_, _>>()?;
    Ok(PlatformOptions {
        header,
        slots,
        window: args.window,
        panes: args.panes,
    })
}
