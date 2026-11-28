//! Replays each capture with the host's inputs put back and holds the last tree against its golden
//! (ProjectionGoldenTest.kt). A second replay must give the same tree, printed the same.
//!
//! The goldens are the Kotlin side's, read in place and compared as values: `JsonText.pretty` is
//! not ported, and nothing here writes a golden. The contract checks (`TreeChecks`) and the memo's
//! "same as a fresh projector" are not ported: the projector here has no memo.
//!
//! Until the presenter features are ported, `PENDING_6DR2` lets through the exact differences
//! they still owe, and nothing else.

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

/// Which value a pending row puts back in the golden before the comparison.
#[derive(Clone, Copy)]
enum Before {
    /// The JSON text of the value the golden held before the Kotlin side's feature commit.
    Json(&'static str),
    /// The key was not there before: it is taken out of its parent object.
    Absent,
}

/// One difference the presenter still owes: a Kotlin side feature commit changed this exact
/// pointer of the golden, and the presenter here gives the value from before that commit.
#[derive(Clone, Copy)]
struct Pending {
    scenario: &'static str,
    /// The exact pointer: neither a prefix nor the leaves under it are let through.
    pointer: &'static str,
    before: Before,
    /// The Kotlin side's commit whose golden diff gives this row.
    commit: &'static str,
    /// The R2 task that ports the feature and deletes this row.
    r2_task: &'static str,
}

/// The golden differences the presenter features of stage R2 will port, row by row. Each R2 task
/// deletes its own rows (a row it no longer needs fails the test); the last R2 task deletes the
/// table and the types. Do not merge to main while this table is here.
const PENDING_6DR2: [Pending; 5] = [
    Pending {
        scenario: "01-baseline-text",
        pointer: "/threads/byId/thread-1/commands",
        before: Before::Json(COMMANDS_BEFORE_4B24F89),
        commit: "4b24f89",
        r2_task: "the command list",
    },
    Pending {
        scenario: "10-background-task",
        pointer: "/threads/byId/thread-1/messages/byId/d4fed6c0-ab40-495c-9ef9-ef10a67ccae1/parts/byId/toolu_012izVu2hY9Yn9ShDBzDM6r9/messages/byId/msg_011CScrubbed2bdfKJKmxWno/parts/byId/toolu_01Hvch5dCrw4nDo6NEv1PNcx/status",
        before: Before::Json(r#"{"type":"complete"}"#),
        commit: "76a2767",
        r2_task: "the denied tool",
    },
    Pending {
        scenario: "21-compact",
        pointer: "/threads/byId/thread-1/messages/byId/a3ec4b73-9418-4ab2-ac4f-69dffff51945/parts/order",
        before: Before::Json("[]"),
        commit: "9a9d5a7",
        r2_task: "the compaction",
    },
    Pending {
        scenario: "21-compact",
        pointer: "/threads/byId/thread-1/messages/byId/a3ec4b73-9418-4ab2-ac4f-69dffff51945/parts/byId/compacted",
        before: Before::Absent,
        commit: "9a9d5a7",
        r2_task: "the compaction",
    },
    Pending {
        scenario: "44-permission-denied",
        pointer: "/threads/byId/thread-1/messages/byId/9659e6c9-b4b3-458e-ad59-7d912d365a4c/parts/byId/toolu_01LeMqLTAqR4JiZqRuLiYC21/status",
        before: Before::Json(r#"{"type":"complete"}"#),
        commit: "76a2767",
        r2_task: "the denied tool",
    },
];

// An empty table must not stay behind: R2 deletes the table and its types together.
const _: () = assert!(!PENDING_6DR2.is_empty());

/// `/threads/byId/thread-1/commands` of 01's golden at 4b24f89^: the names alone, no hints.
const COMMANDS_BEFORE_4B24F89: &str = r#"[
    {"name": "design", "description": ""}, {"name": "design-sync", "description": ""},
    {"name": "dataviz", "description": ""}, {"name": "update-config", "description": ""},
    {"name": "verify", "description": ""}, {"name": "debug", "description": ""},
    {"name": "code-review", "description": ""}, {"name": "simplify", "description": ""},
    {"name": "batch", "description": ""},
    {"name": "fewer-permission-prompts", "description": ""},
    {"name": "doctor", "description": ""}, {"name": "loop", "description": ""},
    {"name": "claude-api", "description": ""}, {"name": "run", "description": ""},
    {"name": "run-skill-generator", "description": ""},
    {"name": "plugin-authoring", "description": ""}, {"name": "advisor", "description": ""},
    {"name": "agents", "description": ""}, {"name": "auto-mode-setup", "description": ""},
    {"name": "autocompact", "description": ""}, {"name": "clear", "description": ""},
    {"name": "color", "description": ""}, {"name": "compact", "description": ""},
    {"name": "config", "description": ""}, {"name": "output-style", "description": ""},
    {"name": "context", "description": ""}, {"name": "effort", "description": ""},
    {"name": "fast", "description": ""}, {"name": "focus", "description": ""},
    {"name": "heapdump", "description": ""}, {"name": "init", "description": ""},
    {"name": "mcp", "description": ""}, {"name": "import", "description": ""},
    {"name": "model", "description": ""}, {"name": "__remote-workflow", "description": ""},
    {"name": "workflow-launch-exec", "description": ""},
    {"name": "reload-plugins", "description": ""},
    {"name": "reload-skills", "description": ""}, {"name": "rename", "description": ""},
    {"name": "security-review", "description": ""},
    {"name": "usage-credits", "description": ""}, {"name": "extra-usage", "description": ""},
    {"name": "usage", "description": ""}, {"name": "insights", "description": ""},
    {"name": "recap", "description": ""}, {"name": "skill-doctor", "description": ""},
    {"name": "goal", "description": ""}, {"name": "design-consent", "description": ""},
    {"name": "design-revoke", "description": ""}, {"name": "list-agents", "description": ""},
    {"name": "team-onboarding", "description": ""}
]"#;

/// Puts `row`'s previous value in place of the golden's at its pointer.
fn put_back(golden: &mut Value, row: &Pending) -> Result<(), String> {
    let missing = || format!("pending row {} is not in the golden", row.pointer);
    match row.before {
        Before::Json(text) => {
            let value: Value = serde_json::from_str(text).map_err(|e| {
                format!(
                    "pending row {}: the previous value does not parse: {e}",
                    row.pointer
                )
            })?;
            *golden.pointer_mut(row.pointer).ok_or_else(missing)? = value;
        }
        Before::Absent => {
            let (parent, key) = row.pointer.rsplit_once('/').ok_or_else(missing)?;
            let key = key.replace("~1", "/").replace("~0", "~");
            golden
                .pointer_mut(parent)
                .and_then(Value::as_object_mut)
                .and_then(|object| object.remove(&key))
                .ok_or_else(missing)?;
        }
    }
    Ok(())
}

/// `None` when the last tree of `scenario` is its golden with `pending`'s rows of that scenario
/// put back, and each of those rows is used: the golden differs from the tree at its pointer.
fn check(scenario: &str, pending: &[Pending]) -> Option<String> {
    let last = match last_tree(scenario) {
        Ok(last) => last,
        Err(e) => return Some(e),
    };
    let golden = match read_golden(scenario) {
        Ok(golden) => golden,
        Err(e) => return Some(e),
    };
    compare(scenario, golden, &last, pending)
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

/// `check` past the replay: `golden` against `last` with `pending`'s rows of `scenario`.
fn compare(scenario: &str, mut golden: Value, last: &Value, pending: &[Pending]) -> Option<String> {
    let rows: Vec<&Pending> = pending.iter().filter(|p| p.scenario == scenario).collect();
    let mut failures = Vec::new();
    let owed = json_differences(&golden, last);
    for row in &rows {
        let under = format!("{}/", row.pointer);
        let used = owed
            .iter()
            .any(|d| d.pointer == row.pointer || d.pointer.starts_with(&under));
        if !used {
            failures.push(format!(
                "{scenario}: pending row {} is not used: the tree gives the golden's value there; \
                 delete the row ({}, R2 task: {})",
                row.pointer, row.commit, row.r2_task
            ));
        }
    }
    for row in &rows {
        if let Err(e) = put_back(&mut golden, row) {
            failures.push(format!("{scenario}: {e}"));
        }
    }
    failures.extend(json_differences(&golden, last).into_iter().map(|d| {
        format!(
            "{scenario}: {}: expected {}, got {}",
            d.pointer, d.expected, d.actual
        )
    }));
    (!failures.is_empty()).then(|| failures.join("\n"))
}

#[test]
fn each_capture_projects_to_its_golden_twice_the_same() {
    let all = scenarios();
    assert_eq!(44, all.len(), "the manifest's scenarios");
    for row in &PENDING_6DR2 {
        assert!(
            all.iter().any(|s| s == row.scenario),
            "pending row {} names {}, which the manifest does not list",
            row.pointer,
            row.scenario
        );
    }
    let failures: Vec<String> = all.iter().filter_map(|s| check(s, &PENDING_6DR2)).collect();
    assert!(
        failures.is_empty(),
        "{} of {} scenarios differ:\n{}",
        failures.len(),
        all.len(),
        failures.join("\n")
    );
}

/// 01's model: no production row is there, and the tree gives the golden's value.
const MODEL_01: &str = "/threads/byId/thread-1/session/model";

/// A row the tests alone use, so R2 can delete any production row without touching them. Its
/// previous value is one 01's golden and tree never hold.
const TEST_ROW: Pending = Pending {
    scenario: "01-baseline-text",
    pointer: MODEL_01,
    before: Before::Json(r#""closta-test-model""#),
    commit: "none",
    r2_task: "none",
};

/// The production table with no row at `MODEL_01`.
fn table_without_the_test_row() -> Vec<Pending> {
    let table = PENDING_6DR2.to_vec();
    assert!(
        table.iter().all(|p| p.pointer != MODEL_01),
        "a production row is at {MODEL_01}"
    );
    table
}

#[test]
fn a_pending_row_no_longer_used_fails() {
    let mut table = table_without_the_test_row();
    assert_eq!(None, check(TEST_ROW.scenario, &table), "01 passes as it is");

    // What an R2 task leaves behind when it ports a feature and keeps the row: the tree gives the
    // golden's value at the pointer, so the row lets nothing through.
    table.push(TEST_ROW);
    let failure = check(TEST_ROW.scenario, &table).expect("a row the tree does not need fails");
    assert!(
        failure.contains(&format!("{MODEL_01} is not used")),
        "{failure}"
    );
}

#[test]
fn a_difference_outside_the_table_fails() {
    let table = table_without_the_test_row();
    let last = last_tree(TEST_ROW.scenario).expect("01's last tree");
    let golden = read_golden(TEST_ROW.scenario).expect("01's golden");
    assert_eq!(
        None,
        compare(TEST_ROW.scenario, golden.clone(), &last, &table),
        "01 passes as it is"
    );

    // The golden now differs from the tree at a pointer no row of the table holds.
    let mut differing = golden;
    put_back(&mut differing, &TEST_ROW).expect("01's golden has a model");
    let failure = compare(TEST_ROW.scenario, differing, &last, &table)
        .expect("a difference the table does not hold fails");
    assert!(
        failure.contains(&format!("{MODEL_01}: expected \"closta-test-model\"")),
        "{failure}"
    );
}
