//! What the operations console keeps in the transcript: the switches and how each ended, the
//! context usage, the tokens, the compactions, and the effort (OperationsFoldTest.kt). Each is read
//! off a capture's own lines or folded from the host's inputs.
//!
//! Kotlin checks that a usage request leaves the tree the same object, which only its
//! `ProjectionMemo` keeps; the memo is not ported, so that test checks the transcript is the same
//! `Arc` and the tree is equal.

use std::sync::Arc;

use closta_goldens::common::read_capture;
use closta_goldens::lines::{self, ResultLine};
use closta_goldens::projector::project_tree;
use closta_goldens::replay::{THREAD, inputs};
use closta_goldens::tree_reading::at;
use closta_model::{AgentEvent, RawJson, TurnPhase};
use closta_presenter::input::{
    ControlRequested, EffortRefused, Launched, PresenterInput, RewindNotSent, RewindRequested,
};
use closta_presenter::records::operations::{
    CompactionRecord, ContextRecord, ControlKind, MAX_COMPACTIONS, MAX_SWITCHES, MAX_WAITING,
    OperationRecords, SwitchKind, SwitchOutcome, TokenTotals,
};
use closta_presenter::records::rewind::{
    MAX_REWIND_FILES, REWIND_SEND_FAILED, REWIND_UNREADABLE, RewindOutcome, RewindRecord,
};
use closta_presenter::rewind_refusal::REWIND_CHECK_FIRST;
use closta_presenter::session::SessionView;
use closta_presenter::text::utf16_len;
use closta_presenter::transcript::Transcript;
use serde_json::{Map, Value, json};

const MAX_DETAIL: usize = 500;
const NO_CHECKPOINT: &str = "No file checkpoint found for this message.";

#[derive(Clone, Default)]
struct Host(SessionView);

impl Host {
    fn with(&self, input: PresenterInput) -> Host {
        Host(self.0.clone().fold(&input))
    }

    fn event(&self, event: AgentEvent) -> Host {
        self.with(PresenterInput::Event(event))
    }

    fn request(&self, id: &str, kind: ControlKind, value: Option<&str>) -> Host {
        self.with(PresenterInput::ControlRequested(ControlRequested {
            request_id: id.into(),
            kind,
            value: value.map(str::to_owned),
        }))
    }

    fn transcript(&self) -> &Arc<Transcript> {
        &self.0.transcript
    }

    fn ops(&self) -> &OperationRecords {
        &self.0.transcript.operations
    }

    fn rewind(&self) -> &RewindRecord {
        self.ops()
            .rewind
            .as_ref()
            .unwrap_or_else(|| panic!("a rewind"))
    }

    fn rewind_asked(&self, id: &str, dry_run: bool, sends_at: i32) -> Host {
        self.with(PresenterInput::RewindRequested(RewindRequested {
            request_id: id.into(),
            command_id: format!("c-{id}"),
            message_id: "send-2".into(),
            dry_run,
            sends_at,
            turns_at: 0,
        }))
    }

    fn tree(&self) -> Value {
        project_tree(&self.0.conversation, &self.0.transcript, THREAD)
    }
}

fn replayed(scenario: &str) -> Host {
    inputs(scenario, false)
        .iter()
        .fold(Host::default(), |state, input| state.with(input.clone()))
}

fn same(a: &Host, b: &Host) -> bool {
    Arc::ptr_eq(a.transcript(), b.transcript())
}

fn ok(id: &str) -> AgentEvent {
    lines::control_ok(id, None)
}

fn ok_with(id: &str, body: &str) -> AgentEvent {
    lines::control_ok(id, Some(body))
}

fn result_with_usage(model_usage: &str) -> AgentEvent {
    ResultLine {
        model_usage,
        ..ResultLine::default()
    }
    .event()
}

