//! `/clear` in capture 41: a turn, `/clear` (a `conversation_reset`, then an init under a new
//! session id), and a turn of the new conversation. The thread keeps what came before, above a
//! divider, and offers no rewind or fork before it (ClearResetTest.kt).

use std::sync::Arc;

use closta_goldens::common::{non_blank_lines, parse, text_of};
use closta_goldens::replay::{Step, inputs, replay_with};
use closta_goldens::synthetic::stream_script::{self, StreamScript};
use closta_model::AgentEvent;
use closta_presenter::input::{PresenterInput, SendId, UserSent};
use closta_presenter::keyed::of_cli_id;
use closta_presenter::rewind_targets::{
    ForkFrom, RewindConversation, RewindRefusal, ask_actions, turn_end_actions,
};
use closta_presenter::rows::{AskRow, Divider, DividerRow, ThreadRow, ThreadRows};
use closta_presenter::session::{SessionView, afresh_after_clear, resume_id_of, sent_after_clear};
use closta_presenter::transcript::{MessageSource, PartRecord, Role, Transcript};

const SCENARIO: &str = "41-clear-reset";
const FIRST_SESSION: &str = "a6635625-53e9-40b5-adfb-977a4e9163b2";
const SECOND_SESSION: &str = "b3c1b6ae-517a-4b6a-8b61-f3693facb4f1";
const THIRD_SESSION: &str = "session-after-the-second-clear";
const HOST_ID: &str = "host-id";
/// The `/clear` command's uuid: its lifecycle, 41 lines 16, 17 and 22.
const CLEAR_UUID: &str = "84d712ce-9cd0-4cec-b51e-4dfe8cf10d9a";
/// The third message's uuid: its lifecycle and its result, 41 lines 23 and 96.
const THIRD_UUID: &str = "b3d716bb-9d47-4504-b06a-b4ac287cb1ba";
/// The reset's `new_conversation_id`, 41 line 18.
const NEW_CONVERSATION: &str = "c0817532-7496-4d9c-8870-b9c088a63253";
const CLEAR_AGAIN: &str = "clear-again";
const ASK_AGAIN: &str = "ask-again";
/// The `/clear` from the first turn's completed lifecycle to its own completed one: 41's
/// non-blank lines 15 to 22.
const CLEAR_FROM: usize = 15;
const CLEAR_TO: usize = 22;

fn steps() -> Vec<Step> {
    replay_with(SCENARIO, true)
}

fn last(steps: &[Step]) -> &SessionView {
    &steps.last().unwrap_or_else(|| panic!("41 has steps")).view
}

fn transcript() -> Arc<Transcript> {
    Arc::clone(&last(&steps()).transcript)
}

fn fold(inputs: &[PresenterInput]) -> SessionView {
    inputs
        .iter()
        .fold(SessionView::default(), SessionView::fold)
}

fn dividers(rows: &[ThreadRow]) -> Vec<(usize, Arc<DividerRow>)> {
    rows.iter()
        .enumerate()
        .filter_map(|(at, row)| match row {
            ThreadRow::Divider(it) => Some((at, Arc::clone(it))),
            _ => None,
        })
        .collect()
}

fn ask_at(rows: &[ThreadRow], key: &str) -> usize {
    rows.iter()
        .position(|row| matches!(row, ThreadRow::Ask(ask) if ask.key == key))
        .unwrap_or_else(|| panic!("no ask {key}"))
}

fn text_at(rows: &[ThreadRow], markdown: &str) -> usize {
    rows.iter()
        .position(|row| matches!(row, ThreadRow::Text(text) if text.markdown == markdown))
        .unwrap_or_else(|| panic!("no text {markdown}"))
}

fn asks(rows: &[ThreadRow]) -> Vec<(usize, Arc<AskRow>)> {
    rows.iter()
        .enumerate()
        .filter_map(|(at, row)| match row {
            ThreadRow::Ask(it) => Some((at, Arc::clone(it))),
            _ => None,
        })
        .collect()
}

