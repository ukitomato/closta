//! What one `claude` process is launched with. Mirrors ClaudeLaunchSpec.kt.

use std::fmt;

use super::env::SecretEnv;

/// The CLI turns file checkpointing on when this is true (and the DISABLE name is absent).
pub const CHECKPOINTING_ENV: &str = "CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING";

/// The flag-layer settings of a sandboxed launch, as `get_settings` reports them back (captures
/// 34 and 39).
pub const SANDBOX_SETTINGS: &str = r#"{"sandbox":{"enabled":true,"failIfUnavailable":true}}"#;

/// Added to every launch. In auto mode the CLI tells the model it may read, search and edit files
/// through Bash; the app shows and tracks only the file tools' calls (diffs, checkpoints), so this
/// asks for them. Sent in every mode, as the mode can be switched to auto live. Only the first
/// sentence differs from Kotlin's, which names a JetBrains IDE.
pub const TOOL_USE_PROMPT: &str = concat!(
    "This session runs inside Closta, a desktop app that renders and tracks file tool calls. ",
    "In every permission mode, including auto, read files with Read, search with Grep and Glob, ",
    "and change files with Edit and Write. Do not use Bash for these (no cat, head, sed -n, grep, ",
    "find, sed -i, heredocs or scripts that write files). Use Bash for builds, tests, git and ",
    "other commands that have no dedicated tool.",
);

/// A spec whose flags contradict each other: the caller's mistake.
#[derive(Clone, Copy, PartialEq, Eq, Debug, thiserror::Error)]
pub enum SpecError {
    #[error("fork_session needs resume (the session to fork)")]
    ForkWithoutResume,
    #[error(
        "resume_session_at needs resume and fork_session (the session to cut, opened as a new one)"
    )]
    CutWithoutFork,
}

/// The parameters needed to launch one `claude` process. Pure data: no process is made here.
/// `env` carries secrets and auth out of argv, where `ps` could read them.
#[derive(Clone, PartialEq, Eq)]
pub struct LaunchSpec {
    pub session_id: String,
    pub permission_mode: Option<String>,
    pub model: Option<String>,
    /// The effort level the session starts with: `--effort <level>`.
    pub effort: Option<String>,
    /// The saved session to open instead of a new one: `--resume=<id>`, without `--session-id`
    /// unless forking.
    pub resume: Option<String>,
    /// Cut the forked conversation after this line: `--resume-session-at=<uuid>`, right after
    /// `--session-id`. Needs `resume` and `fork_session`.
    pub resume_session_at: Option<String>,
    /// Open `resume` as a new session under `session_id`. Needs `resume`.
    pub fork_session: bool,
    /// Start in the sandbox: `--settings` [`SANDBOX_SETTINGS`] right after `--effort`.
    pub sandbox: bool,
    /// Adds `--permission-prompt-tool stdio` so permission prompts reach the host over stdin.
    pub permission_prompt_tool_stdio: bool,
    /// The working folder as the host sees it (a UNC path for a WSL project).
    pub cwd: Option<String>,
    /// Environment for the process, auth among it. Never placed on argv.
    pub env: SecretEnv,
}

impl LaunchSpec {
    pub fn new(session_id: &str) -> LaunchSpec {
        LaunchSpec {
            session_id: session_id.to_owned(),
            permission_mode: None,
            model: None,
            effort: None,
            resume: None,
            resume_session_at: None,
            fork_session: false,
            sandbox: false,
            permission_prompt_tool_stdio: false,
            cwd: None,
            env: SecretEnv::default(),
        }
    }

    /// The arguments after the program name. `--session-id` and `--resume` join their value with
    /// `=`. `env` is not part of them.
    pub fn to_args(&self) -> Result<Vec<String>, SpecError> {
        if self.fork_session && self.resume.is_none() {
            return Err(SpecError::ForkWithoutResume);
        }
        if self.resume_session_at.is_some() && !(self.resume.is_some() && self.fork_session) {
            return Err(SpecError::CutWithoutFork);
        }
        let mut args: Vec<String> = [
            "-p",
            "--output-format",
            "stream-json",
            "--input-format",
            "stream-json",
            "--include-partial-messages",
            "--verbose",
            "--append-system-prompt",
            TOOL_USE_PROMPT,
        ]
        .map(str::to_owned)
        .into();
        // A new session names its id; a resumed one is opened by the id it was saved under.
        match &self.resume {
            Some(resume) => {
                args.push(format!("--resume={resume}"));
                if self.fork_session {
                    args.push("--fork-session".to_owned());
                    args.push(format!("--session-id={}", self.session_id));
                    if let Some(cut) = &self.resume_session_at {
                        args.push(format!("--resume-session-at={cut}"));
                    }
                }
            }
            None => args.push(format!("--session-id={}", self.session_id)),
        }
        for (flag, value) in [
            ("--permission-mode", &self.permission_mode),
            ("--model", &self.model),
            ("--effort", &self.effort),
        ] {
            if let Some(value) = value {
                args.push(flag.to_owned());
                args.push(value.clone());
            }
        }
        if self.sandbox {
            args.push("--settings".to_owned());
            args.push(SANDBOX_SETTINGS.to_owned());
        }
        if self.permission_prompt_tool_stdio {
            args.push("--permission-prompt-tool".to_owned());
            args.push("stdio".to_owned());
        }
        Ok(args)
    }

