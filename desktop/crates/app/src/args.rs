//! The development arguments of the replay build. `--prompt`, `--stop-at` and `--stdin-log`
//! belong to the `--replay` before them; `--pace`, `--window`, `--pane`, `--ready-file` and the
//! measuring options (`--perf-log`, `--exit-after-replay`, `--scroll-through`) apply to the whole
//! run. The checks' options (`--open-folder`, `--mark-children`, `--mcp-config`, `--fail-launch`,
//! `--fail-distro`, `--close-after`) open real folders and failing launches instead of replays.
//! An error names the option, never a value: a value can be a prompt or a path.

use std::path::PathBuf;

/// One `--replay` and the options that follow it.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct ReplayArg {
    pub path: PathBuf,
    pub prompt: Option<String>,
    pub stop_at: Option<usize>,
    pub stdin_log: Option<PathBuf>,
}

/// What the replay build was started with.
#[derive(Clone, PartialEq, Debug, Default)]
pub struct AppArgs {
    pub replays: Vec<ReplayArg>,
    /// The wait between two replayed lines, in milliseconds; 0 writes them all at once.
    pub pace_ms: u64,
    /// The window's width and height.
    pub window: Option<(f32, f32)>,
    /// Whether the left and the right pane start open.
    pub panes: Option<(bool, bool)>,
    /// The empty file written once every replay has been taken in.
    pub ready_file: Option<PathBuf>,
    /// The CSV the times and counts are written to.
    pub perf_log: Option<PathBuf>,
    /// How long after every replay has been taken in the app quits, in milliseconds.
    pub exit_after_ms: Option<u64>,
    /// Whether the conversation is scrolled from its tail to its head before quitting.
    pub scroll_through: bool,
    /// The folders a real `claude` is started in, in this order.
    pub open_folders: Vec<String>,
    /// The `CLOSTA_SMOKE_MARK` the real sessions' processes are started with.
    pub mark_children: Option<String>,
    /// The MCP configuration the real sessions' `claude` is started with.
    pub mcp_config: Option<String>,
    /// The exit code of a slot whose process fails.
    pub fail_launch: Option<i32>,
    /// The WSL distribution the failing slot says it started in.
    pub fail_distro: Option<String>,
    /// How long after every slot settled the window is closed, in milliseconds.
    pub close_after_ms: Option<u64>,
}

impl AppArgs {
    /// Whether the run is measured or waited on from outside.
    pub fn measures(&self) -> bool {
        self.ready_file.is_some()
            || self.perf_log.is_some()
            || self.exit_after_ms.is_some()
            || self.scroll_through
    }
}

/// Reads the arguments after the program's name.
pub fn parse(args: impl IntoIterator<Item = String>) -> Result<AppArgs, String> {
    let mut parsed = AppArgs::default();
    let mut pace_ms = None;
    let mut args = args.into_iter();
    while let Some(arg) = args.next() {
        let option = arg.as_str();
        let mut value = || args.next().ok_or_else(|| format!("{option} needs a value"));
        match option {
            "--replay" => parsed.replays.push(ReplayArg {
                path: PathBuf::from(value()?),
                prompt: None,
                stop_at: None,
                stdin_log: None,
            }),
            "--prompt" => {
                let text = value()?;
                set(&mut replay(&mut parsed, option)?.prompt, option, text)?;
            }
            "--stop-at" => {
                let line = value()?
                    .parse()
                    .map_err(|_| format!("{option} needs a line number"))?;
                set(&mut replay(&mut parsed, option)?.stop_at, option, line)?;
            }
            "--stdin-log" => {
                let path = PathBuf::from(value()?);
                set(&mut replay(&mut parsed, option)?.stdin_log, option, path)?;
            }
            "--pace" => {
                let ms = value()?
                    .parse()
                    .map_err(|_| format!("{option} needs milliseconds"))?;
                set(&mut pace_ms, option, ms)?;
            }
            "--window" => {
                let size = window(&value()?).ok_or_else(|| format!("{option} needs <w>x<h>"))?;
                set(&mut parsed.window, option, size)?;
            }
            "--pane" => {
                let panes = panes(&value()?)
                    .ok_or_else(|| format!("{option} needs none, left, right or left,right"))?;
                set(&mut parsed.panes, option, panes)?;
            }
            "--ready-file" => {
                let path = PathBuf::from(value()?);
                set(&mut parsed.ready_file, option, path)?;
            }
            "--perf-log" => {
                let path = PathBuf::from(value()?);
                set(&mut parsed.perf_log, option, path)?;
            }
            "--exit-after-replay" => {
                let ms = value()?
                    .parse()
                    .map_err(|_| format!("{option} needs milliseconds"))?;
                set(&mut parsed.exit_after_ms, option, ms)?;
            }
            "--open-folder" => parsed.open_folders.push(value()?),
            "--mark-children" => {
                let mark = value()?;
                set(&mut parsed.mark_children, option, mark)?;
            }
            "--mcp-config" => {
                let path = value()?;
                set(&mut parsed.mcp_config, option, path)?;
            }
            "--fail-launch" => {
                let code = value()?
                    .parse()
                    .map_err(|_| format!("{option} needs an exit code"))?;
                set(&mut parsed.fail_launch, option, code)?;
            }
            "--fail-distro" => {
                let distro = value()?;
                set(&mut parsed.fail_distro, option, distro)?;
            }
            "--close-after" => {
                let ms = value()?
                    .parse()
                    .map_err(|_| format!("{option} needs milliseconds"))?;
                set(&mut parsed.close_after_ms, option, ms)?;
            }
            "--scroll-through" => {
                if parsed.scroll_through {
                    return Err(format!("{option} is given twice"));
                }
                parsed.scroll_through = true;
            }
            _ if option.starts_with("--") => {
                let name = option.split_once('=').map_or(option, |(name, _)| name);
                return Err(format!("unknown option {name}"));
            }
            _ => return Err("an argument that is not an option".to_owned()),
        }
    }
    parsed.pace_ms = pace_ms.unwrap_or_default();
    refuse_mixes(&parsed)?;
    Ok(parsed)
}

