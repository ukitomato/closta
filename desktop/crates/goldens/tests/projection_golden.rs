//! Replays each capture with the host's inputs put back and holds the last tree against its golden
//! (ProjectionGoldenTest.kt). A second replay must give the same tree, printed the same.
//!
//! The goldens are the Kotlin side's, read in place and compared as values: `JsonText.pretty` is
//! not ported, and nothing here writes a golden. The contract checks (`TreeChecks`) and the memo's
//! "same as a fresh projector" are not ported: the projector here has no memo.

use closta_goldens::common::json_differences;
use closta_goldens::replay::{final_tree, replay, scenarios};
use serde_json::Value;
use std::path::PathBuf;

fn golden_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../jetbrains/src/test/resources/dev/ukitomato/closta/presenter/golden")
}

fn read_golden(scenario: &str) -> Result<Value, String> {
    let path = golden_dir().join(format!("{scenario}.json"));
    let text = std::fs::read_to_string(&path)
        .map_err(|e| format!("{scenario}: golden {} cannot be read: {e}", path.display()))?;
    serde_json::from_str(&text).map_err(|e| format!("{scenario}: golden does not parse: {e}"))
}

/// `None` when the last tree of `scenario` is its golden.
fn check(scenario: &str) -> Option<String> {
    let last = match last_tree(scenario) {
        Ok(last) => last,
        Err(e) => return Some(e),
    };
    let golden = match read_golden(scenario) {
        Ok(golden) => golden,
        Err(e) => return Some(e),
    };
    compare(scenario, &golden, &last)
}

/// The last tree of `scenario`, which a second replay must print the same.
fn last_tree(scenario: &str) -> Result<Value, String> {
    let Some(last) = replay(scenario).pop().map(|step| step.tree) else {
        return Err(format!("{scenario}: the capture gives no input"));
    };
    let again = final_tree(scenario);
    if serde_json::to_string(&last).ok() != serde_json::to_string(&again).ok() {
        return Err(format!(
            "{scenario}: a second replay gives a tree that prints differently"
        ));
    }
    Ok(last)
}

/// `check` past the replay: every leaf where `golden` and `last` differ, by its pointer.
fn compare(scenario: &str, golden: &Value, last: &Value) -> Option<String> {
    let failures: Vec<String> = json_differences(golden, last)
        .into_iter()
        .map(|d| {
            format!(
                "{scenario}: {}: expected {}, got {}",
                d.pointer, d.expected, d.actual
            )
        })
        .collect();
    (!failures.is_empty()).then(|| failures.join("\n"))
}

#[test]
fn each_capture_projects_to_its_golden_twice_the_same() {
    let all = scenarios();
    assert_eq!(44, all.len(), "the manifest's scenarios");
    let failures: Vec<String> = all.iter().filter_map(|s| check(s)).collect();
    assert!(
        failures.is_empty(),
        "{} of {} scenarios differ:\n{}",
        failures.len(),
        all.len(),
        failures.join("\n")
    );
}

/// A leaf of 01's tree that the test changes in the golden.
const MODEL_01: &str = "/threads/byId/thread-1/session/model";

#[test]
fn a_difference_from_the_golden_fails() {
    let scenario = "01-baseline-text";
    let last = last_tree(scenario).expect("01's last tree");
    let golden = read_golden(scenario).expect("01's golden");
    assert_eq!(
        None,
        compare(scenario, &golden, &last),
        "01 passes as it is"
    );

    // One leaf of the golden is not the tree's: the failure names its pointer.
    let mut differing = golden;
    *differing
        .pointer_mut(MODEL_01)
        .expect("01's golden has a model") = Value::from("closta-test-model");
    let failure = compare(scenario, &differing, &last).expect("a difference fails");
    assert!(
        failure.contains(&format!("{MODEL_01}: expected \"closta-test-model\"")),
        "{failure}"
    );
}