    /// The environment the child gets on top of what it inherits: file checkpointing on, with
    /// `env` laid over it (a name in `env` wins).
    pub fn child_env(&self) -> SecretEnv {
        let mut base = SecretEnv::default();
        base.insert(CHECKPOINTING_ENV, "true");
        base.overlaid(&self.env)
    }
}

// Written by hand: env shows only its count, and cwd is left out, as a path names the user.
// Kotlin's toString printed cwd; this deliberately does not.
impl fmt::Debug for LaunchSpec {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("LaunchSpec")
            .field("session_id", &self.session_id)
            .field("permission_mode", &self.permission_mode)
            .field("model", &self.model)
            .field("effort", &self.effort)
            .field("resume", &self.resume)
            .field("resume_session_at", &self.resume_session_at)
            .field("fork_session", &self.fork_session)
            .field("sandbox", &self.sandbox)
            .field(
                "permission_prompt_tool_stdio",
                &self.permission_prompt_tool_stdio,
            )
            .field("env", &self.env)
            .finish_non_exhaustive()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const OLD: &str = "336ed47b-2675-4317-b3f5-a3b48abb03a2";
    const NEW: &str = "aaaaaaaa-2675-4317-b3f5-a3b48abb03a2";
    const CUT: &str = "bbbbbbbb-2675-4317-b3f5-a3b48abb03a2";

    fn spec(id: &str) -> LaunchSpec {
        LaunchSpec::new(id)
    }

    fn some(s: &str) -> Option<String> {
        Some(s.to_owned())
    }

    fn args(spec: &LaunchSpec) -> Vec<String> {
        spec.to_args().expect("a valid spec")
    }

    /// The two items after the first `flag`, as Kotlin's `dropWhile { it != flag }.take(2)`.
    fn pair(args: &[String], flag: &str) -> Vec<String> {
        args.iter()
            .skip_while(|a| *a != flag)
            .take(2)
            .cloned()
            .collect()
    }

    fn count(args: &[String], pred: impl Fn(&str) -> bool) -> usize {
        args.iter().filter(|a| pred(a)).count()
    }

    fn index(args: &[String], item: &str) -> usize {
        args.iter().position(|a| a == item).expect("present")
    }

    #[test]
    fn a_minimal_spec_builds_the_stream_json_args_with_an_equals_joined_session_id() {
        let args = args(&spec("abc-123"));
        assert_eq!(
            args,
            [
                "-p",
                "--output-format",
                "stream-json",
                "--input-format",
                "stream-json",
                "--include-partial-messages",
                "--verbose",
                "--append-system-prompt",
                TOOL_USE_PROMPT,
                "--session-id=abc-123",
            ]
        );
        // `=` join (injection-safe), never a separate token.
        assert!(!args.iter().any(|a| a == "--session-id"));
    }

    #[test]
    fn every_launch_asks_for_the_file_tools_over_bash_whatever_the_mode() {
        // The mode can be switched to auto live, so the prompt does not depend on the starting mode.
        for mode in [None, some("default"), some("auto"), some("acceptEdits")] {
            let mut s = spec("s");
            s.permission_mode = mode;
            let args = args(&s);
            assert_eq!(count(&args, |a| a == "--append-system-prompt"), 1);
            assert_eq!(
                args[index(&args, "--append-system-prompt") + 1],
                TOOL_USE_PROMPT
            );
        }
        for tool in ["Read", "Edit", "Write", "Grep", "Bash"] {
            assert!(TOOL_USE_PROMPT.contains(tool), "names {tool}");
        }
    }

    // Deliberate difference from Kotlin: the first sentence names Closta, not a JetBrains IDE.
    #[test]
    fn the_prompt_names_closta_and_keeps_the_rest() {
        let first = "This session runs inside Closta, a desktop app that renders and tracks file tool calls. ";
        let kotlin = "This session runs inside a JetBrains IDE that renders and tracks file tool calls. \
            In every permission mode, including auto, read files with Read, search with Grep and Glob, \
            and change files with Edit and Write. Do not use Bash for these (no cat, head, sed -n, grep, \
            find, sed -i, heredocs or scripts that write files). Use Bash for builds, tests, git and \
            other commands that have no dedicated tool.";
        let kotlin_rest = &kotlin[kotlin.find("In every permission mode,").expect("in it")..];
        assert!(TOOL_USE_PROMPT.starts_with(first));
        assert_eq!(&TOOL_USE_PROMPT[first.len()..], kotlin_rest);
    }

