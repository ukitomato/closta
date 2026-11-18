//! The development arguments of the replay build. `--prompt`, `--stop-at` and `--stdin-log`
//! belong to the `--replay` before them; `--pace`, `--window`, `--pane` and `--ready-file` apply
//! to the whole run. An error names the option, never a value: a value can be a prompt or a path.

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
}

/// Reads the arguments after the program's name.
pub fn parse(args: impl IntoIterator<Item = String>) -> Result<AppArgs, String> {
    let mut parsed = AppArgs::default();
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
                parsed.pace_ms = value()?
                    .parse()
                    .map_err(|_| format!("{option} needs milliseconds"))?;
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
            _ if option.starts_with("--") => return Err(format!("unknown option {option}")),
            _ => return Err("an argument that is not an option".to_owned()),
        }
    }
    Ok(parsed)
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
        assert!(parsed(&["--fail-launch", "3"]).is_err());
    }
}
