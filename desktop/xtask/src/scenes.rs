//! The scenes `win-shot` takes pictures of: each one starts the replay build with its own
//! arguments, and is shot once at each of [`SIZES`].

use crate::win::{CONFIG_DIR, REPLAY};

/// The window sizes every scene is shot at: a small laptop, a common desktop and a large screen.
pub const SIZES: [(u32, u32); 3] = [(1024, 700), (1600, 1000), (2560, 1440)];

/// What a reviewer of every scene leaves out: what stages 6a and 6b do not build yet.
const NOT_BUILT: [&str; 3] = [
    "the pickers under the composer",
    "the grouping in the left pane",
    "the content of the right pane",
];
/// The composer comes in stage 6b, so no 6a scene judges it.
pub const COMPOSER: &str = "the composer (stage 6b)";

/// The prompts the captures were recorded with (the first `user` step of each scenario).
pub const PONG_PROMPT: &str = "Respond with exactly one word: pong";
pub const BASH_PROMPT: &str =
    "Run this exact bash command and report its output: echo hello-from-capture";
pub const SUBAGENT_PROMPT: &str = "Use the Agent tool to spawn one subagent (subagent_type \"Explore\", run_in_background false) that reads the file NOTES.md in the current directory and reports a one-sentence summary. Then relay the summary.";
pub const TODO_PROMPT: &str = "Use the TodoWrite tool to record a todo list with exactly two items: \"write tests\" (status pending) and \"run build\" (status in_progress). Then report done.";
pub const COMPACT_PROMPT: &str = "/compact";
pub const PERMISSION_PROMPT: &str = "Run this exact bash command once and report its output: touch /tmp/closta-rec-36-sandbox-unavailable-NguC3l/outside/sandbox-probe.txt. If it fails, do not retry it in any other way; just report the error message.";
pub const EDIT_PROMPT: &str = "Use the Edit tool to replace the text old-value with new-value in the file EDITME.md. Then report done.";
pub const QUESTION_PROMPT: &str = "Use the AskUserQuestion tool once, with two questions in the same call: first \"AとBどちらがいいですか？\" (header \"選択肢\") with options A (\"Aを選択します\") and B (\"Bを選択します\"), multiSelect false; second \"XとYどちらにしますか？\" (header \"もう一つ\") with options X (\"Xを選択します\") and Y (\"Yを選択します\"), multiSelect false. Then report the answers.";
pub const PLAN_PROMPT: &str = "Make a short plan to fix the spelling of the headings in README.md, then call ExitPlanMode with it. Once it is approved, make the fix with the Edit tool and report done.";

/// What a reviewer of the stage 6c scenes leaves out: what later stages build.
pub const EXCLUDED_6C: [&str; 3] = [
    "the model and effort pickers (stage 6g)",
    "the grouping of sessions into projects (stage 6d)",
    "the content of the right pane",
];

/// What a reviewer of the stage 6d-2a scenes leaves out: what later stages build.
pub const EXCLUDED_6D2A: [&str; 3] = [
    "the model and effort pickers (stage 6g)",
    "the resume button and popup (stage 6d-2b)",
    "the content of the right pane",
];

/// What a reviewer of the stage 6d-2b scene leaves out: what later stages build.
pub const EXCLUDED_6D2B: [&str; 2] = ["the content of the right pane", "the conversation"];

/// The folder of the resume scene's project as the CLI sees it inside the distribution.
pub const RESUME_FOLDER: &str = "/home/me/closta";

/// The name the CLI gives a folder's records: every character that is not an ASCII letter or
/// digit becomes `-`. Short paths only; the CLI also cuts a long name, which no scene needs.
pub fn record_name(path: &str) -> String {
    path.chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect()
}

/// One scene: its name, the arguments the app starts with (the window size is added when it is
/// shot), and what the reviewer leaves out.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct Scene {
    pub name: &'static str,
    pub args: Vec<String>,
    pub excluded: Vec<&'static str>,
}

