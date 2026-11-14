//! Replays each capture with the host's inputs put back and holds the last tree against its golden
//! (ProjectionGoldenTest.kt). A second replay must give the same tree, printed the same.
//!
//! The goldens are the Kotlin side's, read in place and compared as values: `JsonText.pretty` is
//! not ported, and nothing here writes a golden. The contract checks (`TreeChecks`) and the memo's
//! "same as a fresh projector" are not ported: the projector here has no memo.

use closta_goldens::common::json_first_difference;
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

fn check(scenario: &str) -> Option<String> {
    let Some(last) = replay(scenario).pop().map(|step| step.tree) else {
        return Some(format!("{scenario}: the capture gives no input"));
    };
    let again = final_tree(scenario);
    if serde_json::to_string(&last).ok() != serde_json::to_string(&again).ok() {
        return Some(format!(
            "{scenario}: a second replay gives a tree that prints differently"
        ));
    }
    let golden = match read_golden(scenario) {
        Ok(golden) => golden,
        Err(e) => return Some(e),
    };
    json_first_difference(&golden, &last).map(|d| {
        format!(
            "{scenario}: {}: expected {}, got {}",
            d.pointer, d.expected, d.actual
        )
    })
}

#[test]
#[ignore = "folds land in tasks 4-6; enabled in task 7"]
fn each_capture_projects_to_its_golden_twice_the_same() {
    let all = scenarios();
    assert_eq!(40, all.len(), "the manifest's scenarios");
    let failures: Vec<String> = all.iter().filter_map(|s| check(s)).collect();
    assert!(
        failures.is_empty(),
        "{} of {} scenarios differ:\n{}",
        failures.len(),
        all.len(),
        failures.join("\n")
    );
}