fn events(lines: &[String]) -> Vec<PresenterInput> {
    lines
        .iter()
        .map(|line| PresenterInput::Event(parse(line)))
        .collect()
}

fn sent(id: &str, text: &str, uuid: &str) -> PresenterInput {
    PresenterInput::UserSent(UserSent {
        message_id: SendId::new(id).unwrap_or_else(|| panic!("{id} is a key")),
        text: text.to_owned(),
        attachments: Vec::new(),
        uuid: Some(uuid.to_owned()),
    })
}

fn capture_lines() -> Vec<String> {
    non_blank_lines(&text_of(&format!("{SCENARIO}.ndjson")))
}

/// Lines 15 to 22 of 41 (the `/clear` from its queued lifecycle to its completed one), under
/// fresh uuids, as the second conversation's: its lines say the second session's id until the
/// init after the reset says a third.
fn clear_again() -> Vec<PresenterInput> {
    let lines: Vec<String> = capture_lines()[CLEAR_FROM - 1..CLEAR_TO]
        .iter()
        .map(|it| {
            it.replace(CLEAR_UUID, CLEAR_AGAIN)
                .replace(NEW_CONVERSATION, "conversation-again")
                .replace(SECOND_SESSION, THIRD_SESSION)
                .replace(FIRST_SESSION, SECOND_SESSION)
        })
        .collect();
    let mut inputs = vec![sent("send-4", "/clear", CLEAR_AGAIN)];
    inputs.extend(events(&lines));
    inputs
}

/// One more exchange: its result is 41's last, naming this message instead.
fn ask_again() -> Vec<PresenterInput> {
    let results: Vec<String> = capture_lines()
        .into_iter()
        .filter(|it| it.contains("\"type\":\"result\"") && it.contains(THIRD_UUID))
        .collect();
    assert_eq!(1, results.len(), "41 has one result for the third message");
    let result = results[0]
        .replace(THIRD_UUID, ASK_AGAIN)
        .replace(SECOND_SESSION, THIRD_SESSION);
    let mut script = StreamScript::new(THIRD_SESSION);
    script.lifecycle(ASK_AGAIN, "queued");
    script.lifecycle(ASK_AGAIN, "started");
    script.assistant("msg-again", vec![stream_script::text("again")], None);
    let mut done = StreamScript::new(THIRD_SESSION);
    done.lifecycle(ASK_AGAIN, "completed");
    let mut lines = script.lines();
    lines.push(result);
    lines.extend(done.lines());
    let mut inputs = vec![sent("send-5", "Once more", ASK_AGAIN)];
    inputs.extend(events(&lines));
    inputs
}

/// The thread is divided once, the first exchange above and the third below.
#[test]
fn capture_41_the_thread_is_divided_once_the_first_exchange_above_and_the_third_below() {
    let rows = ThreadRows::default().of(&transcript());
    let dividers = dividers(&rows);
    assert_eq!(1, dividers.len(), "{rows:?}");
    let (at, divider) = &dividers[0];
    // 41 line 18: the reset's timestamp.
    assert_eq!(
        Divider::Cleared {
            at: Some("2026-11-14T12:26:36.305Z".to_owned())
        },
        divider.divider
    );
    assert!(ask_at(&rows, "send-1") < *at, "the first ask stays above");
    assert!(text_at(&rows, "pong") < *at, "and its answer");
    assert!(ask_at(&rows, "send-3") > *at, "the third ask is below");
    assert!(text_at(&rows, "unknown") > *at, "and its answer");
}

