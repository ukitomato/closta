//! What the composer shows, worked out from the conversation (ComposerStateTest.kt), and the rules
//! for what it takes as attachments (AttachmentRules.kt).

use std::sync::Arc;

use closta_model::{AttachmentKind, ConversationState, SessionInfo};
use closta_presenter::composer_state::{
    ComposerState, EFFORT_LEVELS, PERMISSION_MODES, SandboxBlock, SandboxView, composer_state,
    short_label,
};
use closta_presenter::records::attachment::{
    AttachmentFault, AttachmentLimits, AttachmentVerdict, check_attachment,
};
use closta_presenter::records::operations::{
    ModelRecord, OperationRecords, SwitchKind, SwitchOutcome, SwitchRecord,
};
use closta_presenter::transcript::{Routing, Transcript};

const LEVELS: [&str; 5] = ["low", "medium", "high", "xhigh", "max"];

fn levels() -> Arc<[String]> {
    LEVELS.iter().map(|it| (*it).to_owned()).collect()
}

fn model(
    value: &str,
    resolved: Option<&str>,
    display_name: &str,
    description: &str,
    effort: Option<Arc<[String]>>,
) -> ModelRecord {
    ModelRecord {
        value: value.into(),
        resolved_model: resolved.map(str::to_owned),
        display_name: display_name.into(),
        description: description.into(),
        supports_effort: Some(effort.is_some()),
        supported_effort_levels: effort,
    }
}

fn default_model() -> ModelRecord {
    model(
        "default",
        None,
        "Default (recommended)",
        "Opus 5.5 · Best for everyday",
        Some(levels()),
    )
}

fn opus() -> ModelRecord {
    model(
        "opus",
        Some("claude-opus-5-5"),
        "Opus 5.5",
        "Most capable",
        Some(levels()),
    )
}

fn haiku() -> ModelRecord {
    model(
        "haiku",
        Some("claude-haiku-5-5"),
        "Haiku 5.5",
        "Fastest",
        None,
    )
}

fn session(model: &str, mode: &str) -> SessionInfo {
    SessionInfo {
        session_id: "s".into(),
        model: model.into(),
        permission_mode: mode.into(),
        cwd: "/w".into(),
        version: "2.1".into(),
    }
}

struct Given {
    model: Option<&'static str>,
    mode: &'static str,
    models: Vec<ModelRecord>,
    switches: Vec<SwitchRecord>,
    effort: Option<&'static str>,
}

impl Default for Given {
    fn default() -> Self {
        Self {
            model: None,
            mode: "default",
            models: vec![default_model(), opus(), haiku()],
            switches: Vec::new(),
            effort: Some("high"),
        }
    }
}

impl Given {
    fn state(self) -> ComposerState {
        let conversation = ConversationState {
            session: self.model.map(|it| session(it, self.mode)),
            ..ConversationState::default()
        };
        let transcript = Transcript {
            operations: Arc::new(OperationRecords {
                models: self.models.into(),
                switches: self.switches.into_iter().collect(),
                effort: self.effort.map(str::to_owned),
                ..OperationRecords::default()
            }),
            ..Transcript::default()
        };
        composer_state(&conversation, &transcript)
    }
}

fn switch(id: &str, kind: SwitchKind, value: &str, outcome: SwitchOutcome) -> SwitchRecord {
    SwitchRecord {
        id: id.into(),
        seq: 1,
        kind,
        value: value.into(),
        outcome,
        detail: None,
    }
}

fn applied(kind: SwitchKind, value: &str) -> SwitchRecord {
    switch("x", kind, value, SwitchOutcome::Applied)
}

fn on_opus() -> Given {
    Given {
        model: Some("claude-opus-5-5"),
        ..Given::default()
    }
}

#[test]
fn the_default_row_shows_the_model_in_use() {
    let chosen = Given {
        switches: vec![applied(SwitchKind::Model, "default")],
        ..on_opus()
    }
    .state();
    assert_eq!("Default (Opus 5.5)", chosen.model.label);
    assert_eq!("Opus 5.5", short_label(&chosen.model));
}

#[test]
fn the_model_in_use_is_matched_by_its_resolved_id() {
    let chosen = on_opus().state();
    assert_eq!("Opus 5.5", chosen.model.label);
    assert_eq!(Some("claude-opus-5-5"), chosen.model.resolved.as_deref());
    assert_eq!(
        "Opus 5.5",
        short_label(&chosen.model),
        "no brackets to drop"
    );
}