/// The scenes: stage 6a's replays, stage 6b's states, then stage 6c's cards and hub.
pub fn scenes() -> Vec<Scene> {
    let replay = |file: &str, prompt: Option<&str>| {
        let mut args = vec!["--replay".to_owned(), format!(r"{REPLAY}\{file}")];
        if let Some(prompt) = prompt {
            args.push("--prompt".to_owned());
            args.push(prompt.to_owned());
        }
        args
    };
    let scene = |name, args| {
        let mut excluded = NOT_BUILT.to_vec();
        excluded.push(COMPOSER);
        Scene {
            name,
            args,
            excluded,
        }
    };
    vec![
        scene("thread-gallery", replay("gallery.ndjson", None)),
        scene(
            "thread-baseline",
            replay("01-baseline-text.ndjson", Some(PONG_PROMPT)),
        ),
        scene(
            "thread-bash",
            replay("02-tool-bash-autorun.ndjson", Some(BASH_PROMPT)),
        ),
        scene(
            "thread-subagent",
            replay("08-subagent-task.ndjson", Some(SUBAGENT_PROMPT)),
        ),
        scene(
            "thread-todo",
            replay("20-todowrite.ndjson", Some(TODO_PROMPT)),
        ),
        scene(
            "thread-compact",
            replay("21-compact.ndjson", Some(COMPACT_PROMPT)),
        ),
        scene("thread-synthetic-tail", replay("synth.ndjson", None)),
        // A WSL launch that ends with 127: the failure band, its hint and Restart, and the
        // composer of a session that is not running.
        Scene {
            name: "state-failed",
            args: ["--fail-launch", "127", "--fail-distro", "Ubuntu-26.04"]
                .map(str::to_owned)
                .to_vec(),
            excluded: NOT_BUILT.to_vec(),
        },
        // Each card kind stops the replay at its request, so the card stays waiting.
        card_scene(
            "cards-permission",
            "36-sandbox-unavailable.ndjson",
            PERMISSION_PROMPT,
            31,
        ),
        card_scene("cards-edit", "17-edit-approval.ndjson", EDIT_PROMPT, 66),
        card_scene(
            "cards-question",
            "18-ask-multi-question.ndjson",
            QUESTION_PROMPT,
            41,
        ),
        card_scene("cards-plan", "29-exit-plan-mode.ndjson", PLAN_PROMPT, 146),
        // The four waiting cards, a session still working and a failed launch, in the list.
        Scene {
            name: "hub-needs-you",
            args: HUB_REPLAYS
                .iter()
                .flat_map(|&(file, prompt, stop_at)| stopped_replay(file, prompt, stop_at))
                .chain(["--fail-launch".to_owned(), "1".to_owned()])
                .collect(),
            excluded: EXCLUDED_6C.to_vec(),
        },
        // Five replays in three folders (two of them both called `closta`), an empty project, a
        // closed project, and a failed launch that belongs to no project.
        Scene {
            name: "hub-projects",
            args: HUB_PROJECTS
                .iter()
                .flat_map(|&(file, prompt, stop_at, folder)| {
                    let mut args = vec![
                        "--replay".to_owned(),
                        format!(r"{REPLAY}\{file}"),
                        "--prompt".to_owned(),
                        prompt.to_owned(),
                    ];
                    if let Some(stop_at) = stop_at {
                        args.extend(["--stop-at".to_owned(), stop_at.to_string()]);
                    }
                    args.extend(["--folder".to_owned(), folder.to_owned()]);
                    args
                })
                .chain(
                    [
                        "--project",
                        r"C:\dev\api",
                        "--collapse",
                        PROJECT_NOTES,
                        "--fail-launch",
                        "1",
                    ]
                    .map(str::to_owned),
                )
                .collect(),
            excluded: EXCLUDED_6D2A.to_vec(),
        },
        // The popup of a project's saved sessions, read from the records the copy puts in the
        // config directory.
        Scene {
            name: "resume-popup",
            args: [
                "--project",
                PROJECT_WSL,
                "--config-dir",
                CONFIG_DIR,
                "--open",
                "resume",
            ]
            .map(str::to_owned)
            .to_vec(),
            excluded: EXCLUDED_6D2B.to_vec(),
        },
    ]
}

const PROJECT_WIN: &str = r"C:\dev\closta";
pub const PROJECT_WSL: &str = r"\\wsl.localhost\Ubuntu-26.04\home\me\closta";
const PROJECT_NOTES: &str = r"\\wsl.localhost\Ubuntu-26.04\home\me\notes";

