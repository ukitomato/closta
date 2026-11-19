//! The scenes `win-shot` takes pictures of: each one starts the replay build with its own
//! arguments, and is shot once at each of [`SIZES`].

use crate::win::REPLAY;

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

/// One scene: its name, the arguments the app starts with (the window size is added when it is
/// shot), and what the reviewer leaves out.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct Scene {
    pub name: &'static str,
    pub args: Vec<String>,
    pub excluded: Vec<&'static str>,
}

/// The scenes: stage 6a's replays, then stage 6b's states.
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
    ]
}

/// The scene called `name`.
pub fn find(name: &str) -> Option<Scene> {
    scenes().into_iter().find(|scene| scene.name == name)
}

#[cfg(test)]
mod tests {
    use super::*;

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
        assert_eq!(scenes().len() * SIZES.len(), 24);
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
}
