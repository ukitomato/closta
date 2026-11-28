//! What a restart into the sandbox launches and carries over, and how the first lines of a
//! sandboxed CLI are watched. The pure parts of SandboxRestart.kt.

use closta_model::AgentEvent;
use closta_presenter::composer_state::composer_state;
use closta_presenter::records::operations::{SwitchKind, SwitchOutcome};
use closta_presenter::session::SessionView;
use closta_providers::claude::launch::spec::LaunchSpec;

use crate::history::SessionOpening;

/// The value of a sandbox switch that turns it on.
pub const SANDBOX_ON: &str = "true";

const BYPASS_MODE: &str = "bypassPermissions";
const DEFAULT_MODEL: &str = "default";

/// What a restart into the sandbox carries over from the conversation, as the launch flags take
/// them. `None` leaves the flag as the session was launched with it.
#[derive(Clone, PartialEq, Debug)]
pub struct CarriedChoices {
    pub mode: Option<String>,
    pub model: Option<String>,
    pub effort: Option<String>,
}

/// The conversation's permission mode (never `bypassPermissions`), and the model (none for
/// "default") and effort the user switched to. A model or an effort no switch chose is not
/// carried: what the CLI picked on its own stays its own choice, and the launch's value (which
/// may be none) is used.
pub fn carried_choices(view: &SessionView) -> CarriedChoices {
    let composer = composer_state(&view.conversation, &view.transcript);
    CarriedChoices {
        mode: composer.mode.filter(|mode| mode != BYPASS_MODE),
        model: applied(view, SwitchKind::Model).filter(|model| model != DEFAULT_MODEL),
        effort: applied(view, SwitchKind::Effort),
    }
}

/// The value of the last switch of `kind` the CLI applied, unless it is empty.
fn applied(view: &SessionView, kind: SwitchKind) -> Option<String> {
    view.transcript
        .operations
        .switches
        .iter()
        .rev()
        .find(|switch| switch.kind == kind && switch.outcome == SwitchOutcome::Applied)
        .map(|switch| switch.value.clone())
        .filter(|value| !value.is_empty())
}

/// The spec a restart launches. `sent_under` is the id the conversation is saved under now once a
/// message was sent (the launch's own id, or the CLI's new one after a `/clear`), `None` while
/// none was. After a message, or in a session opened as a resume, it resumes the session by that
/// id (`--resume=<id>`, without the fork and the cut); a resume with nothing sent by its own id. A
/// new session with nothing sent starts as it was launched (keeping its `--session-id`: capture
/// 40). The `carried` mode, model and effort win over the launch's, and `sandbox` is the given
/// value.
pub fn restart_spec(
    launched: &LaunchSpec,
    sent_under: Option<&str>,
    opening: SessionOpening,
    carried: &CarriedChoices,
    sandbox: bool,
) -> LaunchSpec {
    let mut spec = launched.clone();
    if sent_under.is_some() || opening == SessionOpening::Resume {
        spec.resume = Some(sent_under.map_or_else(|| launched.session_id.clone(), str::to_owned));
        spec.fork_session = false;
        spec.resume_session_at = None;
    }
    spec.permission_mode = carried
        .mode
        .clone()
        .or_else(|| launched.permission_mode.clone());
    spec.model = carried.model.clone().or_else(|| launched.model.clone());
    spec.effort = carried.effort.clone().or_else(|| launched.effort.clone());
    spec.sandbox = sandbox;
    spec
}

/// Holds back a sandboxed CLI's `result` lines until it says anything else: a CLI that cannot
/// sandbox writes one error `result` and exits before `initialize` (capture 36), and that result
/// is not the conversation's. A CLI not asked into the sandbox is started from its first line.
pub struct SandboxStartWatch {
    started: bool,
    held: Vec<AgentEvent>,
}

impl SandboxStartWatch {
    pub fn new(sandboxed: bool) -> SandboxStartWatch {
        SandboxStartWatch {
            started: !sandboxed,
            held: Vec::new(),
        }
    }