#[test]
fn capture_07_set_model_is_applied_the_refused_mode_is_rejected_with_its_sentence_and_the_switches_stay_in_order()
 {
    let state = replayed("07-set-model-and-mode");
    let switches = &state.ops().switches;
    assert_eq!(10, switches.len());
    assert_eq!(
        (1..=10).collect::<Vec<i32>>(),
        switches.iter().map(|it| it.seq).collect::<Vec<_>>()
    );
    let refused: Vec<_> = switches
        .iter()
        .filter(|it| it.outcome == SwitchOutcome::Rejected)
        .collect();
    assert_eq!(1, refused.len());
    let refused = refused[0];
    assert_eq!(SwitchKind::Mode, refused.kind);
    assert_eq!("bypassPermissions", refused.value);
    assert_eq!("07-set-model-and-mode-req-8", refused.id);
    assert_eq!(
        Some(
            "Cannot set permission mode to bypassPermissions because it is disabled by settings or configuration"
        ),
        refused.detail.as_deref()
    );
    assert!(
        switches
            .iter()
            .filter(|it| it.id != refused.id)
            .all(|it| it.outcome == SwitchOutcome::Applied && it.detail.is_none())
    );
}

#[test]
fn an_answer_that_comes_before_its_request_is_known_changes_nothing_and_the_request_then_stays_pending()
 {
    let before = Host::default();
    let early = before.event(ok("r1"));
    assert!(same(&before, &early), "an id nobody asked with");
    let asked = early.request("r1", ControlKind::Model, Some("opus"));
    assert_eq!(SwitchOutcome::Pending, asked.ops().switches[0].outcome);
    assert_eq!(1, asked.ops().switches.len());
    assert_eq!(
        SwitchOutcome::Applied,
        asked.event(ok("r1")).ops().switches[0].outcome
    );
}