/// The replays of the projects scene: the record, its prompt, the line it stops at (the last
/// one runs to its end) and the folder it belongs to.
pub(crate) const HUB_PROJECTS: [(&str, &str, Option<usize>, &str); 5] = [
    (
        "36-sandbox-unavailable.ndjson",
        PERMISSION_PROMPT,
        Some(31),
        PROJECT_WIN,
    ),
    (
        "18-ask-multi-question.ndjson",
        QUESTION_PROMPT,
        Some(41),
        PROJECT_WSL,
    ),
    (
        "01-baseline-text.ndjson",
        PONG_PROMPT,
        Some(10),
        PROJECT_WIN,
    ),
    (
        "02-tool-bash-autorun.ndjson",
        BASH_PROMPT,
        None,
        PROJECT_WSL,
    ),
    (
        "29-exit-plan-mode.ndjson",
        PLAN_PROMPT,
        Some(146),
        PROJECT_NOTES,
    ),
];

/// The replays of the hub scene: the four waiting cards, then a session that is still working.
pub(crate) const HUB_REPLAYS: [(&str, &str, usize); 5] = [
    ("36-sandbox-unavailable.ndjson", PERMISSION_PROMPT, 31),
    ("17-edit-approval.ndjson", EDIT_PROMPT, 66),
    ("18-ask-multi-question.ndjson", QUESTION_PROMPT, 41),
    ("29-exit-plan-mode.ndjson", PLAN_PROMPT, 146),
    ("02-tool-bash-autorun.ndjson", BASH_PROMPT, 15),
];

/// A replay of `file` that is given `prompt` and stops after `stop_at` lines.
pub(crate) fn stopped_replay(file: &str, prompt: &str, stop_at: usize) -> Vec<String> {
    vec![
        "--replay".to_owned(),
        format!(r"{REPLAY}\{file}"),
        "--prompt".to_owned(),
        prompt.to_owned(),
        "--stop-at".to_owned(),
        stop_at.to_string(),
    ]
}

fn card_scene(name: &'static str, file: &str, prompt: &str, stop_at: usize) -> Scene {
    Scene {
        name,
        args: stopped_replay(file, prompt, stop_at),
        excluded: EXCLUDED_6C.to_vec(),
    }
}