    /// The events to fold now for `event`: none while it is held, the held ones and `event` once
    /// the CLI started.
    pub fn pass(&mut self, event: AgentEvent) -> Vec<AgentEvent> {
        if self.started {
            return vec![event];
        }
        if matches!(event, AgentEvent::Result { .. }) {
            self.held.push(event);
            return Vec::new();
        }
        self.started = true;
        let mut now = std::mem::take(&mut self.held);
        now.push(event);
        now
    }

    /// Whether the CLI said something other than a `result`.
    pub fn started(&self) -> bool {
        self.started
    }

    /// The sentence of the last error result held back, if any.
    pub fn detail(&self) -> Option<String> {
        self.held.iter().rev().find_map(|event| match event {
            AgentEvent::Result {
                is_error: true,
                result,
                ..
            } => Some(result.clone()),
            _ => None,
        })
    }
}

#[cfg(test)]
mod tests {
    use closta_model::RawJson;
    use closta_presenter::input::{ControlRequested, PresenterInput};
    use closta_presenter::records::operations::ControlKind;
    use closta_providers::claude::protocol::decode;

    use super::*;

    const ID: &str = "0f8fad5b-d9cb-469f-a165-70867728950e";
    const PARENT: &str = "336ed47b-2675-4317-b3f5-a3b48abb03a2";
    const CUT: &str = "9c4f7a1e-2b3d-4e5f-8a6b-7c8d9e0f1a2b";
    const SWITCH: &str = "switch-1";
    const ASKED: &str = "settings-1";