#[test]
fn an_answer_is_taken_once_and_a_send_that_failed_is_failed() {
    let applied = Host::default()
        .request("r1", ControlKind::Mode, Some("plan"))
        .event(ok_with("r1", r#"{"mode":"plan"}"#));
    let again = applied.event(lines::control_error("r1", "late"));
    assert!(
        same(&applied, &again),
        "a settled switch is not answered twice"
    );
    let failed = Host::default()
        .request("r2", ControlKind::Model, Some("opus"))
        .with(PresenterInput::ControlSendFailed("r2".into()));
    assert_eq!(1, failed.ops().switches.len());
    assert_eq!(SwitchOutcome::Failed, failed.ops().switches[0].outcome);
    let afterwards = failed.event(ok("r2"));
    assert!(
        same(&failed, &afterwards),
        "an answer after a failed send is not an applied switch"
    );
    let unknown = failed.with(PresenterInput::ControlSendFailed("nobody".into()));
    assert!(same(&failed, &unknown));
}

#[test]
fn a_refusal_without_a_sentence_says_so_and_a_long_one_is_cut() {
    let bare = Host::default()
        .request("r1", ControlKind::Mode, Some("plan"))
        .event(AgentEvent::ControlResponse {
            response: RawJson("{}".into()),
            request_id: Some("r1".into()),
            subtype: Some("error".into()),
            error: None,
        });
    assert_eq!(
        Some("The request was refused."),
        bare.ops().switches[0].detail.as_deref()
    );
    let long = Host::default()
        .request("r1", ControlKind::Mode, Some("plan"))
        .event(lines::control_error("r1", &"x".repeat(2000)));
    assert_eq!(
        MAX_DETAIL,
        utf16_len(
            long.ops().switches[0]
                .detail
                .as_deref()
                .unwrap_or_else(|| panic!("a detail"))
        )
    );
}

#[test]
fn the_21st_switch_pushes_the_oldest_out_and_its_answer_is_then_an_answer_nobody_asked_for() {
    let mut state = Host::default();
    for n in 1..=MAX_SWITCHES + 1 {
        state = state.request(&format!("r{n}"), ControlKind::Model, Some(&format!("m{n}")));
    }
    let kept = &state.ops().switches;
    assert_eq!(MAX_SWITCHES, kept.len());
    assert_eq!("r2", kept[0].id);
    assert_eq!(
        (2..=i32::try_from(MAX_SWITCHES).unwrap_or(i32::MAX) + 1).collect::<Vec<_>>(),
        kept.iter().map(|it| it.seq).collect::<Vec<_>>()
    );
    let answered = state.event(ok("r1"));
    assert!(
        same(&state, &answered),
        "the pushed-out request's answer is dropped"
    );
    assert_eq!(
        SwitchOutcome::Applied,
        state.event(ok("r2")).ops().switches[0].outcome
    );
}

#[test]
fn capture_06_the_answer_to_the_usage_request_is_the_context_and_a_request_with_no_answer_is_not_shown()
 {
    let state = replayed("06-context-usage");
    assert_eq!(
        Some(&ContextRecord {
            total_tokens: 16575,
            max_tokens: 200_000,
            percentage: 8.0,
            auto_compact_threshold: Some(167_000),
        }),
        state.ops().context.as_ref()
    );
    assert!(
        state.ops().waiting.is_empty(),
        "answered, so no longer waited for"
    );
    assert!(
        state.ops().switches.is_empty(),
        "a usage request is not a switch"
    );
}

#[test]
fn an_answer_to_the_usage_request_while_a_turn_is_open_sets_the_threads_context_before_the_turn_ends()
 {
    // 01's host once its turn has opened and no result has come: the CLI answers in the middle of
    // the turn.
    let open = |state: &Host| {
        state
            .0
            .conversation
            .turns
            .iter()
            .any(|it| it.phase == TurnPhase::Open)
    };
    let mut state = Host::default();
    for input in inputs("01-baseline-text", false) {
        state = state.with(input);
        if open(&state) {
            break;
        }
    }
    assert!(open(&state), "a turn is open");
    let thread = |host: &Host| at(&host.tree(), &["threads", "byId", THREAD]).clone();
    assert_eq!(None, thread(&state).get("context"));
    let answered = state
        .request("u1", ControlKind::Context, None)
        .event(ok_with(
            "u1",
            r#"{"totalTokens":16575,"maxTokens":200000,"percentage":8}"#,
        ));
    // The turn is still open, and the tree is running, as it was; only the context is new.
    assert!(open(&answered), "the turn is still open");
    let after = thread(&answered);
    assert_eq!(Some(&Value::Bool(true)), after.get("isRunning"));
    let context = after
        .get("context")
        .and_then(Value::as_object)
        .unwrap_or_else(|| panic!("a context"));
    assert_eq!(Some(&json!(16575)), context.get("totalTokens"));
    assert_eq!(Some(&json!(200_000)), context.get("maxTokens"));
    assert_eq!(Some(&json!(8)), context.get("percentage"));
}

#[test]
fn an_error_answer_or_an_unreadable_body_leaves_the_context_as_it_was_and_ends_the_wait() {
    let answered = replayed("06-context-usage");
    let again = answered.request("u9", ControlKind::Context, None);
    assert_eq!(
        vec!["u9".to_owned()],
        again.ops().waiting.iter().cloned().collect::<Vec<_>>()
    );
    let refused = again.event(lines::control_error("u9", "no"));
    assert_eq!(answered.ops().context, refused.ops().context);
    assert!(refused.ops().waiting.is_empty());
    let odd = answered
        .request("u10", ControlKind::Context, None)
        .event(ok_with("u10", r#"{"totalTokens":"x"}"#));
    assert_eq!(answered.ops().context, odd.ops().context);
    assert!(odd.ops().waiting.is_empty());
}

#[test]
fn six_usage_requests_with_no_answer_keep_the_newest_five_and_the_oldest_ones_answer_is_dropped() {
    let mut state = Host::default();
    for n in 1..=MAX_WAITING + 1 {
        state = state.request(&format!("u{n}"), ControlKind::Context, None);
    }
    let names = |range: std::ops::RangeInclusive<usize>| -> Vec<String> {
        range.map(|it| format!("u{it}")).collect()
    };
    assert_eq!(
        names(2..=MAX_WAITING + 1),
        state.ops().waiting.iter().cloned().collect::<Vec<_>>()
    );
    let body = r#"{"totalTokens":5,"maxTokens":10,"percentage":50}"#;
    let late = state.event(ok_with("u1", body));
    assert!(same(&state, &late));
    let kept = state.event(ok_with("u2", body));
    assert_eq!(
        Some(&ContextRecord {
            total_tokens: 5,
            max_tokens: 10,
            percentage: 50.0,
            auto_compact_threshold: None,
        }),
        kept.ops().context.as_ref()
    );
    assert_eq!(
        names(3..=MAX_WAITING + 1),
        kept.ops().waiting.iter().cloned().collect::<Vec<_>>()
    );
}

#[test]
fn a_failed_send_of_a_usage_request_is_no_longer_waited_for() {
    let state = Host::default()
        .request("u1", ControlKind::Context, None)
        .with(PresenterInput::ControlSendFailed("u1".into()));
    assert!(state.ops().waiting.is_empty());
}

#[test]
fn capture_10_the_tokens_are_the_last_results_totals_over_the_models_not_a_sum_of_results() {
    let mut totals: Vec<TokenTotals> = Vec::new();
    let mut state = Host::default();
    for input in inputs("10-background-task", false) {
        let is_result = matches!(input, PresenterInput::Event(AgentEvent::Result { .. }));
        state = state.with(input);
        if is_result {
            totals.push(
                state
                    .ops()
                    .tokens
                    .unwrap_or_else(|| panic!("tokens after a result")),
            );
        }
    }
    assert_eq!(3, totals.len());
    // 20 + 511, 20 + 743 and 20 + 1089 output tokens: each result replaces the one before.
    assert_eq!(
        vec![531, 763, 1109],
        totals.iter().map(|it| it.output).collect::<Vec<_>>()
    );
    assert_eq!(
        vec![917, 921, 928],
        totals.iter().map(|it| it.input).collect::<Vec<_>>()
    );
    assert_eq!(
        vec![32399, 64213, 110_310],
        totals.iter().map(|it| it.cache_read).collect::<Vec<_>>()
    );
    assert_eq!(
        vec![19495, 21228, 22372],
        totals
            .iter()
            .map(|it| it.cache_creation)
            .collect::<Vec<_>>()
    );
    #[allow(clippy::float_cmp)] // the sum core keeps, to the last bit as Kotlin's
    {
        assert_eq!(
            0.156_007_250_000_000_04,
            state.0.conversation.usage.session_cost_usd
        );
    }
}

#[test]
fn a_result_that_names_no_model_says_nothing_of_the_tokens() {
    let usage = r#"{"m":{"inputTokens":3,"outputTokens":4,"cacheReadInputTokens":5,"cacheCreationInputTokens":6}}"#;
    let counted = Host::default().event(result_with_usage(usage));
    let six = TokenTotals {
        input: 3,
        output: 4,
        cache_read: 5,
        cache_creation: 6,
    };
    assert_eq!(Some(six), counted.ops().tokens);
    let bare = counted.event(lines::result(None));
    assert_eq!(counted.ops().tokens, bare.ops().tokens);
    assert!(Arc::ptr_eq(
        &counted.transcript().operations,
        &bare.transcript().operations
    ));
    let odd = counted.event(result_with_usage(r#"{"m":{"inputTokens":"x"},"n":7}"#));
    assert_eq!(
        Some(TokenTotals {
            input: 0,
            output: 0,
            cache_read: 0,
            cache_creation: 0,
        }),
        odd.ops().tokens,
        "a figure that is not a number counts as none"
    );
    assert_eq!(
        None,
        Host::default().event(lines::result(None)).ops().tokens
    );
}

#[test]
fn capture_21_the_compaction_is_kept_with_its_trigger_and_both_counts_and_compacting_follows_the_status()
 {
    let mut state = Host::default();
    let mut seen: Vec<(Option<String>, bool)> = Vec::new();
    for input in inputs("21-compact", false) {
        let status = match &input {
            PresenterInput::Event(AgentEvent::SystemStatus { status, .. }) => Some(status.clone()),
            _ => None,
        };
        state = state.with(input);
        if let Some(status) = status {
            seen.push((status, state.ops().compacting));
        }
    }
    let mut distinct: Vec<Option<&str>> = Vec::new();
    for (status, _) in &seen {
        if !distinct.contains(&status.as_deref()) {
            distinct.push(status.as_deref());
        }
    }
    assert_eq!(vec![Some("requesting"), Some("compacting"), None], distinct);
    let compacting: Vec<bool> = seen
        .iter()
        .filter(|it| it.0.as_deref() == Some("compacting"))
        .map(|it| it.1)
        .collect();
    assert_eq!(vec![true], compacting);
    assert!(
        !state.ops().compacting,
        "the status after it says it is over"
    );
    assert_eq!(
        vec![CompactionRecord {
            seq: 1,
            trigger: "manual".into(),
            pre_tokens: 20072,
            post_tokens: 1235,
        }],
        state.ops().compactions.iter().cloned().collect::<Vec<_>>()
    );
}

#[test]
fn a_status_that_only_names_the_mode_does_not_end_compacting_and_a_boundary_with_no_counts_is_no_compaction()
 {
    let compacting = Host::default().event(lines::status_only(Some("compacting")));
    assert!(compacting.ops().compacting);
    let moded = compacting.event(lines::status("plan"));
    assert!(
        same(&compacting, &moded),
        "capture 07: a mode switch is answered with status null and a mode"
    );
    assert!(!moded.event(lines::status_only(None)).ops().compacting);
    assert!(
        !moded
            .event(lines::status_only(Some("requesting")))
            .ops()
            .compacting
    );
    let no_counts = compacting.event(lines::compact_boundary(r#"{"trigger":"auto"}"#));
    assert!(same(&compacting, &no_counts));
    let no_trigger = compacting.event(lines::compact_boundary(
        r#"{"pre_tokens":9,"post_tokens":3}"#,
    ));
    assert_eq!(
        vec![CompactionRecord {
            seq: 1,
            trigger: "unknown".into(),
            pre_tokens: 9,
            post_tokens: 3,
        }],
        no_trigger
            .ops()
            .compactions
            .iter()
            .cloned()
            .collect::<Vec<_>>()
    );
}

#[test]
fn compactions_and_switches_share_one_count_of_seq_and_20_compactions_are_kept() {
    let mut state = Host::default().request("r1", ControlKind::Mode, Some("plan"));
    for n in 1..=MAX_COMPACTIONS + 1 {
        state = state.event(lines::compact_boundary(&format!(
            r#"{{"trigger":"auto","pre_tokens":{n},"post_tokens":1}}"#
        )));
    }
    assert_eq!(1, state.ops().switches.len());
    assert_eq!(1, state.ops().switches[0].seq);
    assert_eq!(MAX_COMPACTIONS, state.ops().compactions.len());
    assert_eq!(
        3,
        state.ops().compactions[0].seq,
        "the first compaction was seq 2, and it is the one pushed out"
    );
    assert_eq!(
        i32::try_from(MAX_COMPACTIONS).unwrap_or(i32::MAX) + 2,
        state.ops().seq
    );
}

#[test]
fn capture_03_the_initialize_response_gives_the_models_and_one_without_models_leaves_the_ones_it_has()
 {
    let state = replayed("03-initialize-handshake");
    let models = &state.ops().models;
    assert_eq!(8, models.len());
    let default = models
        .iter()
        .find(|it| it.value == "default")
        .unwrap_or_else(|| panic!("a default"));
    assert_eq!(
        Some("claude-opus-4-8[1m]"),
        default.resolved_model.as_deref()
    );
    assert_eq!("Default (recommended)", default.display_name);
    assert_eq!(Some(true), default.supports_effort);
    assert_eq!(
        Some(vec!["low", "medium", "high", "xhigh", "max"]),
        default
            .supported_effort_levels
            .as_deref()
            .map(|it| it.iter().map(String::as_str).collect::<Vec<_>>())
    );
    let haiku = models
        .iter()
        .find(|it| it.value == "haiku")
        .unwrap_or_else(|| panic!("a haiku"));
    assert_eq!(None, haiku.supports_effort);
    assert_eq!(None, haiku.supported_effort_levels);
    let kept = state.event(lines::initialized(
        r#"{"commands":[{"name":"x","description":"d"}]}"#,
        "init-1",
    ));
    assert_eq!(models, &kept.ops().models);
    assert!(Arc::ptr_eq(models, &kept.ops().models));
    let odd = state.event(lines::initialized(
        r#"{"models":[{"displayName":"no value"},7]}"#,
        "init-1",
    ));
    assert_eq!(
        models,
        &odd.ops().models,
        "a list with no model in it is not a list of models"
    );
}

fn launched(effort: Option<&str>) -> PresenterInput {
    PresenterInput::Launched(Launched {
        effort: effort.map(str::to_owned),
        ..Launched::default()
    })
}

#[test]
fn the_effort_the_session_was_started_with_is_kept_and_none_is_none() {
    assert_eq!(
        Some("high"),
        Host::default()
            .with(launched(Some("high")))
            .ops()
            .effort
            .as_deref()
    );
    assert_eq!(None, Host::default().with(launched(None)).ops().effort);
    assert_eq!(None, Host::default().with(launched(Some(""))).ops().effort);
}

#[test]
fn a_refused_effort_restart_is_a_record_that_is_over_with_the_sentence_a_person_reads() {
    let refused = || {
        PresenterInput::EffortRefused(EffortRefused {
            request_id: "e1".into(),
            effort: "high".into(),
        })
    };
    let state = Host::default().with(refused());
    assert_eq!(1, state.ops().switches.len());
    let record = &state.ops().switches[0];
    assert_eq!(SwitchKind::Effort, record.kind);
    assert_eq!("high", record.value);
    assert_eq!(SwitchOutcome::Rejected, record.outcome);
    assert_eq!(Some("A turn is running"), record.detail.as_deref());
    assert!(same(&state, &state.with(refused())));
}

#[test]
fn a_usage_request_made_and_one_that_fails_leave_the_tree_the_same() {
    let state = replayed("01-baseline-text");
    let before = state.tree();
    let asked = state.request("u1", ControlKind::Context, None);
    assert_eq!(before, asked.tree(), "the wait is not in the tree");
    let failed = asked.with(PresenterInput::ControlSendFailed("u1".into()));
    assert_eq!(before, failed.tree());
}

// ---- the rewind of the files ----

fn recorded(request_id: &str) -> AgentEvent {
    let answers: Vec<AgentEvent> = read_capture("25-rewind-files.ndjson")
        .into_iter()
        .filter(|it| {
            matches!(it, AgentEvent::ControlResponse { request_id: Some(id), .. } if id == request_id)
        })
        .collect();
    assert_eq!(1, answers.len(), "one answer to {request_id}");
    answers
        .into_iter()
        .next()
        .unwrap_or_else(|| panic!("an answer"))
}

#[test]
fn capture_25_the_dry_runs_answer_is_done_with_the_file_and_the_lines_and_the_real_ones_is_done_without_files()
 {
    let dry_state = Host::default()
        .rewind_asked("25-rewind-files-req-2", true, 0)
        .event(recorded("25-rewind-files-req-2"));
    let dry = dry_state.rewind();
    assert_eq!(RewindOutcome::Done, dry.outcome);
    assert_eq!(1, dry.files.len());
    assert!(dry.files[0].ends_with("/cwd/note.txt"));
    assert_eq!(1, dry.files_total);
    assert_eq!(1, dry.insertions);
    assert_eq!(1, dry.deletions);
    assert_eq!("c-25-rewind-files-req-2", dry.command_id);
    assert!(dry.dry_run);
    let real_state = Host::default()
        .rewind_asked("25-rewind-files-req-3", false, 0)
        .event(recorded("25-rewind-files-req-3"));
    let real = real_state.rewind();
    assert_eq!(RewindOutcome::Done, real.outcome);
    assert!(real.files.is_empty());
    assert_eq!(0, real.files_total);
    assert!(!real.dry_run);
}

#[test]
fn a_rewind_the_cli_cannot_do_is_refused_with_its_error_and_an_error_answer_or_a_failed_write_is_failed()
 {
    let refused = Host::default().rewind_asked("r1", true, 0).event(ok_with(
        "r1",
        &format!(r#"{{"canRewind":false,"error":"{NO_CHECKPOINT}"}}"#),
    ));
    assert_eq!(RewindOutcome::Refused, refused.rewind().outcome);
    assert_eq!(Some(NO_CHECKPOINT), refused.rewind().detail.as_deref());
    let bare = Host::default()
        .rewind_asked("r2", true, 0)
        .event(ok_with("r2", r#"{"canRewind":false}"#));
    assert_eq!(RewindOutcome::Refused, bare.rewind().outcome);
    assert_eq!(
        Some("The request was refused."),
        bare.rewind().detail.as_deref()
    );
    let errored = Host::default()
        .rewind_asked("r3", true, 0)
        .event(lines::control_error("r3", "boom"));
    assert_eq!(RewindOutcome::Failed, errored.rewind().outcome);
    assert_eq!(Some("boom"), errored.rewind().detail.as_deref());
    let unsent = Host::default()
        .rewind_asked("r4", true, 0)
        .with(PresenterInput::ControlSendFailed("r4".into()));
    assert_eq!(RewindOutcome::Failed, unsent.rewind().outcome);
    assert_eq!(Some(REWIND_SEND_FAILED), unsent.rewind().detail.as_deref());
}

#[test]
fn a_success_whose_body_cannot_be_read_is_failed_not_the_clis_refusal() {
    for answer in [
        ok("r1"),
        ok_with("r1", r#"{"canRewind":"yes"}"#),
        ok_with("r1", "[]"),
    ] {
        let state = Host::default().rewind_asked("r1", true, 0).event(answer);
        assert_eq!(RewindOutcome::Failed, state.rewind().outcome);
        assert_eq!(Some(REWIND_UNREADABLE), state.rewind().detail.as_deref());
    }
}

#[test]
fn a_rewind_the_host_did_not_send_is_a_record_that_is_over_at_once_and_an_answer_for_it_changes_nothing()
 {
    let state = Host::default().with(PresenterInput::RewindNotSent(RewindNotSent {
        command_id: "c9".into(),
        message_id: "send-2".into(),
        dry_run: false,
        reason: REWIND_CHECK_FIRST.into(),
    }));
    let record = state.rewind();
    assert_eq!(RewindOutcome::Failed, record.outcome);
    assert_eq!(Some(REWIND_CHECK_FIRST), record.detail.as_deref());
    assert_eq!("c9", record.command_id);
    assert!(same(
        &state,
        &state.event(ok_with("anything", r#"{"canRewind":true}"#))
    ));
}

#[test]
fn more_than_200_files_are_200_and_the_total_and_only_the_last_rewind_is_kept() {
    let many = (1..=201)
        .map(|it| format!(r#""/p/{it}""#))
        .collect::<Vec<_>>()
        .join(",");
    let state = Host::default().rewind_asked("r1", true, 0).event(ok_with(
        "r1",
        &format!(r#"{{"canRewind":true,"filesChanged":[{many}]}}"#),
    ));
    assert_eq!(MAX_REWIND_FILES, state.rewind().files.len());
    assert_eq!(201, state.rewind().files_total);
    let second = state.rewind_asked("r2", true, 3);
    assert_eq!(Some("r2"), second.rewind().request_id.as_deref());
    assert_eq!(RewindOutcome::Pending, second.rewind().outcome);
    assert!(second.rewind().files.is_empty());
    // The first one's answer, late, is for an id that is not the last: nothing.
    assert!(same(
        &second,
        &second.event(ok_with("r1", r#"{"canRewind":true}"#))
    ));
    // An answer is taken once.
    let done = second.event(ok_with("r2", r#"{"canRewind":true}"#));
    assert!(same(&done, &done.event(lines::control_error("r2", "late"))));
}

#[test]
fn the_trees_rewind_follows_the_record_carries_no_host_mark_and_is_absent_until_one_is_asked() {
    let rewind_of = |state: &Host| -> Option<Map<String, Value>> {
        at(&state.tree(), &["threads", "byId", THREAD])
            .get("rewind")
            .and_then(Value::as_object)
            .cloned()
    };
    let none = Host::default();
    assert_eq!(None, rewind_of(&none));
    let asked = none.rewind_asked("r1", true, 7);
    let pending = rewind_of(&asked).unwrap_or_else(|| panic!("a rewind"));
    let mut keys: Vec<&str> = pending.keys().map(String::as_str).collect();
    keys.sort_unstable();
    let mut expected = vec![
        "commandId",
        "messageId",
        "dryRun",
        "outcome",
        "files",
        "filesTotal",
        "insertions",
        "deletions",
    ];
    expected.sort_unstable();
    assert_eq!(expected, keys);
    assert_eq!(Some(&json!("pending")), pending.get("outcome"));
    let body = r#"{"canRewind":true,"filesChanged":["/a"],"insertions":2,"deletions":3}"#;
    let done = asked.event(ok_with("r1", body));
    let node = rewind_of(&done).unwrap_or_else(|| panic!("a rewind"));
    assert_eq!(Some(&json!("done")), node.get("outcome"));
    assert_eq!(Some(&json!(2)), node.get("insertions"));
    assert_eq!(Some(&json!(1)), node.get("filesTotal"));
}

// The permission mode an `initialize` answer names, on a synthetic answer: every capture has
// default or acceptEdits, so the edges are read here.
fn mode_answer(mode: &str, subtype: &str) -> AgentEvent {
    AgentEvent::ControlResponse {
        response: RawJson(format!(
            r#"{{"response":{{"current_permission_mode":{mode}}}}}"#
        )),
        request_id: Some("r1".into()),
        subtype: Some(subtype.into()),
        error: None,
    }
}

fn start_mode(state: &Host, event: AgentEvent) -> Option<String> {
    state.event(event).ops().start_permission_mode.clone()
}

#[test]
fn the_start_mode_is_read_from_an_initialize_answer_and_not_from_a_bad_one() {
    let fresh = Host::default();
    assert_eq!(
        Some("plan".to_owned()),
        start_mode(&fresh, mode_answer(r#""plan""#, "success"))
    );
    let no_key = AgentEvent::ControlResponse {
        response: RawJson(r#"{"response":{"commands":[]}}"#.into()),
        request_id: Some("r1".into()),
        subtype: Some("success".into()),
        error: None,
    };
    assert_eq!(None, start_mode(&fresh, no_key), "no key");
    assert_eq!(
        None,
        start_mode(&fresh, mode_answer(r#""""#, "success")),
        "an empty word is no mode"
    );
    assert_eq!(
        None,
        start_mode(&fresh, mode_answer("5", "success")),
        "not a string"
    );
    assert_eq!(
        None,
        start_mode(&fresh, mode_answer(r#""plan""#, "error")),
        "an error answer says nothing"
    );
}

#[test]
fn an_answer_with_no_mode_leaves_the_one_the_transcript_has_and_a_new_one_replaces_it() {
    let planned = Host::default().event(mode_answer(r#""plan""#, "success"));
    let without = planned.event(mode_answer(r#""""#, "success"));
    assert_eq!(Some("plan"), without.ops().start_permission_mode.as_deref());
    assert!(
        same(
            &planned,
            &planned.event(mode_answer(r#""plan""#, "success"))
        ),
        "the same word changes nothing"
    );
    assert_eq!(
        Some("auto".to_owned()),
        start_mode(&planned, mode_answer(r#""auto""#, "success"))
    );
}
