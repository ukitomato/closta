//! `system/commands_changed` replaces the slash command list with the one that carries the
//! sentences (CommandsFoldTest.kt).

use std::sync::Arc;

use closta_goldens::lines::InitLine;
use closta_goldens::replay::replay;
use closta_goldens::session::Session;
use closta_model::{AgentEvent, RawJson};
use closta_presenter::records::composer::{SlashCommandRecord, SlashCommands};

fn changed(commands: &str) -> AgentEvent {
    AgentEvent::SystemCommandsChanged {
        uuid: "u".into(),
        session_id: "s-1".into(),
        commands: RawJson(commands.into()),
    }
}

fn two() -> AgentEvent {
    changed(
        r#"[{"name":"alpha","description":"First","argumentHint":"<x>"},{"name":"beta","description":"Second"}]"#,
    )
}

fn two_records() -> Arc<[SlashCommandRecord]> {
    vec![
        SlashCommandRecord {
            name: "alpha".into(),
            description: "First".into(),
            argument_hint: Some("<x>".into()),
        },
        SlashCommandRecord {
            name: "beta".into(),
            description: "Second".into(),
            argument_hint: None,
        },
    ]
    .into()
}

fn old_init() -> AgentEvent {
    InitLine {
        slash_commands: r#"["old"]"#,
        ..InitLine::default()
    }
    .event()
}

#[test]
fn capture_01_ends_with_the_59_commands_of_its_commands_changed_with_their_sentences() {
    let last = replay("01-baseline-text")
        .pop()
        .expect("01 gives inputs")
        .view;
    let commands = &last.transcript.commands;
    assert!(commands.detailed);
    assert_eq!(59, commands.items.len());
    // 01 lines 6 and 7: the first entry of the list.
    assert_eq!(
        Some(&SlashCommandRecord {
            name: "design".into(),
            description: "Grant or revoke Claude agent access to your Design projects".into(),
            argument_hint: Some("consent | revoke".into()),
        }),
        commands.items.first()
    );
}

#[test]
fn a_commands_changed_replaces_the_list_and_a_later_init_does_not_take_it_back_to_names() {
    let mut session = Session::default();
    session.events([old_init(), two(), old_init()]);
    assert_eq!(
        SlashCommands {
            items: two_records(),
            detailed: true
        },
        session.transcript().commands
    );
}

#[test]
fn an_empty_list_is_an_empty_list() {
    let mut session = Session::default();
    session.events([two()]);
    assert_eq!(2, session.transcript().commands.items.len(), "the premise");
    session.events([changed("[]")]);
    assert_eq!(
        SlashCommands {
            items: Vec::new().into(),
            detailed: true
        },
        session.transcript().commands
    );
}

#[test]
fn something_that_is_not_a_list_leaves_the_transcript_as_it_was() {
    // An object, a string that does not parse, and an empty string (Task 10's review).
    for commands in ["{}", "not json", ""] {
        let mut session = Session::default();
        session.events([two()]);
        let before = Arc::clone(session.transcript());
        assert_eq!(2, before.commands.items.len(), "the premise");
        session.events([changed(commands)]);
        assert!(
            Arc::ptr_eq(&before.commands.items, &session.transcript().commands.items),
            "{commands:?}"
        );
        assert_eq!(
            before.commands,
            session.transcript().commands,
            "{commands:?}"
        );
    }
}

#[test]
fn the_same_list_again_returns_the_same_commands() {
    let mut session = Session::default();
    session.events([two()]);
    let before = Arc::clone(session.transcript());
    assert_eq!(2, before.commands.items.len(), "the premise");
    session.events([two()]);
    assert!(Arc::ptr_eq(
        &before.commands.items,
        &session.transcript().commands.items
    ));
}