#[test]
fn an_unknown_model_is_reported() {
    let chosen = Given {
        model: Some("claude-mystery-9"),
        ..Given::default()
    }
    .state();
    assert_eq!(Some("claude-mystery-9"), chosen.unknown_model.as_deref());
    assert_eq!("claude-mystery-9", chosen.model.label);
}

#[test]
fn no_models_yet() {
    let chosen = Given {
        models: Vec::new(),
        ..Given::default()
    }
    .state();
    assert!(chosen.models.is_empty());
    assert_eq!("Default", chosen.model.label);
    assert_eq!(None, chosen.unknown_model);
}

#[test]
fn effort_only_for_models_that_take_it() {
    assert_eq!(LEVELS.to_vec(), on_opus().state().effort_levels);
    assert!(
        Given {
            model: Some("claude-haiku-5-5"),
            ..Given::default()
        }
        .state()
        .effort_levels
        .is_empty()
    );
    assert_eq!(LEVELS, EFFORT_LEVELS);
}

#[test]
fn effort_is_disabled_while_running() {
    let conversation = ConversationState {
        session: Some(session("claude-opus-5-5", "default")),
        ..ConversationState::default()
    };
    let sent = Transcript {
        routing: Routing {
            sends: 1,
            ..Routing::default()
        },
        operations: Arc::new(OperationRecords {
            models: vec![opus()].into(),
            ..OperationRecords::default()
        }),
        ..Transcript::default()
    };
    let running = composer_state(&conversation, &sent);
    assert!(running.running);
    assert!(!running.effort_enabled);
    assert!(on_opus().state().effort_enabled);
}

#[test]
fn an_effort_outside_the_levels_is_kept() {
    assert_eq!(
        Some("ultra"),
        Given {
            effort: Some("ultra"),
            ..on_opus()
        }
        .state()
        .effort
        .as_deref()
    );
}

#[test]
fn the_mode_comes_from_the_session() {
    assert_eq!(
        Some("acceptEdits"),
        Given {
            mode: "acceptEdits",
            ..on_opus()
        }
        .state()
        .mode
        .as_deref()
    );
    assert_eq!(
        vec![
            "default",
            "acceptEdits",
            "plan",
            "auto",
            "dontAsk",
            "bypassPermissions"
        ],
        Given::default().state().modes
    );
    assert_eq!(PERMISSION_MODES.to_vec(), Given::default().state().modes);
}

#[test]
fn a_pending_switch_is_shown() {
    let pending = SwitchRecord {
        seq: 2,
        ..switch("p", SwitchKind::Model, "haiku", SwitchOutcome::Pending)
    };
    assert_eq!(
        Some(pending.clone()),
        Given {
            switches: vec![pending],
            ..on_opus()
        }
        .state()
        .switching
    );
}

fn sandbox_state(operations: OperationRecords, running: bool) -> ComposerState {
    let routing = Routing {
        sends: i32::from(running),
        ..Routing::default()
    };
    composer_state(
        &ConversationState::default(),
        &Transcript {
            routing,
            operations: Arc::new(operations),
            ..Transcript::default()
        },
    )
}

fn with_switches(switches: Vec<SwitchRecord>) -> OperationRecords {
    OperationRecords {
        switches: switches.into_iter().collect(),
        ..OperationRecords::default()
    }
}

#[test]
fn a_pending_sandbox_switch_blocks_the_button() {
    let pending = switch("x", SwitchKind::Sandbox, "false", SwitchOutcome::Pending);
    let shown = sandbox_state(
        OperationRecords {
            sandbox: Some(true),
            ..with_switches(vec![pending.clone()])
        },
        false,
    );
    assert_eq!(
        SandboxView {
            on: true,
            blocked: Some(SandboxBlock::Switching)
        },
        shown.sandbox
    );
    assert_eq!(Some(pending), shown.switching);
    assert_eq!(None, shown.sandbox_failure);
}

#[test]
fn turning_the_sandbox_on_is_blocked_while_running() {
    let shown = sandbox_state(
        OperationRecords {
            sandbox: Some(false),
            ..OperationRecords::default()
        },
        true,
    );
    assert_eq!(
        SandboxView {
            on: false,
            blocked: Some(SandboxBlock::Running)
        },
        shown.sandbox
    );
    assert_eq!(
        SandboxView {
            on: false,
            blocked: None
        },
        sandbox_state(OperationRecords::default(), false).sandbox
    );
}

#[test]
fn turning_the_sandbox_off_is_allowed_while_running() {
    let shown = sandbox_state(
        OperationRecords {
            sandbox: Some(true),
            ..OperationRecords::default()
        },
        true,
    );
    assert_eq!(
        SandboxView {
            on: true,
            blocked: None
        },
        shown.sandbox
    );
    let launched = sandbox_state(
        OperationRecords {
            launch_sandbox: true,
            ..OperationRecords::default()
        },
        true,
    );
    assert!(
        launched.sandbox.on,
        "the launch's value until the CLI answers"
    );
}