    #[test]
    fn optional_flags_appear_only_when_set() {
        let bare = args(&spec("s"));
        assert!(!bare.iter().any(|a| a == "--permission-mode"
            || a == "--model"
            || a == "--permission-prompt-tool"));

        let mut s = spec("s");
        s.permission_mode = some("default");
        s.model = some("claude-opus-4-8");
        s.permission_prompt_tool_stdio = true;
        let full = args(&s);
        assert_eq!(
            pair(&full, "--permission-mode"),
            ["--permission-mode", "default"]
        );
        assert_eq!(pair(&full, "--model"), ["--model", "claude-opus-4-8"]);
        assert_eq!(
            pair(&full, "--permission-prompt-tool"),
            ["--permission-prompt-tool", "stdio"]
        );
    }

    #[test]
    fn a_resumed_session_is_opened_by_resume_of_its_id_and_never_names_session_id() {
        let mut s = spec(OLD);
        s.resume = some(OLD);
        s.effort = some("high");
        let args = args(&s);

        assert!(args.contains(&format!("--resume={OLD}")), "joined with =");
        assert!(!args.iter().any(|a| a == "--resume"));
        assert_eq!(
            count(&args, |a| a.starts_with("--session-id")),
            0,
            "the CLI takes --session-id with --resume only to fork"
        );
        assert_eq!(count(&args, |a| a.starts_with("--resume")), 1);
        assert_eq!(pair(&args, "--effort"), ["--effort", "high"]);
        assert!(format!("{s:?}").contains(&format!("resume: Some(\"{OLD}\")")));
        // A session that is not resumed names its id, as it always did.
        let fresh = self::args(&spec(OLD));
        assert!(fresh.contains(&format!("--session-id={OLD}")));
        assert_eq!(count(&fresh, |a| a.starts_with("--resume")), 0);
    }

    #[test]
    fn a_fork_opens_the_saved_session_under_a_new_id_with_the_three_flags_in_order() {
        let mut s = spec(NEW);
        s.resume = some(OLD);
        s.fork_session = true;
        s.effort = some("high");
        let fork = args(&s);

        let at = index(&fork, &format!("--resume={OLD}"));
        assert_eq!(
            fork[at..at + 3],
            [
                format!("--resume={OLD}"),
                "--fork-session".to_owned(),
                format!("--session-id={NEW}"),
            ]
        );
        assert_eq!(count(&fork, |a| a.starts_with("--resume")), 1);
        assert_eq!(count(&fork, |a| a == "--fork-session"), 1);
        assert_eq!(count(&fork, |a| a.starts_with("--session-id")), 1);
        assert_eq!(pair(&fork, "--effort"), ["--effort", "high"]);
        // Without the fork flag the args are as before; the other flags are the same as a fork's.
        let mut p = spec(OLD);
        p.resume = some(OLD);
        p.effort = some("high");
        let plain = args(&p);
        let fork_only = |a: &str| a.starts_with("--resume") || a == "--fork-session";
        let plain_rest: Vec<_> = plain.iter().filter(|a| !fork_only(a)).collect();
        let fork_rest: Vec<_> = fork
            .iter()
            .filter(|a| !fork_only(a) && !a.starts_with("--session-id"))
            .collect();
        assert_eq!(plain_rest, fork_rest);
        assert!(!plain.iter().any(|a| a == "--fork-session"));
        assert!(format!("{s:?}").contains("fork_session: true"));
    }

    #[test]
    fn a_fork_without_a_session_to_fork_is_a_mistake_of_the_caller() {
        let mut s = spec("s");
        s.fork_session = true;
        assert_eq!(s.to_args(), Err(SpecError::ForkWithoutResume));
    }

    #[test]
    fn an_effort_is_one_effort_flag_with_its_level_and_none_leaves_it_out() {
        let mut s = spec("s");
        s.effort = some("high");
        let high = args(&s);
        assert_eq!(pair(&high, "--effort"), ["--effort", "high"]);
        assert_eq!(count(&high, |a| a == "--effort"), 1);
        assert!(!args(&spec("s")).iter().any(|a| a == "--effort"));
        s.effort = some("max");
        assert!(format!("{s:?}").contains("effort: Some(\"max\")"));
    }

    #[test]
    fn the_sandbox_adds_its_settings_flag() {
        let mut s = spec("s");
        s.sandbox = true;
        let args = args(&s);
        assert_eq!(
            args[index(&args, "--settings") + 1],
            r#"{"sandbox":{"enabled":true,"failIfUnavailable":true}}"#
        );
    }

