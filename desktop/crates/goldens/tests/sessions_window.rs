//! The sessions window's rows, selection, answer delay and detail (SessionsWindowTest.kt).

use std::collections::HashSet;
use std::sync::Arc;

use closta_goldens::replay::{Step, replay};
use closta_model::ConversationState;
use closta_presenter::keyed::Keyed;
use closta_presenter::sessions::detail::{
    SessionDetail, last_reply_text, reply_head, session_detail,
};
use closta_presenter::sessions::groups::SessionGroup;
use closta_presenter::sessions::window::{
    ANSWER_DELAY_MS, GroupSince, ShownAsk, WindowGroup, WindowRow, accepts_answer,
    group_since_after, kept_selection, next_waiting, shown_after, window_group_of, window_rows,
};
use closta_presenter::transcript::{MessageRecord, PartRecord, Role, TextRecord, Transcript};

/// 2026-11-05T00:00:00Z in milliseconds since the epoch.
const T0: i64 = 1_793_836_800_000;

fn at(ms: i64) -> i64 {
    T0 + ms
}

fn shown(session: &str, request: Option<&str>) -> ShownAsk {
    ShownAsk {
        session_id: session.to_owned(),
        request_id: request.map(str::to_owned),
        since_ms: T0,
    }
}

fn waiting(ids: &[&str]) -> HashSet<String> {
    ids.iter().map(|it| (*it).to_owned()).collect()
}

fn ids(ids: &[&str]) -> Vec<String> {
    ids.iter().map(|it| (*it).to_owned()).collect()
}

#[derive(Clone, PartialEq, Debug)]
struct Row {
    id: &'static str,
    group: SessionGroup,
    unread: bool,
}

fn row(id: &'static str, group: SessionGroup, unread: bool) -> Row {
    Row { id, group, unread }
}

#[test]
fn window_rows_group_and_put_the_unread_first_in_finished() {
    let a = row("a", SessionGroup::Other, false);
    let b = row("b", SessionGroup::Unread, true);
    let c = row("c", SessionGroup::Waiting, false);
    let d = row("d", SessionGroup::Running, false);
    let e = row("e", SessionGroup::Other, false);
    let rows = window_rows(
        &[a.clone(), b.clone(), c.clone(), d.clone(), e.clone()],
        |it| window_group_of(it.group),
        |it| it.unread,
    );
    assert_eq!(
        vec![
            WindowRow::Header {
                group: WindowGroup::Waiting,
                count: 1,
            },
            WindowRow::Item(c),
            WindowRow::Header {
                group: WindowGroup::Running,
                count: 1,
            },
            WindowRow::Item(d),
            WindowRow::Header {
                group: WindowGroup::Finished,
                count: 3,
            },
            WindowRow::Item(b),
            WindowRow::Item(a),
            WindowRow::Item(e),
        ],
        rows
    );
}

#[test]
fn empty_groups_have_no_heading() {
    let rows = window_rows(&["x"], |_| WindowGroup::Running, |_| false);
    assert_eq!(
        vec![
            WindowRow::Header {
                group: WindowGroup::Running,
                count: 1,
            },
            WindowRow::Item("x"),
        ],
        rows
    );
    assert!(window_rows::<&str>(&[], |_| WindowGroup::Running, |_| false).is_empty());
}

#[test]
fn the_selection_stays_on_the_session_when_rows_reorder() {
    assert_eq!(
        Some("s1".to_owned()),
        kept_selection(Some("s1"), &ids(&["s2", "s1"]))
    );
}

#[test]
fn the_selection_clears_when_the_session_goes() {
    assert_eq!(None, kept_selection(Some("s1"), &ids(&["s2", "s3"])));
}

#[test]
fn next_waiting_wraps_and_starts_at_the_first() {
    assert_eq!(
        Some("a".to_owned()),
        next_waiting(Some("b"), &ids(&["a", "b"]))
    );
    assert_eq!(
        Some("b".to_owned()),
        next_waiting(Some("a"), &ids(&["a", "b"]))
    );
    assert_eq!(
        Some("a".to_owned()),
        next_waiting(Some("x"), &ids(&["a", "b"]))
    );
    assert_eq!(None, next_waiting(None, &[]));
}