#[test]
fn the_sandbox_failure_is_the_newest_record_only() {
    let failed = SwitchRecord {
        detail: Some("x".into()),
        ..switch("a", SwitchKind::Sandbox, "true", SwitchOutcome::Failed)
    };
    let later = SwitchRecord {
        seq: 2,
        ..switch("b", SwitchKind::Sandbox, "true", SwitchOutcome::Applied)
    };
    assert_eq!(
        Some(failed.clone()),
        sandbox_state(with_switches(vec![failed.clone()]), false).sandbox_failure
    );
    assert_eq!(
        None,
        sandbox_state(with_switches(vec![failed, later]), false).sandbox_failure
    );
}

#[test]
fn the_attachment_rules() {
    let refused = AttachmentVerdict::Refused;
    assert_eq!(
        refused(AttachmentFault::TooLarge),
        check_attachment("big.png", Some("image/png"), 5_242_881, 0)
    );
    assert_eq!(
        refused(AttachmentFault::TooMany),
        check_attachment("a.png", Some("image/png"), 10, 10)
    );
    assert_eq!(
        refused(AttachmentFault::Unsupported),
        check_attachment("a.bmp", Some("image/bmp"), 10, 0)
    );
    assert_eq!(
        AttachmentVerdict::Ok {
            kind: AttachmentKind::Image,
            media_type: "image/png".into()
        },
        check_attachment("a.png", Some("image/png"), 10, 0)
    );
    assert_eq!(
        AttachmentVerdict::Ok {
            kind: AttachmentKind::Document,
            media_type: "application/pdf".into()
        },
        check_attachment("a.pdf", Some("application/pdf"), 10, 0)
    );
    assert_eq!(
        AttachmentVerdict::Ok {
            kind: AttachmentKind::Text,
            media_type: "text/plain".into()
        },
        check_attachment("notes.md", None, 10, 0)
    );
    assert_eq!(
        refused(AttachmentFault::NameTooLong),
        check_attachment(
            &format!("{}.txt", "x".repeat(256)),
            Some("text/plain"),
            10,
            0
        )
    );
}

#[test]
fn a_name_is_measured_in_code_points_so_255_emoji_fit_and_256_do_not() {
    // Each emoji is two UTF-16 units but one code point: Kotlin counts code points
    // (`codePointCount`), not the string's length.
    let fits = format!("{}.txt", "😀".repeat(AttachmentLimits::MAX_NAME_CHARS - 4));
    let over = format!("{}.txt", "😀".repeat(AttachmentLimits::MAX_NAME_CHARS - 3));
    assert_eq!(AttachmentLimits::MAX_NAME_CHARS, fits.chars().count());
    assert_eq!(
        AttachmentVerdict::Ok {
            kind: AttachmentKind::Text,
            media_type: "text/plain".into()
        },
        check_attachment(&fits, Some("text/plain"), 10, 0)
    );
    assert_eq!(
        AttachmentVerdict::Refused(AttachmentFault::NameTooLong),
        check_attachment(&over, Some("text/plain"), 10, 0)
    );
}

#[test]
fn a_media_type_is_read_without_its_parameters_and_case_and_a_text_type_is_taken() {
    assert_eq!(
        AttachmentVerdict::Ok {
            kind: AttachmentKind::Image,
            media_type: "image/png".into()
        },
        check_attachment("a", Some(" Image/PNG ; q=1"), 10, 0)
    );
    assert_eq!(
        AttachmentVerdict::Ok {
            kind: AttachmentKind::Text,
            media_type: "text/x-rust".into()
        },
        check_attachment("a.rs", Some("text/x-rust"), 10, 0)
    );
    assert_eq!(
        AttachmentVerdict::Ok {
            kind: AttachmentKind::Text,
            media_type: "application/json".into()
        },
        check_attachment("a.json", Some("application/json"), 10, 0)
    );
    assert_eq!(
        AttachmentVerdict::Refused(AttachmentFault::Unsupported),
        check_attachment("a.bin", None, 10, 0),
        "no type and no text extension"
    );
    assert_eq!(
        AttachmentVerdict::Ok {
            kind: AttachmentKind::Text,
            media_type: "text/plain".into()
        },
        check_attachment("NOTES.MD", Some(""), 10, 0),
        "an empty type is no type, and the extension is read without case"
    );
}
