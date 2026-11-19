#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(feature = "replay")]
mod args;
mod logging;
mod ports;
#[cfg(feature = "replay")]
mod replay;

use std::process::ExitCode;
use std::time::Instant;

use closta_platform::PlatformOptions;

/// What a bad argument ends the app with.
const USAGE: u8 = 2;

#[allow(clippy::print_stderr)]
fn main() -> ExitCode {
    logging::init();
    logging::install_panic_hook();
    // Every time a measured run logs is from here.
    let started = Instant::now();
    let header =
        closta_shell::header::app_header(&closta_core::describe_app(&closta_providers::BuildInfo));
    #[cfg(feature = "replay")]
    let options = match replay_options(header, started) {
        Ok(options) => options,
        Err(error) => {
            eprintln!("closta: {error}");
            return ExitCode::from(USAGE);
        }
    };
    #[cfg(not(feature = "replay"))]
    let options = {
        let _ = started;
        if std::env::args().nth(1).is_some() {
            eprintln!("closta: this build takes no arguments");
            return ExitCode::from(USAGE);
        }
        PlatformOptions {
            header,
            slots: Vec::new(),
            window: None,
            panes: None,
            measure: None,
            ports: ports::real_ports(),
        }
    };
    closta_platform::run(options);
    ExitCode::SUCCESS
}

/// The window and the slots of the replays the app was started with, and what is measured.
#[cfg(feature = "replay")]
fn replay_options(
    header: closta_shell::header::AppHeader,
    started: Instant,
) -> Result<PlatformOptions, String> {
    use std::time::Duration;

    let args = args::parse(std::env::args().skip(1))?;
    let pace = Duration::from_millis(args.pace_ms);
    let (slots, controls): (Vec<_>, Vec<_>) = args
        .replays
        .iter()
        .map(|replay| replay::slot_launch(replay, pace))
        .collect::<Result<Vec<_>, _>>()?
        .into_iter()
        .unzip();
    let measure = args.measures().then(|| closta_platform::Measure {
        started,
        perf_log: args.perf_log.clone(),
        ready_file: args.ready_file.clone(),
        finished: Some(replay::finished_all(&controls)),
        exit_after: args.exit_after_ms.map(Duration::from_millis),
        scroll_through: args.scroll_through,
    });
    Ok(PlatformOptions {
        header,
        slots,
        window: args.window,
        panes: args.panes,
        measure,
        ports: ports::real_ports(),
    })
}