#[test]
fn an_answer_waits_for_the_delay() {
    let ask = shown("s1", Some("r1"));
    assert!(!accepts_answer(
        Some(&ask),
        "r1",
        &waiting(&["r1"]),
        at(ANSWER_DELAY_MS - 1)
    ));
    assert!(accepts_answer(
        Some(&ask),
        "r1",
        &waiting(&["r1"]),
        at(ANSWER_DELAY_MS)
    ));
}

#[test]
fn another_request_restarts_the_delay() {
    let next = shown_after(Some(&shown("s1", Some("r1"))), "s1", Some("r2"), at(600));
    assert_eq!(at(600), next.since_ms);
    assert!(!accepts_answer(
        Some(&next),
        "r2",
        &waiting(&["r2"]),
        at(700)
    ));
}

#[test]
fn another_session_restarts_the_delay() {
    let next = shown_after(Some(&shown("s1", Some("r1"))), "s2", Some("r1"), at(600));
    assert_eq!(at(600), next.since_ms);
    assert!(!accepts_answer(
        Some(&next),
        "r1",
        &waiting(&["r1"]),
        at(700)
    ));
}

#[test]
fn the_same_ask_keeps_the_time() {
    let next = shown_after(Some(&shown("s1", Some("r1"))), "s1", Some("r1"), at(600));
    assert_eq!(T0, next.since_ms);
}

#[test]
fn only_the_shown_request_is_answered() {
    assert!(!accepts_answer(
        Some(&shown("s1", Some("r1"))),
        "r2",
        &waiting(&["r1", "r2"]),
        at(1000)
    ));
}

#[test]
fn a_request_no_longer_waiting_is_not_answered() {
    assert!(!accepts_answer(
        Some(&shown("s1", Some("r1"))),
        "r1",
        &HashSet::new(),
        at(1000)
    ));
}

#[test]
fn an_answer_before_the_ask_was_shown_is_not_accepted() {
    // The shown request still waits, so the time is the only reason to refuse.
    let still = waiting(&["r1"]);
    let ask = |since_ms| ShownAsk {
        since_ms,
        ..shown("s1", Some("r1"))
    };
    assert!(accepts_answer(
        Some(&ask(1_000)),
        "r1",
        &still,
        1_000 + ANSWER_DELAY_MS
    ));
    assert!(!accepts_answer(Some(&ask(1_000)), "r1", &still, 0));
    assert!(accepts_answer(Some(&ask(i64::MIN)), "r1", &still, i64::MAX));
    assert!(!accepts_answer(
        Some(&ask(i64::MAX)),
        "r1",
        &still,
        i64::MIN
    ));
}

#[test]
fn group_since_starts_unknown_and_moves_on_a_change() {
    let first = group_since_after(None, SessionGroup::Running, T0);
    assert_eq!(
        GroupSince {
            group: WindowGroup::Running,
            since_ms: None,
        },
        first
    );
    assert_eq!(
        first,
        group_since_after(Some(&first), SessionGroup::Running, at(1000))
    );
    assert_eq!(
        GroupSince {
            group: WindowGroup::Waiting,
            since_ms: Some(at(1000)),
        },
        group_since_after(Some(&first), SessionGroup::Waiting, at(1000))
    );
}

#[test]
fn finishing_moves_the_time_and_reading_keeps_it() {
    let running = GroupSince {
        group: WindowGroup::Running,
        since_ms: Some(T0),
    };
    let finished = group_since_after(Some(&running), SessionGroup::Unread, at(1000));
    assert_eq!(
        GroupSince {
            group: WindowGroup::Finished,
            since_ms: Some(at(1000)),
        },
        finished
    );
    assert_eq!(
        finished,
        group_since_after(Some(&finished), SessionGroup::Other, at(5000))
    );
}

