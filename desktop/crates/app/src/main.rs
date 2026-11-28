#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(feature = "replay")]
mod args;
mod list_saved;
mod logging;
mod ports;
#[cfg(feature = "replay")]
mod probe;
#[cfg(feature = "replay")]
mod replay;
mod saved;
mod settings;

use std::process::ExitCode;
use std::sync::Arc;
use std::time::Instant;

use closta_platform::PlatformOptions;
use closta_shell::settings::{MemorySettings, Settings, SettingsSink, sink_for_run};

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
    let options = {
        let args = match args::parse(std::env::args().skip(1)) {
            Ok(args) => args,
            Err(error) => {
                eprintln!("closta: {error}");
                return ExitCode::from(USAGE);
            }
        };
        if let Some(folder) = &args.list_saved {
            return list_saved::run(folder, args.ready_file.as_deref());
        }
        match replay_options(header, started, args) {
            Ok(options) => options,
            Err(error) => {
                eprintln!("closta: {error}");
                return ExitCode::from(USAGE);
            }
        }
    };
    #[cfg(not(feature = "replay"))]
    let options = {
        let _ = started;
        match list_saved::parse_release(std::env::args().skip(1)) {
            Ok(None) => {}
            Ok(Some((folder, ready_file))) => {
                return list_saved::run(&folder, ready_file.as_deref());
            }
            Err(error) => {
                eprintln!("closta: {error}");
                return ExitCode::from(USAGE);
            }
        }
        let (projects, settings) = kept_settings(true);
        PlatformOptions {
            header,
            slots: Vec::new(),
            window: None,
            panes: None,
            measure: None,
            probe: None,
            ports: ports::real_ports(settings),
            projects,
            open_resume: false,
        }
    };
    closta_platform::run(options);
    ExitCode::SUCCESS
}

/// The projects kept on this machine and the writer that keeps them; when the run keeps
/// nothing, the file is neither read nor made.
fn kept_settings(keeps: bool) -> (Settings, Arc<dyn SettingsSink>) {
    let mut projects = Settings::default();
    let sink = sink_for_run(keeps, || {
        match settings::settings_dir(std::env::var_os("LOCALAPPDATA")) {
            Some(dir) => {
                let (read, sink) = settings::load(&dir);
                projects = read;
                sink
            }
            None => {
                tracing::info!("the settings have no place, so the projects are not kept");
                Arc::new(MemorySettings)
            }
        }
    });
    (projects, sink)
}

/// The ports of a replay or a check: the real ones, except that `--config-dir` fixes the place
/// every project's saved sessions are read from.
#[cfg(feature = "replay")]
fn replay_ports(
    settings: Arc<dyn SettingsSink>,
    args: &args::AppArgs,
) -> closta_shell::state::Ports {
    let mut ports = ports::real_ports(settings);
    if let Some(dir) = &args.config_dir {
        ports.saved_for = Arc::new(saved::RealSavedFor::in_config_dir(dir.clone()));
    }
    ports
}

/// The window and the slots the replay build was started with: the replays and what is
/// measured of them, or else the real folders and the failing launch of a check and its probe.
#[cfg(feature = "replay")]
fn replay_options(
    header: closta_shell::header::AppHeader,
    started: Instant,
    args: args::AppArgs,
) -> Result<PlatformOptions, String> {
    use std::time::Duration;

    if args.replays.is_empty() {
        return probe_options(header, args);
    }
    let pace = Duration::from_millis(args.pace_ms);
    let (mut slots, controls): (Vec<_>, Vec<_>) = args
        .replays
        .iter()
        .map(|replay| replay::slot_launch(replay, pace))
        .collect::<Result<Vec<_>, _>>()?
        .into_iter()
        .unzip();
    // The failing launch opens after the replays.
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
    // A replay reads and writes no settings; its projects are the ones it was given.
    let projects = args.settings();
    let (_, settings) = kept_settings(false);
    Ok(PlatformOptions {
        header,
        slots,
        window: args.window,
        panes: args.panes,
        measure,
        probe: None,
        ports: replay_ports(settings, &args),
        projects,
        open_resume: args.open_resume,
    })
}

/// A check's run: a real `claude` in each `--open-folder`, then the failing launch, and the
/// probe that writes the ready file and closes the window.
#[cfg(feature = "replay")]
fn probe_options(
    header: closta_shell::header::AppHeader,
    args: args::AppArgs,
) -> Result<PlatformOptions, String> {
    use std::time::Duration;

    // A check reads and writes no settings; its projects are the ones it was given.
    let projects = args.settings();
    let (_, settings) = kept_settings(false);
    let mut ports = replay_ports(settings, &args);
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
        projects,
        open_resume: args.open_resume,
    })
}