/// The divider sits in the message of the clear's turn, which is where the last clear is.
#[test]
fn capture_41_the_divider_sits_in_the_message_of_the_clears_turn_which_is_where_the_last_clear_is()
{
    let transcript = transcript();
    let holders: Vec<&str> = transcript
        .messages
        .values()
        .filter(|message| {
            message
                .parts
                .values()
                .any(|part| matches!(part.as_ref(), PartRecord::Cleared(_)))
        })
        .map(|message| message.key.as_str())
        .collect();
    assert_eq!(vec![CLEAR_UUID], holders);
    assert_eq!(
        transcript.messages.order().position(|it| it == CLEAR_UUID),
        transcript.cleared_at
    );
}

/// An ask before the divider offers no rewind and no fork.
#[test]
fn capture_41_an_ask_before_the_divider_offers_no_rewind_and_no_fork() {
    let transcript = transcript();
    for ask in ["send-1", "send-2"] {
        let actions = ask_actions(&transcript, false, ask);
        assert_eq!(Some(RewindRefusal::BeforeClear), actions.refusal, "{ask}");
        assert_eq!(None, actions.rewind, "{ask}");
        assert_eq!(None, actions.rewind_files, "{ask}");
        assert_eq!(None, actions.fork, "{ask}");
        assert_eq!(
            Some(RewindRefusal::BeforeClear),
            turn_end_actions(&transcript, false, ask).refusal,
            "{ask}"
        );
    }
}

/// An ask before the divider offers nothing while a reply runs either, for the clear.
#[test]
fn capture_41_an_ask_before_the_divider_offers_nothing_while_a_reply_runs_either_for_the_clear() {
    let transcript = transcript();
    for ask in ["send-1", "send-2"] {
        assert_eq!(
            Some(RewindRefusal::BeforeClear),
            ask_actions(&transcript, true, ask).refusal,
            "{ask}"
        );
        assert_eq!(
            Some(RewindRefusal::BeforeClear),
            turn_end_actions(&transcript, true, ask).refusal,
            "{ask}"
        );
    }
    assert_eq!(
        Some(RewindRefusal::Running),
        ask_actions(&transcript, true, "send-3").refusal
    );
}

/// The ask after the divider follows the usual rules, as the first of its conversation.
#[test]
fn capture_41_the_ask_after_the_divider_follows_the_usual_rules_as_the_first_of_its_conversation() {
    let transcript = transcript();
    let actions = ask_actions(&transcript, false, "send-3");
    assert_eq!(
        Some(RewindConversation {
            rewind_before: None
        }),
        actions.rewind,
        "the new record's first line keeps nothing"
    );
    assert_eq!(
        Some(ForkFrom {
            rewind_before: None
        }),
        actions.fork
    );
    assert_eq!(
        Some(RewindRefusal::NothingAfter),
        turn_end_actions(&transcript, false, "send-3").refusal
    );
}

/// No turn end before the divider offers its rewind.
#[test]
fn capture_41_no_turn_end_before_the_divider_offers_its_rewind() {
    let rows = ThreadRows::default().of(&transcript());
    let ends: Vec<_> = rows
        .iter()
        .filter_map(|row| match row {
            ThreadRow::TurnEnd(it) => Some(Arc::clone(it)),
            _ => None,
        })
        .collect();
    // Before: there are turn ends to look at, one of them before the divider.
    let divider = dividers(&rows)[0].0;
    assert!(
        rows[..divider]
            .iter()
            .any(|row| matches!(row, ThreadRow::TurnEnd(_))),
        "{rows:?}"
    );
    assert!(ends.iter().all(|it| !it.followed), "{ends:?}");
}

/// The session id is the second init's after the fold.
#[test]
fn capture_41_the_session_id_is_the_second_inits_after_the_fold() {
    let steps = steps();
    assert_eq!(
        Some(SECOND_SESSION),
        last(&steps)
            .conversation
            .session
            .as_ref()
            .map(|it| it.session_id.as_str())
    );
}