/// The scene called `name`.
pub fn find(name: &str) -> Option<Scene> {
    scenes().into_iter().find(|scene| scene.name == name)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::win;
    use std::path::Path;

    fn replays(scene: &Scene) -> Vec<&String> {
        scene
            .args
            .windows(2)
            .filter(|pair| pair[0] == "--replay")
            .map(|pair| &pair[1])
            .collect()
    }

    /// The stage 6a scenes, which replay a capture.
    fn scenes_6a() -> Vec<Scene> {
        scenes()
            .into_iter()
            .filter(|scene| scene.name.starts_with("thread-"))
            .collect()
    }

    #[test]
    fn the_6a_scenes_are_all_there_with_windows_paths() {
        let names: Vec<_> = scenes_6a().iter().map(|scene| scene.name).collect();
        assert_eq!(
            names,
            [
                "thread-gallery",
                "thread-baseline",
                "thread-bash",
                "thread-subagent",
                "thread-todo",
                "thread-compact",
                "thread-synthetic-tail",
            ]
        );
        for scene in scenes_6a() {
            let replays = replays(&scene);
            assert_eq!(replays.len(), 1, "{}", scene.name);
            assert!(
                replays[0].starts_with(r"C:\dev\tools\closta\replay\"),
                "{}: {}",
                scene.name,
                replays[0]
            );
            assert!(replays[0].ends_with(".ndjson"), "{}", scene.name);
            assert!(
                !scene.args.iter().any(|arg| arg == "--window"),
                "{}",
                scene.name
            );
        }
        assert_eq!(
            find("thread-gallery").unwrap().args,
            ["--replay", r"C:\dev\tools\closta\replay\gallery.ndjson"]
        );
        assert_eq!(
            find("thread-synthetic-tail").unwrap().args,
            ["--replay", r"C:\dev\tools\closta\replay\synth.ndjson"]
        );
        assert!(find("thread-nothing").is_none());
    }

    #[test]
    fn every_record_scene_has_its_prompt() {
        let expected = [
            ("thread-baseline", "01-baseline-text.ndjson", PONG_PROMPT),
            ("thread-bash", "02-tool-bash-autorun.ndjson", BASH_PROMPT),
            (
                "thread-subagent",
                "08-subagent-task.ndjson",
                SUBAGENT_PROMPT,
            ),
            ("thread-todo", "20-todowrite.ndjson", TODO_PROMPT),
            ("thread-compact", "21-compact.ndjson", "/compact"),
        ];
        for (name, file, prompt) in expected {
            let scene = find(name).unwrap();
            assert_eq!(
                scene.args,
                [
                    "--replay".to_owned(),
                    format!(r"C:\dev\tools\closta\replay\{file}"),
                    "--prompt".to_owned(),
                    prompt.to_owned(),
                ],
                "{name}"
            );
        }
        // The prompts are the scenarios' own words.
        assert_eq!(
            SUBAGENT_PROMPT,
            concat!(
                "Use the Agent tool to spawn one subagent (subagent_type \"Explore\", run_in_background false) ",
                "that reads the file NOTES.md in the current directory and reports a one-sentence summary. ",
                "Then relay the summary."
            )
        );
        assert_eq!(
            TODO_PROMPT,
            concat!(
                "Use the TodoWrite tool to record a todo list with exactly two items: ",
                "\"write tests\" (status pending) and \"run build\" (status in_progress). Then report done."
            )
        );
    }

    #[test]
    fn every_scene_is_shot_at_the_three_sizes() {
        assert_eq!(SIZES, [(1024, 700), (1600, 1000), (2560, 1440)]);
        assert_eq!(scenes().len() * SIZES.len(), 45);
    }

    #[test]
    fn every_scene_excludes_the_composer() {
        for scene in scenes_6a() {
            assert!(scene.excluded.contains(&COMPOSER), "{}", scene.name);
            for part in NOT_BUILT {
                assert!(scene.excluded.contains(&part), "{}: {part}", scene.name);
            }
        }
    }

    #[test]
    fn the_failed_state_scene_fails_a_wsl_launch_with_127() {
        let scene = find("state-failed").unwrap();
        assert_eq!(
            scene.args,
            ["--fail-launch", "127", "--fail-distro", "Ubuntu-26.04"]
        );
        assert!(!scene.excluded.contains(&COMPOSER));
        for part in [
            "the grouping in the left pane",
            "the content of the right pane",
            "the pickers under the composer",
        ] {
            assert!(scene.excluded.contains(&part), "{part}");
        }
        assert_eq!(scene.excluded.len(), 3);
    }

    fn card_args(file: &str, prompt: &str, stop_at: &str) -> Vec<String> {
        vec![
            "--replay".to_owned(),
            format!(r"C:\dev\tools\closta\replay\{file}"),
            "--prompt".to_owned(),
            prompt.to_owned(),
            "--stop-at".to_owned(),
            stop_at.to_owned(),
        ]
    }

    #[test]
    fn the_card_scenes_stop_at_their_requests() {
        let expected = [
            (
                "cards-permission",
                "36-sandbox-unavailable.ndjson",
                PERMISSION_PROMPT,
                "31",
            ),
            ("cards-edit", "17-edit-approval.ndjson", EDIT_PROMPT, "66"),
            (
                "cards-question",
                "18-ask-multi-question.ndjson",
                QUESTION_PROMPT,
                "41",
            ),
            ("cards-plan", "29-exit-plan-mode.ndjson", PLAN_PROMPT, "146"),
        ];
        for (name, file, prompt, stop_at) in expected {
            let scene = find(name).unwrap();
            assert_eq!(scene.args, card_args(file, prompt, stop_at), "{name}");
            assert_eq!(scene.excluded, EXCLUDED_6C, "{name}");
        }
        assert_eq!(
            PERMISSION_PROMPT,
            "Run this exact bash command once and report its output: touch /tmp/closta-rec-36-sandbox-unavailable-NguC3l/outside/sandbox-probe.txt. If it fails, do not retry it in any other way; just report the error message."
        );
        assert_eq!(
            EDIT_PROMPT,
            "Use the Edit tool to replace the text old-value with new-value in the file EDITME.md. Then report done."
        );
        assert_eq!(
            PLAN_PROMPT,
            "Make a short plan to fix the spelling of the headings in README.md, then call ExitPlanMode with it. Once it is approved, make the fix with the Edit tool and report done."
        );
        assert!(
            QUESTION_PROMPT.starts_with("Use the AskUserQuestion tool once, with two questions")
        );
        assert!(QUESTION_PROMPT.ends_with("Then report the answers."));
        assert_eq!(
            EXCLUDED_6C,
            [
                "the model and effort pickers (stage 6g)",
                "the grouping of sessions into projects (stage 6d)",
                "the content of the right pane",
            ]
        );
    }

    fn capture_line(file: &str, line: usize) -> serde_json::Value {
        let path = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join(win::CAPTURES)
            .join(file);
        let text = std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("{file}: {e}"));
        // Counted as `--stop-at` counts them: blank lines are not lines.
        let row = text
            .lines()
            .filter(|row| !row.trim().is_empty())
            .nth(line - 1)
            .unwrap_or_else(|| panic!("{file} has no line {line}"));
        serde_json::from_str(row).unwrap_or_else(|e| panic!("{file}:{line}: {e}"))
    }

    fn assert_can_use_tool(file: &str, line: usize, tool: &str) {
        let row = capture_line(file, line);
        assert_eq!(row["type"], "control_request", "{file}:{line}");
        assert_eq!(row["request"]["subtype"], "can_use_tool", "{file}:{line}");
        assert_eq!(row["request"]["tool_name"], tool, "{file}:{line}");
    }

    /// The `(file, stop line)` pairs of the scene's `--replay` and `--stop-at` arguments.
    fn stops(scene: &Scene) -> Vec<(String, usize)> {
        let mut out = Vec::new();
        let mut file = None;
        let mut args = scene.args.iter();
        while let Some(arg) = args.next() {
            match arg.as_str() {
                "--replay" => {
                    let path = args.next().unwrap();
                    file = Some(path.rsplit('\\').next().unwrap().to_owned());
                }
                "--stop-at" => {
                    out.push((file.take().unwrap(), args.next().unwrap().parse().unwrap()))
                }
                _ => {}
            }
        }
        out
    }

    #[test]
    fn every_stop_line_holds_what_the_scene_stops_at() {
        let tool_of = |file: &str| match file {
            "36-sandbox-unavailable.ndjson" => "Bash",
            "17-edit-approval.ndjson" => "Edit",
            "18-ask-multi-question.ndjson" => "AskUserQuestion",
            "29-exit-plan-mode.ndjson" => "ExitPlanMode",
            other => panic!("{other}"),
        };
        let mut checked = Vec::new();
        for name in [
            "cards-permission",
            "cards-edit",
            "cards-question",
            "cards-plan",
        ] {
            checked.extend(stops(&find(name).unwrap()));
        }
        checked.extend(
            HUB_REPLAYS
                .iter()
                .map(|&(file, _, line)| (file.to_owned(), line)),
        );
        checked.extend(
            HUB_PROJECTS
                .iter()
                .filter_map(|&(file, _, line, _)| line.map(|line| (file.to_owned(), line))),
        );
        assert_eq!(checked.len(), 4 + 5 + 4);
        for (file, line) in checked {
            match file.as_str() {
                "01-baseline-text.ndjson" => {
                    let row = capture_line(&file, line);
                    assert_eq!(row["type"], "stream_event", "{file}:{line}");
                    assert_eq!(row["event"]["delta"]["type"], "text_delta", "{file}:{line}");
                }
                "02-tool-bash-autorun.ndjson" => {
                    let row = capture_line(&file, line);
                    assert_eq!(row["type"], "assistant", "{file}:{line}");
                    let content = row["message"]["content"].as_array().unwrap();
                    assert!(
                        content
                            .iter()
                            .any(|c| c["type"] == "tool_use" && c["name"] == "Bash"),
                        "{file}:{line}"
                    );
                }
                _ => assert_can_use_tool(&file, line, tool_of(&file)),
            }
        }
    }

    #[test]
    fn the_permission_prompt_holds_the_command_of_capture_36() {
        let row = capture_line("36-sandbox-unavailable.ndjson", 31);
        let command = row["request"]["input"]["command"].as_str().unwrap();
        let path = command.strip_prefix("touch ").unwrap();
        assert!(path.ends_with("/outside/sandbox-probe.txt"), "{path}");
        assert!(PERMISSION_PROMPT.contains(path));
    }

    #[test]
    fn the_hub_scene_opens_four_waits_a_working_one_and_a_failure() {
        let scene = find("hub-needs-you").unwrap();
        let mut expected = card_args("36-sandbox-unavailable.ndjson", PERMISSION_PROMPT, "31");
        expected.extend(card_args("17-edit-approval.ndjson", EDIT_PROMPT, "66"));
        expected.extend(card_args(
            "18-ask-multi-question.ndjson",
            QUESTION_PROMPT,
            "41",
        ));
        expected.extend(card_args("29-exit-plan-mode.ndjson", PLAN_PROMPT, "146"));
        expected.extend(card_args("02-tool-bash-autorun.ndjson", BASH_PROMPT, "15"));
        expected.extend(["--fail-launch".to_owned(), "1".to_owned()]);
        assert_eq!(scene.args, expected);
        assert_eq!(replays(&scene).len(), 5);
        assert_eq!(scene.excluded, EXCLUDED_6C);
    }

    #[test]
    fn the_projects_scene_puts_five_replays_in_three_folders() {
        let scene = find("hub-projects").unwrap();
        let win = r"C:\dev\closta";
        let wsl_closta = r"\\wsl.localhost\Ubuntu-26.04\home\me\closta";
        let notes = r"\\wsl.localhost\Ubuntu-26.04\home\me\notes";
        let mut expected = Vec::new();
        for (file, prompt, stop_at, folder) in [
            (
                "36-sandbox-unavailable.ndjson",
                PERMISSION_PROMPT,
                Some("31"),
                win,
            ),
            (
                "18-ask-multi-question.ndjson",
                QUESTION_PROMPT,
                Some("41"),
                wsl_closta,
            ),
            ("01-baseline-text.ndjson", PONG_PROMPT, Some("10"), win),
            ("02-tool-bash-autorun.ndjson", BASH_PROMPT, None, wsl_closta),
            ("29-exit-plan-mode.ndjson", PLAN_PROMPT, Some("146"), notes),
        ] {
            expected.extend([
                "--replay".to_owned(),
                format!(r"C:\dev\tools\closta\replay\{file}"),
            ]);
            expected.extend(["--prompt".to_owned(), prompt.to_owned()]);
            if let Some(stop_at) = stop_at {
                expected.extend(["--stop-at".to_owned(), stop_at.to_owned()]);
            }
            expected.extend(["--folder".to_owned(), folder.to_owned()]);
        }
        expected.extend(
            [
                "--project",
                r"C:\dev\api",
                "--collapse",
                notes,
                "--fail-launch",
                "1",
            ]
            .map(str::to_owned),
        );
        assert_eq!(scene.args, expected);
        assert_eq!(replays(&scene).len(), 5);
        assert_eq!(scene.args.iter().filter(|it| *it == "--folder").count(), 5);
        // Two folders share the last name, so the list has to tell them apart.
        let closta = [win, wsl_closta].map(|it| it.rsplit('\\').next().unwrap());
        assert_eq!(closta, ["closta", "closta"]);
    }

    #[test]
    fn the_projects_scene_excludes_what_later_stages_build() {
        let scene = find("hub-projects").unwrap();
        assert_eq!(scene.excluded, EXCLUDED_6D2A);
        assert_eq!(
            EXCLUDED_6D2A,
            [
                "the model and effort pickers (stage 6g)",
                "the resume button and popup (stage 6d-2b)",
                "the content of the right pane",
            ]
        );
    }

    #[test]
    fn the_resume_scene_opens_the_popup_on_saved_sessions() {
        let scene = find("resume-popup").unwrap();
        assert_eq!(
            scene.args,
            [
                "--project",
                r"\\wsl.localhost\Ubuntu-26.04\home\me\closta",
                "--config-dir",
                r"C:\dev\tools\closta\replay\config",
                "--open",
                "resume",
            ]
        );
        assert_eq!(scene.excluded, EXCLUDED_6D2B);
        assert_eq!(
            EXCLUDED_6D2B,
            ["the content of the right pane", "the conversation"]
        );
    }

    // The same pairs are tested for the app's own name in the providers crate
    // (`names_follow_the_cli`); the two must not drift.
    #[test]
    fn record_names_follow_the_cli() {
        for (path, name) in [
            ("/home/me/closta", "-home-me-closta"),
            ("/home/me/my.project/_x/1", "-home-me-my-project--x-1"),
            ("C:\\dev\\x", "C--dev-x"),
        ] {
            assert_eq!(record_name(path), name, "{path}");
        }
        assert_eq!(RESUME_FOLDER, "/home/me/closta");
    }
}