/// Refuses the checks' options that cannot go together: a replay with a real folder or a
/// failing launch, and an option without the one it qualifies.
fn refuse_mixes(parsed: &AppArgs) -> Result<(), String> {
    if !parsed.replays.is_empty() {
        if !parsed.open_folders.is_empty() {
            return Err("--open-folder cannot be used with --replay".to_owned());
        }
        if parsed.fail_launch.is_some() {
            return Err("--fail-launch cannot be used with --replay".to_owned());
        }
    }
    // Without a slot nothing settles: the ready file is never written and the close never comes.
    let no_slot =
        parsed.open_folders.is_empty() && parsed.fail_launch.is_none() && parsed.replays.is_empty();
    for (option, given) in [
        ("--ready-file", parsed.ready_file.is_some()),
        ("--close-after", parsed.close_after_ms.is_some()),
    ] {
        if no_slot && given {
            return Err(format!(
                "{option} needs an --open-folder, a --fail-launch or a --replay"
            ));
        }
    }
    if parsed.fail_distro.is_some() && parsed.fail_launch.is_none() {
        return Err("--fail-distro needs a --fail-launch".to_owned());
    }
    if parsed.open_folders.is_empty() {
        if parsed.mark_children.is_some() {
            return Err("--mark-children needs an --open-folder".to_owned());
        }
        if parsed.mcp_config.is_some() {
            return Err("--mcp-config needs an --open-folder".to_owned());
        }
    }
    Ok(())
}

/// The `--replay` an option follows.
fn replay<'a>(parsed: &'a mut AppArgs, option: &str) -> Result<&'a mut ReplayArg, String> {
    parsed
        .replays
        .last_mut()
        .ok_or_else(|| format!("{option} must follow a --replay"))
}

fn set<T>(slot: &mut Option<T>, option: &str, value: T) -> Result<(), String> {
    if slot.is_some() {
        return Err(format!("{option} is given twice"));
    }
    *slot = Some(value);
    Ok(())
}

/// `888x883` as a width and a height.
fn window(text: &str) -> Option<(f32, f32)> {
    let (width, height) = text.split_once('x')?;
    let size = |it: &str| {
        it.parse::<u32>()
            .ok()
            .filter(|it| *it > 0)
            .map(|it| it as f32)
    };
    Some((size(width)?, size(height)?))
}