    #[test]
    fn no_settings_flag_without_the_sandbox() {
        assert!(!args(&spec("s")).iter().any(|a| a == "--settings"));
    }

    #[test]
    fn the_settings_flag_comes_right_after_effort_with_a_resume() {
        // 39's second CLI: `--resume=<id>` and the sandbox's `--settings` together.
        let mut s = spec("s");
        s.resume = some("s");
        s.effort = some("high");
        s.sandbox = true;
        let args = args(&s);
        assert!(args.iter().any(|a| a == "--resume=s"));
        assert_eq!(count(&args, |a| a == "--settings"), 1);
        assert_eq!(index(&args, "--effort") + 2, index(&args, "--settings"));
        assert_eq!(args[index(&args, "--settings") + 1], SANDBOX_SETTINGS);
    }

    #[test]
    fn debug_names_the_sandbox_and_hides_the_env() {
        let mut s = spec("s");
        s.sandbox = true;
        s.env.insert("ANTHROPIC_AUTH_TOKEN", "sk-secret");
        let shown = format!("{s:?}");
        assert!(shown.contains("sandbox: true"), "{shown}");
        assert!(!shown.contains("sk-secret"), "{shown}");
    }

    #[test]
    fn env_is_never_placed_on_the_args() {
        let mut s = spec("s");
        s.env.insert("ANTHROPIC_AUTH_TOKEN", "sk-secret-value");
        s.env.insert("HTTPS_PROXY", "http://proxy");
        let args = args(&s);
        for needle in ["sk-secret-value", "ANTHROPIC_AUTH_TOKEN", "HTTPS_PROXY"] {
            assert!(!args.iter().any(|a| a.contains(needle)), "{needle} on args");
        }
    }

    #[test]
    fn the_child_env_switches_file_checkpointing_on_and_the_spec_env_wins() {
        let mut s = spec("s");
        s.env.insert("K", "v");
        let plain = s.child_env();
        assert_eq!(plain.get(CHECKPOINTING_ENV), Some("true"));
        assert_eq!(plain.get("K"), Some("v"));
        assert_eq!(
            plain.get("CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING"),
            None,
            "the DISABLE name is never added"
        );
        let mut off = spec("s");
        off.env.insert(CHECKPOINTING_ENV, "false");
        assert_eq!(off.child_env().get(CHECKPOINTING_ENV), Some("false"));
        // The spec's own env is as before: the count is of the spec's env only.
        assert!(format!("{s:?}").contains("SecretEnv(<1 redacted>)"));
    }

    #[test]
    fn a_fork_with_a_cut_point_has_resume_session_at_right_after_session_id() {
        let mut s = spec(NEW);
        s.resume = some(OLD);
        s.fork_session = true;
        s.resume_session_at = some(CUT);
        let args = args(&s);

        let at = index(&args, &format!("--resume={OLD}"));
        assert_eq!(
            args[at..at + 4],
            [
                format!("--resume={OLD}"),
                "--fork-session".to_owned(),
                format!("--session-id={NEW}"),
                format!("--resume-session-at={CUT}"),
            ]
        );
        assert_eq!(count(&args, |a| a.starts_with("--resume-session-at")), 1);
        assert!(format!("{s:?}").contains(&format!("resume_session_at: Some(\"{CUT}\")")));
    }

    #[test]
    fn without_a_cut_point_the_args_are_those_of_a_resume_a_fork_and_a_new_session() {
        let mut resume = spec(OLD);
        resume.resume = some(OLD);
        resume.effort = some("high");
        let mut fork = spec(NEW);
        fork.resume = some(OLD);
        fork.fork_session = true;
        fork.effort = some("high");
        let mut fresh = spec(NEW);
        fresh.effort = some("high");
        let all: Vec<String> = [&resume, &fork, &fresh]
            .into_iter()
            .flat_map(args)
            .collect();
        assert_eq!(count(&all, |a| a.starts_with("--resume-session-at")), 0);
        // Only the cut flag is added: take it out and the two are equal.
        let mut cut = fork.clone();
        cut.resume_session_at = some(CUT);
        let cut_rest: Vec<String> = args(&cut)
            .into_iter()
            .filter(|a| !a.starts_with("--resume-session-at"))
            .collect();
        assert_eq!(args(&fork), cut_rest);
    }

    #[test]
    fn a_cut_point_without_a_resume_or_without_a_fork_is_a_mistake_of_the_caller() {
        let mut bare = spec("s");
        bare.resume_session_at = some(CUT);
        assert_eq!(bare.to_args(), Err(SpecError::CutWithoutFork));
        let mut unforked = spec(OLD);
        unforked.resume = some(OLD);
        unforked.resume_session_at = some(CUT);
        assert_eq!(unforked.to_args(), Err(SpecError::CutWithoutFork));
    }
}