#[test]
fn the_detail_of_a_waiting_session_is_its_first_card() {
    let steps = replay("05-permission-can-use-tool");
    let view = &steps
        .iter()
        .find(|it| {
            it.view
                .conversation
                .pending_approvals
                .iter()
                .any(|p| !p.request_id.is_empty())
        })
        .unwrap_or_else(|| panic!("a waiting step"))
        .view;
    let id = &view
        .conversation
        .pending_approvals
        .iter()
        .find(|it| !it.request_id.is_empty())
        .unwrap_or_else(|| panic!("a request"))
        .request_id;
    match session_detail(&view.conversation, &view.transcript) {
        SessionDetail::Waiting { card, more } => {
            assert_eq!(id, card.request_id());
            assert_eq!(0, more);
        }
        other => panic!("not waiting: {other:?}"),
    }
}

#[test]
fn the_detail_of_a_finished_session_has_the_last_reply() {
    let steps = replay("01-baseline-text");
    let last = &steps.last().unwrap_or_else(|| panic!("a last step")).view;
    match session_detail(&last.conversation, &last.transcript) {
        SessionDetail::Finished {
            last_reply,
            ask_key,
            ..
        } => {
            assert!(last_reply.is_some());
            assert_eq!(last_reply_text(&last.transcript), last_reply);
            assert!(ask_key.is_some());
        }
        other => panic!("not finished: {other:?}"),
    }
}

fn running_tool_step() -> Step {
    replay("02-tool-bash-autorun")
        .into_iter()
        .find(|it| {
            matches!(
                session_detail(&it.view.conversation, &it.view.transcript),
                SessionDetail::Running { tool: Some(_), .. }
            )
        })
        .unwrap_or_else(|| panic!("a step running a tool"))
}

#[test]
fn the_detail_of_a_running_tool_names_the_tool() {
    let step = running_tool_step();
    match session_detail(&step.view.conversation, &step.view.transcript) {
        SessionDetail::Running { tool, .. } => assert!(tool.is_some()),
        other => panic!("not running: {other:?}"),
    }
}

#[test]
fn the_reply_head_is_the_first_three_non_blank_lines() {
    assert_eq!(
        Some("a\nb\nc…".to_owned()),
        reply_head(Some("a\n\nb\n  \nc\nd"))
    );
    assert_eq!(Some("a\nb".to_owned()), reply_head(Some("a\n\nb")));
    assert_eq!(None, reply_head(None));
}

/// The last assistant message with `text` as its only reply text (as if more of it had
/// streamed).
fn with_reply(transcript: &Transcript, text: &str) -> Transcript {
    let key = transcript
        .messages
        .order()
        .rev()
        .find(|it| {
            transcript
                .messages
                .get(it)
                .is_some_and(|message| message.role == Role::Assistant)
        })
        .unwrap_or_else(|| panic!("an assistant message"))
        .to_owned();
    let messages = transcript.messages.update(&key, |message| {
        let others = message
            .parts
            .order()
            .fold(Keyed::new(), |parts: Keyed<PartRecord>, at| {
                match message.parts.get(at) {
                    None => parts,
                    Some(part) if matches!(**part, PartRecord::Text(_)) => parts,
                    Some(part) => parts.put(at.to_owned(), Arc::clone(part)),
                }
            });
        let reply = PartRecord::Text(TextRecord {
            reasoning: false,
            text: text.to_owned(),
            streaming: false,
        });
        Arc::new(MessageRecord {
            parts: others.put("test-reply".to_owned(), Arc::new(reply)),
            ..MessageRecord::clone(message)
        })
    });
    Transcript {
        messages,
        ..transcript.clone()
    }
}

#[test]
fn streaming_past_the_head_keeps_the_running_detail() {
    let step = running_tool_step();
    let view = &step.view;
    let longer = session_detail(
        &view.conversation,
        &with_reply(&view.transcript, "one\ntwo\nthree\nfour"),
    );
    let longest = session_detail(
        &view.conversation,
        &with_reply(&view.transcript, "one\ntwo\nthree\nfour\nfive six"),
    );
    assert_eq!(longer, longest);
    match longest {
        SessionDetail::Running { reply_head, .. } => {
            assert_eq!(Some("one\ntwo\nthree…".to_owned()), reply_head);
        }
        other => panic!("not running: {other:?}"),
    }
}

#[test]
fn the_detail_before_any_request_is_fresh() {
    assert_eq!(
        SessionDetail::Fresh,
        session_detail(&ConversationState::default(), &Transcript::default())
    );
}