/// `none`, `left`, `right` or `left,right` as whether the left and the right pane are open.
fn panes(text: &str) -> Option<(bool, bool)> {
    match text {
        "none" => Some((false, false)),
        "left" => Some((true, false)),
        "right" => Some((false, true)),
        "left,right" | "right,left" => Some((true, true)),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parsed(args: &[&str]) -> Result<AppArgs, String> {
        parse(args.iter().map(|it| (*it).to_owned()))
    }

    #[test]
    fn replay_options_follow_their_replay() {
        let args = parsed(&[
            "--replay",
            "a.ndjson",
            "--prompt",
            "Respond with one word",
            "--stop-at",
            "12",
            "--replay",
            "b.ndjson",
            "--stdin-log",
            "b-stdin.log",
        ])
        .unwrap();
        assert_eq!(
            args.replays,
            [
                ReplayArg {
                    path: PathBuf::from("a.ndjson"),
                    prompt: Some("Respond with one word".to_owned()),
                    stop_at: Some(12),
                    stdin_log: None,
                },
                ReplayArg {
                    path: PathBuf::from("b.ndjson"),
                    prompt: None,
                    stop_at: None,
                    stdin_log: Some(PathBuf::from("b-stdin.log")),
                },
            ]
        );
        assert!(parsed(&["--replay", "a", "--prompt", "x", "--prompt", "y"]).is_err());
        assert!(parsed(&["--replay", "a", "--stop-at", "twelve"]).is_err());
        assert!(parsed(&["--replay", "a", "--prompt"]).is_err());
    }

    #[test]
    fn pace_window_panes_and_ready_file_are_global() {
        let args = parsed(&[
            "--pace",
            "30",
            "--replay",
            "a.ndjson",
            "--window",
            "888x883",
            "--pane",
            "left,right",
            "--ready-file",
            "ready",
        ])
        .unwrap();
        assert_eq!(args.pace_ms, 30);
        assert_eq!(args.window, Some((888.0, 883.0)));
        assert_eq!(args.panes, Some((true, true)));
        assert_eq!(args.ready_file, Some(PathBuf::from("ready")));
        assert_eq!(args.replays.len(), 1);
        assert_eq!(args.replays[0].prompt, None);

        let defaults = parsed(&[]).unwrap();
        assert_eq!(defaults, AppArgs::default());
        assert_eq!(defaults.pace_ms, 0);
        for (text, panes) in [
            ("none", (false, false)),
            ("left", (true, false)),
            ("right", (false, true)),
        ] {
            assert_eq!(parsed(&["--pane", text]).unwrap().panes, Some(panes));
        }
        for bad in ["888", "0x10", "ax10", "888x"] {
            assert!(parsed(&["--window", bad]).is_err(), "{bad}");
        }
        assert!(parsed(&["--pane", "middle"]).is_err());
    }

    #[test]
    fn an_option_before_any_replay_is_refused() {
        for option in ["--prompt", "--stop-at", "--stdin-log"] {
            let error = parsed(&[option, "1", "--replay", "a.ndjson"]).unwrap_err();
            assert!(error.contains(option), "{error}");
            assert!(error.contains("--replay"), "{error}");
        }
    }

    #[test]
    fn unknown_arguments_are_refused() {
        let error = parsed(&["--replay", "a.ndjson", "--open", "model"]).unwrap_err();
        assert_eq!(error, "unknown option --open");
        let error = parsed(&["--replay", "a.ndjson", "secret prompt"]).unwrap_err();
        assert!(!error.contains("secret"), "{error}");
        for option in ["--prompt=secret", "--x=secret"] {
            let error = parsed(&["--replay", "a.ndjson", option]).unwrap_err();
            assert!(!error.contains("secret"), "{error}");
        }
        let error = parsed(&["--pace", "5", "--pace", "6"]).unwrap_err();
        assert!(error.contains("twice"), "{error}");
    }

    #[test]
    fn measure_options_are_global() {
        let args = parsed(&[
            "--perf-log",
            "synth.csv",
            "--replay",
            "a.ndjson",
            "--scroll-through",
            "--exit-after-replay",
            "12000",
        ])
        .unwrap();
        assert_eq!(args.perf_log, Some(PathBuf::from("synth.csv")));
        assert_eq!(args.exit_after_ms, Some(12000));
        assert!(args.scroll_through);
        assert_eq!(args.replays.len(), 1);
        assert_eq!(args.replays[0].prompt, None);
        assert!(args.measures());

        let plain = parsed(&["--replay", "a.ndjson"]).unwrap();
        assert_eq!(plain.perf_log, None);
        assert_eq!(plain.exit_after_ms, None);
        assert!(!plain.scroll_through);
        assert!(!plain.measures());
        assert!(
            parsed(&["--replay", "a.ndjson", "--ready-file", "ready"])
                .unwrap()
                .measures()
        );

        assert!(parsed(&["--exit-after-replay", "soon"]).is_err());
        assert!(parsed(&["--exit-after-replay"]).is_err());
        assert!(parsed(&["--scroll-through", "--scroll-through"]).is_err());
        assert!(parsed(&["--perf-log", "a", "--perf-log", "b"]).is_err());
    }

    #[test]
    fn probe_options_are_read() {
        let args = parsed(&[
            "--open-folder",
            r"\\wsl.localhost\Ubuntu-26.04\home\x",
            "--open-folder",
            r"C:\dev\tools\closta",
            "--mark-children",
            "run-7",
            "--mcp-config",
            "/tmp/closta-hold/mcp.json",
            "--fail-launch",
            "127",
            "--fail-distro",
            "Ubuntu-26.04",
            "--close-after",
            "3000",
            "--ready-file",
            "ready",
        ])
        .unwrap();
        assert_eq!(
            args.open_folders,
            [
                r"\\wsl.localhost\Ubuntu-26.04\home\x",
                r"C:\dev\tools\closta"
            ]
        );
        assert_eq!(args.mark_children.as_deref(), Some("run-7"));
        assert_eq!(
            args.mcp_config.as_deref(),
            Some("/tmp/closta-hold/mcp.json")
        );
        assert_eq!(args.fail_launch, Some(127));
        assert_eq!(args.fail_distro.as_deref(), Some("Ubuntu-26.04"));
        assert_eq!(args.close_after_ms, Some(3000));
        assert_eq!(args.ready_file, Some(PathBuf::from("ready")));
        assert!(args.replays.is_empty());

        let failing = parsed(&["--fail-launch", "-3"]).unwrap();
        assert_eq!(failing.fail_launch, Some(-3));
        assert_eq!(failing.fail_distro, None);

        for (twice, value) in [("--fail-launch", "3"), ("--close-after", "10")] {
            let error = parsed(&[twice, value, twice, value]).unwrap_err();
            assert_eq!(error, format!("{twice} is given twice"));
        }
        for (option, bad) in [("--fail-launch", "secret"), ("--close-after", "secret")] {
            let error = parsed(&[option, bad]).unwrap_err();
            assert!(error.contains(option), "{error}");
            assert!(!error.contains("secret"), "{error}");
        }
        let error = parsed(&["--fail-launch", "1", "--mcp-config"]).unwrap_err();
        assert_eq!(error, "--mcp-config needs a value");
    }

    #[test]
    fn replay_does_not_mix_with_real_folders() {
        let error = parsed(&["--replay", "a.ndjson", "--open-folder", "C:\\secret"]).unwrap_err();
        assert_eq!(error, "--open-folder cannot be used with --replay");
        let error = parsed(&["--open-folder", "C:\\secret", "--replay", "a.ndjson"]).unwrap_err();
        assert_eq!(error, "--open-folder cannot be used with --replay");
        let error = parsed(&["--replay", "a.ndjson", "--fail-launch", "127"]).unwrap_err();
        assert_eq!(error, "--fail-launch cannot be used with --replay");
        assert!(parsed(&["--open-folder", "C:\\x", "--fail-launch", "127"]).is_ok());
    }

    #[test]
    fn a_fail_distro_needs_a_fail_launch() {
        let error = parsed(&["--fail-distro", "Ubuntu-26.04"]).unwrap_err();
        assert_eq!(error, "--fail-distro needs a --fail-launch");
        let error = parsed(&[
            "--fail-distro",
            "a",
            "--fail-launch",
            "1",
            "--fail-distro",
            "b",
        ])
        .unwrap_err();
        assert_eq!(error, "--fail-distro is given twice");
    }

    #[test]
    fn a_ready_file_or_close_after_needs_something_to_settle() {
        for (option, value) in [("--ready-file", "C:\\secret"), ("--close-after", "3000")] {
            let error = parsed(&[option, value]).unwrap_err();
            assert_eq!(
                error,
                format!("{option} needs an --open-folder, a --fail-launch or a --replay")
            );
            let error = parsed(&[option, value, "--pace", "5"]).unwrap_err();
            assert!(!error.contains("secret"), "{error}");
            for slot in [
                ["--open-folder", "C:\\x"],
                ["--fail-launch", "127"],
                ["--replay", "a.ndjson"],
            ] {
                assert!(
                    parsed(&[option, value, slot[0], slot[1]]).is_ok(),
                    "{slot:?}"
                );
            }
        }
    }

    #[test]
    fn marks_and_mcp_config_need_a_folder() {
        for option in ["--mark-children", "--mcp-config"] {
            let error = parsed(&[option, "secret"]).unwrap_err();
            assert_eq!(error, format!("{option} needs an --open-folder"));
            let error = parsed(&[option, "secret", "--fail-launch", "1"]).unwrap_err();
            assert_eq!(error, format!("{option} needs an --open-folder"));
            assert!(parsed(&[option, "x", "--open-folder", "C:\\x"]).is_ok());
        }
    }
}
