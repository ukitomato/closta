//! How the tree spells what the operations console shows: the models, the switches, the context,
//! the compactions (OperationNodes.kt) and the last rewind (RewindRecords.kt's `rewindNode`).
//! The usage answer (`usage`, `usage_waiting`) has no node: the tree does not show it, as
//! ProjectionMemo.kt leaves it out.

use closta_presenter::records::operations::{
    CompactionRecord, ContextRecord, ModelRecord, SwitchRecord,
};
use closta_presenter::records::rewind::RewindRecord;
use serde_json::{Map, Number, Value, json};

fn strings(items: &[String]) -> Value {
    items.iter().map(|it| Value::String(it.clone())).collect()
}

/// The models the CLI offers, in its order.
pub(crate) fn models_node(models: &[ModelRecord]) -> Value {
    models
        .iter()
        .map(|model| {
            let mut node = Map::new();
            node.insert("value".into(), model.value.as_str().into());
            node.insert("displayName".into(), model.display_name.as_str().into());
            node.insert("description".into(), model.description.as_str().into());
            if let Some(resolved) = &model.resolved_model {
                node.insert("resolvedModel".into(), resolved.as_str().into());
            }
            if let Some(supports) = model.supports_effort {
                node.insert("supportsEffort".into(), supports.into());
            }
            if let Some(levels) = &model.supported_effort_levels {
                node.insert("supportedEffortLevels".into(), strings(levels));
            }
            Value::Object(node)
        })
        .collect()
}

/// The switches, the newest first (the records keep the order they came in).
pub(crate) fn switches_node<'a>(
    switches: impl DoubleEndedIterator<Item = &'a SwitchRecord>,
) -> Value {
    switches
        .rev()
        .map(|record| {
            let mut node = Map::new();
            node.insert("seq".into(), record.seq.into());
            node.insert("kind".into(), record.kind.wire().into());
            node.insert("value".into(), record.value.as_str().into());
            node.insert("outcome".into(), record.outcome.wire().into());
            if let Some(detail) = &record.detail {
                node.insert("detail".into(), detail.as_str().into());
            }
            Value::Object(node)
        })
        .collect()
}

/// The last context usage the CLI answered.
pub(crate) fn context_node(context: &ContextRecord) -> Value {
    let mut node = Map::new();
    node.insert("totalTokens".into(), context.total_tokens.into());
    node.insert("maxTokens".into(), context.max_tokens.into());
    node.insert("percentage".into(), percent(context.percentage));
    if let Some(threshold) = context.auto_compact_threshold {
        node.insert("autoCompactThreshold".into(), threshold.into());
    }
    Value::Object(node)
}

const MAX_EXACT: f64 = 1e15;

// A whole percentage prints as the integer the CLI sent; the double's own text would add ".0".
#[allow(clippy::cast_possible_truncation)] // whole and below 1e15: exact as an i64
fn percent(percentage: f64) -> Value {
    if percentage == percentage.floor() && percentage < MAX_EXACT {
        Value::from(percentage as i64)
    } else {
        Number::from_f64(percentage).map_or(Value::Null, Value::Number)
    }
}

/// The compactions, the newest first.
pub(crate) fn compactions_node<'a>(
    compactions: impl DoubleEndedIterator<Item = &'a CompactionRecord>,
) -> Value {
    compactions
        .rev()
        .map(|record| {
            json!({
                "seq": record.seq,
                "trigger": record.trigger,
                "preTokens": record.pre_tokens,
                "postTokens": record.post_tokens,
            })
        })
        .collect()
}

/// The tree's `rewind` of a thread. The host's marks (the request id, its place in the sends and
/// turns) stay out.
pub(crate) fn rewind_node(record: &RewindRecord) -> Value {
    let mut node = Map::new();
    node.insert("commandId".into(), record.command_id.as_str().into());
    node.insert("messageId".into(), record.message_id.as_str().into());
    node.insert("dryRun".into(), record.dry_run.into());
    node.insert("outcome".into(), record.outcome.wire().into());
    node.insert("files".into(), strings(&record.files));
    node.insert("filesTotal".into(), record.files_total.into());
    node.insert("insertions".into(), record.insertions.into());
    node.insert("deletions".into(), record.deletions.into());
    if let Some(detail) = &record.detail {
        node.insert("detail".into(), detail.as_str().into());
    }
    Value::Object(node)
}