/// Between the reset and the next init the old id is gone, and the host's is used.
#[test]
fn capture_41_between_the_reset_and_the_next_init_the_old_id_is_gone_and_the_hosts_is_used() {
    let steps = steps();
    let reset = steps
        .iter()
        .position(|step| {
            matches!(
                step.input,
                PresenterInput::Event(AgentEvent::ConversationReset { .. })
            )
        })
        .unwrap_or_else(|| panic!("41 has a reset"));
    let init = steps
        .iter()
        .enumerate()
        .skip(reset + 1)
        .find(|(_, step)| {
            matches!(
                step.input,
                PresenterInput::Event(AgentEvent::SystemInit { .. })
            )
        })
        .map(|(_, step)| &step.view)
        .unwrap_or_else(|| panic!("41 has an init after the reset"));
    let before = &steps[reset - 1].view;
    let cleared = &steps[reset].view;

    assert_eq!(
        Some(FIRST_SESSION),
        before
            .conversation
            .session
            .as_ref()
            .map(|it| it.session_id.as_str())
    );
    assert_eq!(HOST_ID, resume_id_of(before, HOST_ID), "no clear yet");
    assert_eq!(
        None, cleared.conversation.session,
        "the reset forgets the old session"
    );
    assert_eq!(HOST_ID, resume_id_of(cleared, HOST_ID));
    assert_eq!(
        Some(SECOND_SESSION),
        init.conversation
            .session
            .as_ref()
            .map(|it| it.session_id.as_str())
    );
    assert_eq!(SECOND_SESSION, resume_id_of(init, HOST_ID));
}

/// Not ported from Kotlin (resumeIdOf in SessionView.kt, fed67ce): the CLI's id is the one to
/// resume only once the conversation was cleared; otherwise the host's, whatever the CLI says.
#[test]
fn resume_id_of_is_the_clis_id_only_after_a_clear() {
    let steps = steps();
    let last = last(&steps);
    assert!(last.transcript.cleared_at.is_some(), "41 is cleared");
    assert!(last.conversation.session.is_some(), "and its init came");
    let cleared_without_session = SessionView {
        conversation: closta_model::ConversationState {
            session: None,
            ..last.conversation.clone()
        },
        transcript: Arc::clone(&last.transcript),
    };
    let session_without_clear = SessionView {
        conversation: last.conversation.clone(),
        transcript: Arc::new(Transcript {
            cleared_at: None,
            ..(*last.transcript).clone()
        }),
    };

    assert_eq!(SECOND_SESSION, resume_id_of(last, HOST_ID));
    assert_eq!(HOST_ID, resume_id_of(&cleared_without_session, HOST_ID));
    assert_eq!(HOST_ID, resume_id_of(&session_without_clear, HOST_ID));
}

/// F1 of the 6d-R2 final fixes, after ClearedTabs.kt's sentAfterClear and clearedTabOf (022513f):
/// a restart starts a new conversation under the CLI's id only from the init after the reset
/// (41 line 20) until a message is sent after the divider (the third, queued at 41 line 23).
/// Before the clear, and between the reset and that init, there is no such id.
#[test]
fn a_new_conversation_is_offered_only_from_the_init_after_a_clear_until_a_request_after_it() {
    let steps = steps();
    let sends: Vec<usize> = steps
        .iter()
        .enumerate()
        .filter(|(_, step)| matches!(step.input, PresenterInput::UserSent(_)))
        .map(|(at, _)| at)
        .collect();
    assert_eq!(3, sends.len(), "41 sends three messages");
    let third = sends[2];
    let named = steps
        .iter()
        .position(|step| {
            step.view
                .conversation
                .session
                .as_ref()
                .is_some_and(|it| it.session_id == SECOND_SESSION)
        })
        .unwrap_or_else(|| panic!("41's init after the reset names the second session"));
    assert!(
        steps[named - 1].view.transcript.cleared_at.is_some(),
        "the reset comes before the init that names the new id"
    );
    assert!(sends[1] < named && named < third, "{sends:?} {named}");

    for (at, step) in steps.iter().enumerate() {
        let view = &step.view;
        let expected = (named..third).contains(&at).then_some(SECOND_SESSION);
        assert_eq!(expected, afresh_after_clear(view), "step {at}");
        assert_eq!(at >= third, sent_after_clear(&view.transcript), "step {at}");
    }
}

