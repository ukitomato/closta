//! The replay's lines read as the CLI's and fold to the reply and its Edit (ReplayScriptTest.kt).

use closta_goldens::synthetic::replay_script;
use closta_model::AgentEvent;
use closta_presenter::input::PresenterInput;
use closta_presenter::session::SessionView;
use closta_presenter::text::{take_utf16, utf16_len};
use closta_presenter::transcript::{PartRecord, Role};
use closta_providers::claude::protocol::decode;

const REPLY: &str = "# 見出し\n\n段落の`code`です。\n\n```kotlin\nval a = 1 /* */\n```\n";
const SESSION: &str = "spike-replay";
/// The size `replay_script::lines` streams the reply in (Kotlin's default `chunkChars`).
const CHUNK: usize = 8;
const LINE_PREVIEW: usize = 80;

fn folded(lines: &[String]) -> SessionView {
    lines.iter().fold(SessionView::default(), |view, line| {
        view.fold(&PresenterInput::Event(decode(line)))
    })
}

#[test]
fn every_line_decodes_to_a_known_event() {
    for line in replay_script::lines(REPLY, SESSION) {
        let event = decode(&line);
        assert!(
            !matches!(
                event,
                AgentEvent::BrokenLine { .. } | AgentEvent::UnknownKind { .. }
            ),
            "{}",
            take_utf16(&line, LINE_PREVIEW)
        );
    }
}

#[test]
fn the_folded_transcript_holds_the_reply_verbatim_and_one_finished_edit_call() {
    let view = folded(&replay_script::lines(REPLY, SESSION));
    let parts: Vec<&PartRecord> = view
        .transcript
        .messages
        .values()
        .filter(|it| it.role == Role::Assistant)
        .flat_map(|it| it.parts.values().map(AsRef::as_ref).collect::<Vec<_>>())
        .collect();
    let texts: Vec<_> = parts
        .iter()
        .filter_map(|it| match it {
            PartRecord::Text(text) => Some(text),
            _ => None,
        })
        .collect();

    let said: String = texts
        .iter()
        .filter(|it| !it.reasoning)
        .map(|it| it.text.as_str())
        .collect();
    assert_eq!(REPLY, said);
    let edits: Vec<_> = parts
        .iter()
        .filter_map(|it| match it {
            PartRecord::ToolCall(call) => Some(call),
            _ => None,
        })
        .collect();
    let [edit] = edits.as_slice() else {
        panic!("one tool call, not {}", edits.len());
    };
    assert_eq!("Edit", edit.tool_name);
    assert!(edit.result.is_some(), "the Edit has its result");
    assert!(
        texts.iter().all(|it| !it.streaming),
        "nothing is left streaming"
    );
}

#[test]
fn text_arrives_in_chunks_of_the_given_size() {
    let deltas = replay_script::lines(REPLY, SESSION)
        .iter()
        .filter(|it| it.contains("\"text_delta\""))
        .count();

    assert_eq!(utf16_len(REPLY).div_ceil(CHUNK), deltas);
}
