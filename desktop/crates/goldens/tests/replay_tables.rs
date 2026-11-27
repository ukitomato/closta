//! The replay tables of `closta_goldens::replay` (SENT, ANSWERS, REQUESTS) and the `file` argument
//! that replays an older CLI's excerpt under a scenario's sends.

use closta_goldens::common::{legacy_excerpt, read_capture_at};
use closta_goldens::replay::{inputs, replay_from, scenarios};
use closta_presenter::input::PresenterInput;

fn user_sends(inputs: &[PresenterInput]) -> Vec<String> {
    inputs
        .iter()
        .filter_map(|input| match input {
            PresenterInput::UserSent(sent) => Some(sent.text.clone()),
            _ => None,
        })
        .collect()
}

fn events(inputs: &[PresenterInput]) -> usize {
    inputs
        .iter()
        .filter(|input| matches!(input, PresenterInput::Event(_)))
        .count()
}

#[test]
fn every_scenario_of_the_manifest_has_a_sent_row() {
    let all = scenarios();
    assert_eq!(44, all.len());
    for scenario in &all {
        let replayed = inputs(scenario, false);
        assert!(events(&replayed) > 0, "{scenario}: no event replayed");
    }
}

/// The user texts of `scenario`'s block in the recorder's scenario list (plain single-quoted
/// strings only: the four blocks asked for have no other kind).
fn recorder_texts(scenario: &str) -> Vec<String> {
    let path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../recorder/scenarios.mjs");
    let source = std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("cannot read {}: {e}", path.display()));
    let marker = format!("id: '{scenario}'");
    let start = source
        .find(&marker)
        .unwrap_or_else(|| panic!("{scenario}: not in the recorder's scenarios"));
    let block = &source[start + marker.len()..];
    let block = &block[..block.find("\n    id: '").unwrap_or(block.len())];
    let mut texts = Vec::new();
    for part in block.split("{ kind: 'user', text: '").skip(1) {
        let end = part
            .find("' }")
            .unwrap_or_else(|| panic!("{scenario}: a user step is not a plain string"));
        texts.push(part[..end].to_owned());
    }
    texts
}

#[test]
fn the_sends_of_41_to_44_are_the_texts_the_recorder_typed() {
    for scenario in [
        "41-clear-reset",
        "42-local-commands",
        "43-usage-and-rules",
        "44-permission-denied",
    ] {
        let expected = recorder_texts(scenario);
        assert!(!expected.is_empty(), "{scenario}: no user step read");
        assert_eq!(expected, user_sends(&inputs(scenario, false)), "{scenario}");
    }
}

#[test]
fn an_older_clis_excerpt_replays_under_its_scenarios_sends() {
    let excerpt = replay_from("10-background-task", &legacy_excerpt("10-background-task"));
    let excerpt: Vec<PresenterInput> = excerpt.into_iter().map(|step| step.input).collect();
    assert_eq!(1, user_sends(&excerpt).len());
    assert_ne!(
        events(&inputs("10-background-task", false)),
        events(&excerpt)
    );
}

#[test]
#[should_panic(expected = "99-none-excerpt.ndjson")]
fn a_missing_excerpt_names_its_path() {
    read_capture_at(&legacy_excerpt("99-none"));
}
