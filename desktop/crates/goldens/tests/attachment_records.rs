//! What the thread keeps of a file the user sent: its point, in the tree's words, never its name in
//! a log (AttachmentRecordsTest.kt).
//!
//! Kotlin folds the refusal on the records alone (`refuseAttachment`); it is internal there and
//! `pub(crate)` here, so the test folds it through the session, the way the host does.

use std::sync::Arc;

use closta_goldens::projector::{attachment_node, other_node};
use closta_model::AttachmentKind;
use closta_presenter::input::{AttachmentRefused, PresenterInput};
use closta_presenter::records::attachment::{AttachmentRecord, AttachmentRefusal};
use closta_presenter::records::operations::{SwitchKind, SwitchOutcome};
use closta_presenter::session::SessionView;
use closta_presenter::transcript::OtherRecord;
use serde_json::json;

fn record(name: &str, kind: AttachmentKind, media_type: &str, size: i64) -> AttachmentRecord {
    AttachmentRecord {
        name: name.into(),
        kind,
        media_type: media_type.into(),
        size,
        path: None,
    }
}

#[test]
fn a_file_is_a_part_of_its_own_kind_with_its_name_kind_type_and_size_and_nothing_else() {
    let node = attachment_node(&record("shot.png", AttachmentKind::Image, "image/png", 73));

    assert_eq!(
        json!({
            "type": "attachment",
            "name": "shot.png",
            "kind": "image",
            "mediaType": "image/png",
            "size": 73,
        }),
        node
    );
    assert_eq!(
        Some(&json!("document")),
        attachment_node(&record(
            "a.pdf",
            AttachmentKind::Document,
            "application/pdf",
            1
        ))
        .get("kind")
    );
    assert_eq!(
        Some(&json!("text")),
        attachment_node(&record("a.txt", AttachmentKind::Text, "text/plain", 1)).get("kind")
    );
}

#[test]
fn a_block_the_cli_wrote_named_like_a_part_this_version_knows_is_unknown_and_one_that_is_not_keeps_its_name()
 {
    for known in ["text", "reasoning", "tool-call", "attachment", ""] {
        assert_eq!(
            json!({ "type": "unknown" }),
            other_node(&OtherRecord {
                r#type: known.into()
            }),
            "'{known}' claims fields it lacks"
        );
    }
    assert_eq!(
        json!({ "type": "redacted_thinking" }),
        other_node(&OtherRecord {
            r#type: "redacted_thinking".into()
        })
    );
}

#[test]
fn a_record_says_its_kind_and_size_never_its_name() {
    let text = format!(
        "{:?}",
        record("private-notes.txt", AttachmentKind::Text, "text/plain", 5)
    );

    assert_eq!("AttachmentRecord(Text, 5 bytes)", text);
    assert!(!text.contains("private"));
}

#[test]
fn a_refusal_is_one_record_that_is_over_at_once_under_its_own_id_and_a_second_with_that_id_changes_nothing()
 {
    let refused = |reason| {
        PresenterInput::AttachmentRefused(AttachmentRefused {
            request_id: "r1".into(),
            reason,
        })
    };
    let first = SessionView::default().fold(&refused(AttachmentRefusal::TooLarge));
    let again = first.clone().fold(&refused(AttachmentRefusal::Missing));

    let switches = &first.transcript.operations.switches;
    assert_eq!(1, switches.len());
    let record = &switches[0];
    assert_eq!(SwitchKind::Attachment, record.kind);
    assert_eq!(SwitchOutcome::Rejected, record.outcome);
    assert_eq!("too-large", record.value);
    assert_eq!(None, record.detail);
    assert!(Arc::ptr_eq(&first.transcript, &again.transcript));
    assert_eq!(
        vec![
            "missing",
            "too-large",
            "too-many",
            "unsupported",
            "not-text"
        ],
        [
            AttachmentRefusal::Missing,
            AttachmentRefusal::TooLarge,
            AttachmentRefusal::TooMany,
            AttachmentRefusal::Unsupported,
            AttachmentRefusal::NotText,
        ]
        .map(AttachmentRefusal::wire)
        .to_vec()
    );
}

#[test]
fn a_record_keeps_where_the_file_was_but_never_says_it() {
    let kept = AttachmentRecord {
        path: Some("/home/me/secret/a.txt".into()),
        ..record("a.txt", AttachmentKind::Text, "text/plain", 1)
    };

    assert_eq!(Some("/home/me/secret/a.txt"), kept.path.as_deref());
    assert!(!format!("{kept:?}").contains("secret"));
    assert!(!attachment_node(&kept).to_string().contains("secret"));
    assert_eq!(
        None,
        record("a.txt", AttachmentKind::Text, "text/plain", 1).path
    );
}