/// A reset that says no trigger still divides the thread.
#[test]
fn capture_41_a_reset_that_says_no_trigger_still_divides_the_thread() {
    let mut changed = 0;
    let inputs: Vec<PresenterInput> = inputs(SCENARIO, true)
        .into_iter()
        .map(|input| match input {
            PresenterInput::Event(AgentEvent::ConversationReset {
                uuid,
                session_id,
                new_conversation_id,
                timestamp,
                ..
            }) => {
                changed += 1;
                PresenterInput::Event(AgentEvent::ConversationReset {
                    uuid,
                    session_id,
                    new_conversation_id,
                    trigger: None,
                    user_message_uuid: None,
                    timestamp,
                })
            }
            other => other,
        })
        .collect();
    assert_eq!(1, changed, "41 has one reset");
    let rows = ThreadRows::default().of(&fold(&inputs).transcript);
    assert_eq!(1, dividers(&rows).len(), "{rows:?}");
}

/// Two clears make two dividers and only the ask after the last can rewind.
#[test]
fn capture_41_two_clears_make_two_dividers_and_only_the_ask_after_the_last_can_rewind() {
    // 41, then its /clear once more under another uuid, then one more exchange.
    let mut all = inputs(SCENARIO, true);
    all.extend(clear_again());
    all.extend(ask_again());
    let state = fold(&all);
    let rows = ThreadRows::default().of(&state.transcript);
    let dividers = dividers(&rows);
    assert_eq!(2, dividers.len(), "{rows:?}");
    let last = dividers[1].0;
    let asks = asks(&rows);
    assert_eq!(5, asks.len(), "{rows:?}");
    for (at, ask) in asks {
        let actions = ask_actions(&state.transcript, false, &ask.key);
        if at < last {
            assert_eq!(
                Some(RewindRefusal::BeforeClear),
                actions.refusal,
                "{}",
                ask.key
            );
        } else {
            assert!(actions.rewind.is_some(), "{}", ask.key);
        }
    }
    assert!(
        ask_actions(&state.transcript, false, "send-5")
            .rewind
            .is_some()
    );
    assert_eq!(
        THIRD_SESSION,
        resume_id_of(&state, HOST_ID),
        "the id follows the second"
    );
}

/// Not ported from Kotlin (the design's Review Focus 1): a reset while no turn receives content,
/// as when leaving a plan clears the context, divides in a message of its own named for its uuid.
#[test]
fn a_reset_with_no_turn_open_divides_in_a_message_of_its_own() {
    let line = r#"{"type":"conversation_reset","new_conversation_id":"conversation-new","uuid":"reset-line","session_id":"session-1"}"#;
    let event = parse(line);
    assert!(
        matches!(&event, AgentEvent::ConversationReset { trigger: None, .. }),
        "the line reads as a reset with no trigger: {event:?}"
    );
    let view = fold(&[PresenterInput::Event(event)]);
    let transcript = &view.transcript;
    let key = of_cli_id("reset-line");
    assert_eq!(
        vec![key.as_str()],
        transcript.messages.order().collect::<Vec<_>>()
    );
    let message = transcript
        .messages
        .get(&key)
        .unwrap_or_else(|| panic!("no message {key}"));
    assert_eq!(Role::Assistant, message.role);
    assert_eq!(MessageSource::Nested, message.source);
    assert_eq!(vec!["cleared"], message.parts.order().collect::<Vec<_>>());
    assert!(matches!(
        message.parts.get("cleared").map(AsRef::as_ref),
        Some(PartRecord::Cleared(_))
    ));
    assert_eq!(Some(0), transcript.cleared_at);
}
