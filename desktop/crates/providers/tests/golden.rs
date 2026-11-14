#![allow(clippy::expect_used, clippy::unwrap_used)]
//! Matches the folded state against the JetBrains core goldens. Mirrors ConversationFoldGoldenTest.kt.
//!
//! The goldens are only read, never written. Kotlin's per-scenario `@TestFactory` runs every
//! scenario here, collects the failures and asserts once.

mod common;

use closta_core::fold;
use closta_model::ConversationState;
use common::*;
use serde_json::{Value, json};

fn fold_capture(scenario: &str) -> ConversationState {
    read_capture(&format!("{scenario}.ndjson"))
        .iter()
        .fold(ConversationState::default(), fold)
}

fn read_golden(scenario: &str) -> Result<Value, String> {
    let path = golden_dir().join(format!("{scenario}.json"));
    let text = std::fs::read_to_string(&path)
        .map_err(|e| format!("{scenario}: golden {} cannot be read: {e}", path.display()))?;
    serde_json::from_str(&text).map_err(|e| format!("{scenario}: golden does not parse: {e}"))
}

fn check_scenario(scenario: &str, fold_fn: &dyn Fn(&str) -> ConversationState) -> Option<String> {
    let once = fold_fn(scenario);
    let twice = fold_fn(scenario);
    if once != twice {
        return Some(format!(
            "{scenario}: folding twice must give the same state"
        ));
    }
    let golden = match read_golden(scenario) {
        Ok(g) => g,
        Err(e) => return Some(e),
    };
    let actual = serde_json::to_value(&once).expect("the state serializes");
    json_first_difference(&golden, &actual).map(|d| {
        format!(
            "{scenario}: {}: expected {}, got {}",
            d.pointer, d.expected, d.actual
        )
    })
}

fn check_all(scenarios: &[String], fold_fn: &dyn Fn(&str) -> ConversationState) -> Vec<String> {
    scenarios
        .iter()
        .filter_map(|s| check_scenario(s, fold_fn))
        .collect()
}

fn scenario_names() -> Vec<String> {
    let mut names: Vec<String> = manifest()
        .scenarios
        .into_iter()
        .map(|s| s.scenario)
        .collect();
    names.sort();
    names
}

#[test]
fn goldens_on_disk_are_exactly_the_manifest_scenarios() {
    let expected = scenario_names();
    assert!(!expected.is_empty(), "the manifest lists no scenarios");
    let mut on_disk: Vec<String> = std::fs::read_dir(golden_dir())
        .expect("the golden directory lists")
        .filter_map(Result::ok)
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            name.strip_suffix(".json").map(str::to_string)
        })
        .collect();
    on_disk.sort();
    assert_eq!(expected, on_disk);
}

#[test]
fn each_capture_folds_to_its_golden_twice_the_same() {
    let failures = check_all(&scenario_names(), &fold_capture);
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

#[test]
fn golden_failure_names_every_scenario() {
    let wrong = |_: &str| ConversationState {
        spontaneous_resume_count: 99,
        ..ConversationState::default()
    };
    let scenarios = vec![
        "01-baseline-text".to_string(),
        "02-tool-bash-autorun".to_string(),
    ];
    let failures = check_all(&scenarios, &wrong);
    assert_eq!(2, failures.len(), "{failures:?}");
    assert!(failures[0].starts_with("01-baseline-text: "));
    assert!(failures[1].starts_with("02-tool-bash-autorun: "));
}

#[test]
fn a_missing_golden_counts_as_a_failure() {
    let failures = check_all(&["no-such-scenario".to_string()], &fold_capture_default);
    assert_eq!(1, failures.len());
    assert!(failures[0].starts_with("no-such-scenario: "));
}

fn fold_capture_default(_: &str) -> ConversationState {
    ConversationState::default()
}

#[test]
fn numbers_compare_by_value() {
    let zero: Value = serde_json::from_str("0").unwrap();
    let zero_f: Value = serde_json::from_str("0.0").unwrap();
    assert_eq!(None, json_first_difference(&zero, &zero_f));
    let sci: Value = serde_json::from_str("1.0E-4").unwrap();
    let dec: Value = serde_json::from_str("0.0001").unwrap();
    assert_eq!(None, json_first_difference(&sci, &dec));
}

#[test]
fn missing_and_extra_keys_are_found() {
    let d = json_first_difference(&json!({"a": 1}), &json!({"a": 1, "b": null})).unwrap();
    assert_eq!("/b", d.pointer);
    let d = json_first_difference(&json!({"a": 1, "b": null}), &json!({"a": 1})).unwrap();
    assert_eq!("/b", d.pointer);
}

#[test]
fn array_length_difference_is_found() {
    let d = json_first_difference(&json!([1]), &json!([1, 2])).unwrap();
    assert_eq!("/1", d.pointer);
}