    const BASELINE: &str = include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../../jetbrains/src/main/kotlin/dev/ukitomato/closta/providers/claude/fixtures/",
        "01-baseline-text.ndjson"
    ));

    fn none() -> CarriedChoices {
        CarriedChoices {
            mode: None,
            model: None,
            effort: None,
        }
    }

    fn args(spec: &LaunchSpec) -> Vec<String> {
        spec.to_args().expect("valid args")
    }

    fn success(id: &str) -> PresenterInput {
        PresenterInput::Event(decode(&format!(
            r#"{{"type":"control_response","response":{{"subtype":"success","request_id":"{id}"}}}}"#
        )))
    }

    fn requested(id: &str, kind: ControlKind, value: Option<&str>) -> PresenterInput {
        PresenterInput::ControlRequested(ControlRequested {
            request_id: id.to_owned(),
            kind,
            value: value.map(str::to_owned),
        })
    }

    fn result(text: &str, is_error: bool) -> AgentEvent {
        AgentEvent::Result {
            uuid: format!("u-{text}"),
            session_id: "s".into(),
            subtype: if is_error {
                "error_during_execution"
            } else {
                "success"
            }
            .into(),
            result: text.into(),
            is_error,
            stop_reason: None,
            terminal_reason: None,
            num_turns: 0,
            result_index: 0,
            queued_turn_count: None,
            total_cost_usd: 0.0,
            duration_ms: 0,
            duration_api_ms: 0,
            ttft_ms: None,
            ttft_stream_ms: None,
            time_to_request_ms: None,
            first_content_frame_ms: None,
            fast_mode_state: None,
            usage: RawJson("{}".into()),
            model_usage: RawJson("{}".into()),
            permission_denials: RawJson("[]".into()),
            subagent_stats: None,
            api_error_status: None,
            fast_mode_disabled_reason: None,
            request_sent_wall_ms: None,
            user_message_uuid: None,
            user_message_uuids: None,
            origin: None,
            local_command: None,
        }
    }

    fn init_line() -> AgentEvent {
        BASELINE
            .lines()
            .find(|line| line.contains(r#""subtype":"init""#))
            .map(decode)
            .expect("an init line")
    }

    #[test]
    fn after_a_message_resumes_the_session() {
        let argv = args(&restart_spec(
            &LaunchSpec::new(ID),
            Some(ID),
            SessionOpening::New,
            &none(),
            true,
        ));

        assert!(argv.contains(&format!("--resume={ID}")), "{argv:?}");
        assert!(
            !argv.iter().any(|it| it.starts_with("--session-id")),
            "{argv:?}"
        );
        assert!(argv.iter().any(|it| it == "--settings"), "{argv:?}");
    }

    #[test]
    fn a_restart_after_a_clear_resumes_the_id_it_was_sent_under() {
        // AfterAClearResumesTheConversationTheClearStarted (SandboxRestartTest.kt, fed67ce), with
        // the id capture 41's init after its reset names (41 line 20).
        let cleared = "b3c1b6ae-517a-4b6a-8b61-f3693facb4f1";

        let argv = args(&restart_spec(
            &LaunchSpec::new(ID),
            Some(cleared),
            SessionOpening::New,
            &none(),
            true,
        ));

        assert!(argv.contains(&format!("--resume={cleared}")), "{argv:?}");
        assert!(!argv.contains(&format!("--resume={ID}")), "{argv:?}");
        assert!(
            !argv.iter().any(|it| it.starts_with("--session-id")),
            "{argv:?}"
        );
    }

    #[test]
    fn before_the_first_message_keeps_the_session_id() {
        let argv = args(&restart_spec(
            &LaunchSpec::new(ID),
            None,
            SessionOpening::New,
            &none(),
            true,
        ));

        assert!(argv.contains(&format!("--session-id={ID}")), "{argv:?}");
        assert!(
            !argv.iter().any(|it| it.starts_with("--resume")),
            "{argv:?}"
        );
        assert!(argv.iter().any(|it| it == "--settings"), "{argv:?}");
    }

    #[test]
    fn a_resumed_session_restarts_with_resume_even_with_nothing_sent() {
        let argv = args(&restart_spec(
            &LaunchSpec::new(ID),
            None,
            SessionOpening::Resume,
            &none(),
            true,
        ));

        assert!(argv.contains(&format!("--resume={ID}")), "{argv:?}");
        assert!(
            !argv.iter().any(|it| it.starts_with("--session-id")),
            "{argv:?}"
        );
    }

    #[test]
    fn after_a_message_drops_the_fork_and_the_cut() {
        let launched = LaunchSpec {
            resume: Some(PARENT.to_owned()),
            fork_session: true,
            resume_session_at: Some(CUT.to_owned()),
            ..LaunchSpec::new(ID)
        };

        let argv = args(&restart_spec(
            &launched,
            Some(ID),
            SessionOpening::New,
            &none(),
            true,
        ));

        assert!(argv.contains(&format!("--resume={ID}")), "{argv:?}");
        assert!(!argv.iter().any(|it| it == "--fork-session"), "{argv:?}");
        assert!(
            !argv.iter().any(|it| it.starts_with("--resume-session-at")),
            "{argv:?}"
        );
        assert!(
            !argv.iter().any(|it| it.starts_with("--session-id")),
            "{argv:?}"
        );
    }

    #[test]
    fn bypass_is_not_carried() {
        let view = SessionView::default()
            .fold(&requested(SWITCH, ControlKind::Mode, Some(BYPASS_MODE)))
            .fold(&success(SWITCH));

        let carried = carried_choices(&view);

        assert_eq!(None, carried.mode);
        let launched = LaunchSpec {
            permission_mode: Some("acceptEdits".to_owned()),
            ..LaunchSpec::new(ID)
        };
        assert_eq!(
            Some("acceptEdits"),
            restart_spec(&launched, Some(ID), SessionOpening::New, &carried, true)
                .permission_mode
                .as_deref()
        );
    }

    #[test]
    fn choices_win_over_the_launch_and_a_default_model_is_none() {
        let launched = LaunchSpec {
            permission_mode: Some("default".to_owned()),
            model: Some("sonnet".to_owned()),
            effort: Some("low".to_owned()),
            ..LaunchSpec::new(ID)
        };
        let carried = CarriedChoices {
            mode: Some("plan".to_owned()),
            model: Some("opus".to_owned()),
            effort: Some("high".to_owned()),
        };

        let spec = restart_spec(&launched, Some(ID), SessionOpening::New, &carried, true);

        assert_eq!(
            (Some("plan"), Some("opus"), Some("high")),
            (
                spec.permission_mode.as_deref(),
                spec.model.as_deref(),
                spec.effort.as_deref()
            )
        );
        assert!(spec.sandbox);
        assert_eq!(
            None,
            carried_choices(&SessionView::default()).model,
            "a session with no model chosen carries none"
        );
    }

    #[test]
    fn nothing_chosen_leaves_the_model_and_the_effort_to_the_cli() {
        // The CLI says the model it uses (init) and the effort in effect (a settings answer); the
        // user chose neither.
        let settings = decode(&format!(
            r#"{{"type":"control_response","response":{{"subtype":"success","request_id":"{ASKED}","response":{{"effective":{{}},"applied":{{"model":"claude-sonnet-4-6","effort":"high"}}}}}}}}"#
        ));
        let view = SessionView::default()
            .fold(&PresenterInput::Event(init_line()))
            .fold(&requested(ASKED, ControlKind::Settings, None))
            .fold(&PresenterInput::Event(settings));
        assert_eq!(
            Some("high"),
            view.transcript.operations.effort.as_deref(),
            "the CLI's effort is in the view"
        );

        let carried = carried_choices(&view);

        assert_eq!(None, carried.model);
        assert_eq!(None, carried.effort);
        let argv = args(&restart_spec(
            &LaunchSpec::new(ID),
            Some(ID),
            SessionOpening::New,
            &carried,
            true,
        ));
        assert!(!argv.iter().any(|it| it == "--model"), "{argv:?}");
        assert!(!argv.iter().any(|it| it == "--effort"), "{argv:?}");
    }

    #[test]
    fn applied_switches_are_carried() {
        let view = [
            ("m", ControlKind::Model, "opus"),
            ("e", ControlKind::Effort, "max"),
        ]
        .into_iter()
        .fold(SessionView::default(), |view, (id, kind, value)| {
            view.fold(&requested(id, kind, Some(value)))
                .fold(&success(id))
        });

        let carried = carried_choices(&view);

        assert_eq!(
            (Some("opus"), Some("max")),
            (carried.model.as_deref(), carried.effort.as_deref())
        );
    }

    #[test]
    fn a_cli_not_asked_into_the_sandbox_is_started_from_its_first_line() {
        let mut watch = SandboxStartWatch::new(false);

        assert!(watch.started());
        assert_eq!(vec![result("done", true)], watch.pass(result("done", true)));
        assert_eq!(None, watch.detail());
    }

    #[test]
    fn results_are_held_until_the_cli_says_something_else_and_then_come_first() {
        let mut watch = SandboxStartWatch::new(true);

        assert!(watch.pass(result("one", false)).is_empty());
        assert!(watch.pass(result("two", true)).is_empty());
        assert!(!watch.started());

        assert_eq!(
            vec![result("one", false), result("two", true), init_line()],
            watch.pass(init_line())
        );
        assert!(watch.started());
        assert_eq!(
            vec![result("three", false)],
            watch.pass(result("three", false))
        );
        assert_eq!(None, watch.detail(), "nothing is held once it started");
    }

    #[test]
    fn the_detail_is_the_sentence_of_the_last_error_result_held() {
        let mut watch = SandboxStartWatch::new(true);
        assert_eq!(None, watch.detail());

        watch.pass(result("first failure", true));
        watch.pass(result("second failure", true));
        watch.pass(result("not an error", false));

        assert!(!watch.started());
        assert_eq!(Some("second failure".to_owned()), watch.detail());
    }
}
