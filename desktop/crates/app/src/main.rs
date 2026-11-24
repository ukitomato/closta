#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(feature = "replay")]
mod args;
mod logging;
mod ports;
#[cfg(feature = "replay")]
mod probe;
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
            probe: None,
            ports: ports::real_ports(),
        }
    };
    closta_platform::run(options);
    ExitCode::SUCCESS
}

/// The window and the slots the replay build was started with: the replays and what is
/// measured of them, or else the real folders and the failing launch of a check and its probe.
#[cfg(feature = "replay")]
fn replay_options(
    header: closta_shell::header::AppHeader,
    started: Instant,
) -> Result<PlatformOptions, String> {
    use std::time::Duration;

    let args = args::parse(std::env::args().skip(1))?;
    if args.replays.is_empty() {
        return probe_options(header, args);
    }
    let pace = Duration::from_millis(args.pace_ms);
    let (slots, controls): (Vec<_>, Vec<_>) = args
        .replays
        .iter()
        .map(|replay| replay::slot_launch(replay, pace))
        .collect::<Result<Vec<_>, _>>()?
        .into_iter()
        .unzip();
    // The failing launch opens after the replays, so a scene lists its slots in argument order.
    let mut slots = slots;
    if let Some(code) = args.fail_launch {
        slots.push(probe::fail_launch(code, args.fail_distro.clone()));
    }
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
        probe: None,
        ports: ports::real_ports(),
    })
}

/// A check's run: a real `claude` in each `--open-folder`, then the failing launch, and the
/// probe that writes the ready file and closes the window.
#[cfg(feature = "replay")]
fn probe_options(
    header: closta_shell::header::AppHeader,
    args: args::AppArgs,
) -> Result<PlatformOptions, String> {
    use std::sync::Arc;
    use std::time::Duration;

    let mut ports = ports::real_ports();
    // Wrapped before any folder is planned: every real session gets the mark and the
    // configuration, a Restart's too.
    if args.mark_children.is_some() || args.mcp_config.is_some() {
        ports.planner_for = Arc::new(probe::ProbePlannerFor {
            inner: ports.planner_for,
            mark: args.mark_children.clone(),
            mcp_config: args.mcp_config.clone(),
        });
    }
    let mut slots = args
        .open_folders
        .iter()
        .map(|folder| probe::open_folder(folder, &ports))
        .collect::<Result<Vec<_>, _>>()?;
    if let Some(code) = args.fail_launch {
        slots.push(probe::fail_launch(code, args.fail_distro.clone()));
    }
    let probe = (args.ready_file.is_some() || args.close_after_ms.is_some()).then(|| {
        closta_platform::Probe {
            ready_file: args.ready_file.clone(),
            close_after: args.close_after_ms.map(Duration::from_millis),
        }
    });
    Ok(PlatformOptions {
        header,
        slots,
        window: args.window,
        panes: args.panes,
        measure: None,
        probe,
        ports,
    })
}
