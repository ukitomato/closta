//! The replay files `cargo xtask gallery-capture` and `cargo xtask synth-capture` write, read back
//! through the providers' replay parser and folded the way the host folds what it sends and
//! decides: the gallery as `GallerySession.view(Waits.ALL)` draws it, the synthetic conversation
//! one cue per turn, and the streamed reply last.

use std::path::PathBuf;

use closta_goldens::gallery;
use closta_goldens::synthetic::{self, LARGEST, replay_script};
use closta_model::ApprovalDecision;
use closta_presenter::cards::ThreadCard;
use closta_presenter::input::{Decided, PassedOn, PresenterInput, SendId, UserSent};
use closta_presenter::rows::{ThreadRow, ThreadRows};
use closta_presenter::session::SessionView;
use closta_providers::claude::fake::replay::{ReplayCue, ReplayLine, parse_replay};
use closta_providers::claude::protocol::decode;

const ASK: &str = "Retry up to 3 times when login fails. Fix AuthServiceTest.kt too";
const SECOND_ASK: &str = "Fix the tests too, and show me a plan when you're done";

/// The lines as a file holds them, read back.
fn round_trip(lines: &[ReplayLine]) -> Vec<ReplayLine> {
    let text = synthetic::replay_file(lines);
    parse_replay(&text).unwrap_or_else(|e| panic!("{e}"))
}

/// Folds `lines` as the host would: a user cue sends its text, an answer decides the request after
/// Kotlin's waits (1,200 ms to allow, 900 to deny), and every other line is stdout.
fn fold(lines: &[ReplayLine]) -> SessionView {
    let mut sent = 0;
    lines.iter().fold(SessionView::default(), |view, line| {
        let input = match line {
            ReplayLine::Stdout(line) => PresenterInput::Event(decode(line)),
            ReplayLine::Cue(ReplayCue::User { text }) => {
                let id = format!("u{sent}");
                sent += 1;
                PresenterInput::UserSent(UserSent {
                    message_id: SendId::new(&id).unwrap_or_else(|| panic!("{id} is not a key")),
                    text: text.clone(),
                    attachments: Vec::new(),
                    uuid: None,
                })
            }
            ReplayLine::Cue(ReplayCue::Answer { request_id, allow }) => {
                let request_id = request_id.clone();
                let (decision, elapsed_ms) = if *allow {
                    (ApprovalDecision::Allow { request_id }, 1_200)
                } else {
                    (ApprovalDecision::Deny { request_id }, 900)
                };
                PresenterInput::Decided(Decided {
                    decision,
                    elapsed_ms,
                    passed_on: PassedOn::default(),
                })
            }
        };
        view.fold(&input)
    })
}

fn rows(view: &SessionView) -> Vec<ThreadRow> {
    ThreadRows::default().of(&view.transcript)
}

fn user_cues(lines: &[ReplayLine]) -> Vec<&str> {
    lines
        .iter()
        .filter_map(|line| match line {
            ReplayLine::Cue(ReplayCue::User { text }) => Some(text.as_str()),
            _ => None,
        })
        .collect()
}

fn reply_markdown() -> String {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../jetbrains/src/testFixtures/resources/bench/replay-reply.md");
    std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("{} cannot be read: {e}", path.display()))
}

#[test]
fn the_gallery_folds_to_the_jetbrains_gallery() {
    let lines = round_trip(&gallery::replay_lines());
    let view = fold(&lines);
    let rows = rows(&view);

    let asks: Vec<&str> = rows
        .iter()
        .filter_map(|row| match row {
            ThreadRow::Ask(ask) => Some(ask.text.as_str()),
            _ => None,
        })
        .collect();
    assert_eq!(vec![ASK, SECOND_ASK], asks);
    assert!(rows.iter().any(|row| matches!(row, ThreadRow::Todo(_))));
    assert!(rows.iter().any(|row| matches!(row, ThreadRow::Explored(_))));

    let waiting: Vec<(&str, &str)> = rows
        .iter()
        .filter_map(|row| match row {
            ThreadRow::Card(card) if card.card.answered().is_none() => Some(&card.card),
            _ => None,
        })
        .map(|card| match card {
            ThreadCard::Permission(card) => (card.request_id.as_str(), card.tool_name.as_str()),
            ThreadCard::Question(card) => (card.request_id.as_str(), "question"),
            ThreadCard::Plan(card) => (card.request_id.as_str(), "plan"),
        })
        .collect();
    assert_eq!(
        vec![
            ("gallery-r2", "Bash"),
            ("gallery-r3", "question"),
            ("gallery-r4", "plan"),
            ("gallery-r5", "Edit"),
        ],
        waiting
    );
    let answered = rows
        .iter()
        .filter(|row| matches!(row, ThreadRow::Card(card) if card.card.answered().is_some()))
        .count();
    assert_eq!(3, answered, "gallery-r1, r6 and r7 were answered");
    assert_eq!(4, view.conversation.pending_approvals.len());
    assert_eq!(
        Some("claude-synthetic"),
        view.conversation
            .session
            .as_ref()
            .map(|session| session.model.as_str())
    );
}

#[test]
fn the_gallery_answers_each_request_it_asks_in_its_first_turn() {
    let answers: Vec<(String, bool)> = gallery::replay_lines()
        .into_iter()
        .filter_map(|line| match line {
            ReplayLine::Cue(ReplayCue::Answer { request_id, allow }) => Some((request_id, allow)),
            _ => None,
        })
        .collect();

    assert_eq!(
        vec![
            ("gallery-r1".to_owned(), true),
            ("gallery-r6".to_owned(), true),
            ("gallery-r7".to_owned(), false),
        ],
        answers
    );
}

#[test]
fn the_synthetic_capture_has_one_user_cue_per_turn() {
    let lines = round_trip(&synthetic::replay_lines(&LARGEST, 1));
    let turns = synthetic::session(&LARGEST, 1);

    let prompts: Vec<&str> = turns.iter().map(|turn| turn.prompt.as_str()).collect();
    assert_eq!(200, user_cues(&lines).len());
    assert_eq!(prompts, user_cues(&lines));
    assert!(matches!(lines[0], ReplayLine::Cue(ReplayCue::User { .. })));
    let stdout = lines
        .iter()
        .filter(|line| matches!(line, ReplayLine::Stdout(_)))
        .count();
    assert_eq!(
        turns.iter().map(|turn| turn.lines.len()).sum::<usize>(),
        stdout
    );
}

#[test]
fn the_stream_capture_ends_with_the_streamed_reply() {
    let markdown = reply_markdown();
    let lines = round_trip(&replay_script::replay_lines(&markdown, "stream"));

    assert_eq!(vec!["Go on"], user_cues(&lines));
    assert!(matches!(lines[0], ReplayLine::Cue(ReplayCue::User { .. })));
    let rows = rows(&fold(&lines));
    let last_text = rows
        .iter()
        .rev()
        .find_map(|row| match row {
            ThreadRow::Text(text) => Some(text.markdown.as_str()),
            _ => None,
        })
        .unwrap_or_else(|| panic!("a text row"));
    assert_eq!(markdown, last_text);
}
