//! What the operations console reads out of the CLI's lines (OperationReadings.kt): a
//! compaction, whether the CLI is compacting, the tokens of a result, and the models of the
//! `initialize` response. The records they fill are in [`operations`](crate::records::operations).

use std::sync::Arc;

use closta_model::RawJson;
use serde_json::{Map, Value};

use crate::json::{JsonFields, parse};
use crate::records::operations::{
    CompactionRecord, MAX_COMPACTIONS, ModelRecord, OperationRecords, TokenTotals, pushed,
};

pub(crate) const UNKNOWN_TRIGGER: &str = "unknown";
const COMPACTING: &str = "compacting";

impl OperationRecords {
    /// The compaction `system/compact_boundary` reports; a boundary that does not say how many
    /// tokens changes nothing.
    pub(crate) fn compacted(&self, compact_metadata: &RawJson) -> Self {
        let metadata = parse(&compact_metadata.0);
        let Some(metadata) = metadata.as_ref().and_then(Value::as_object) else {
            return self.clone();
        };
        let (Some(pre_tokens), Some(post_tokens)) =
            (metadata.count("pre_tokens"), metadata.count("post_tokens"))
        else {
            return self.clone();
        };
        let record = CompactionRecord {
            seq: self.next_seq(),
            trigger: metadata
                .string("trigger")
                .unwrap_or(UNKNOWN_TRIGGER)
                .to_owned(),
            pre_tokens,
            post_tokens,
        };
        Self {
            seq: record.seq,
            compactions: pushed(&self.compactions, record, MAX_COMPACTIONS),
            ..self.clone()
        }
    }

    /// Whether the CLI says it is compacting: from `system/status`, whose status is `compacting`
    /// only while it does. A status that only reports the permission mode (no status, a mode: what
    /// a mode switch is answered with, capture 07) says nothing of compacting, so a switch made
    /// meanwhile does not end it early.
    pub(crate) fn status_said(&self, status: Option<&str>, permission_mode: Option<&str>) -> Self {
        if status.is_none() && permission_mode.is_some() {
            return self.clone();
        }
        Self {
            compacting: status == Some(COMPACTING),
            ..self.clone()
        }
    }

    /// The tokens of a `result`: `modelUsage` is the session's total so far for each model, so the
    /// figures are summed over the models and replace the last ones, never added to them. A
    /// `result` that names no model says nothing of the total.
    pub(crate) fn resulted(&self, model_usage: &RawJson) -> Self {
        let usage = parse(&model_usage.0);
        let models: Vec<&Map<String, Value>> = usage
            .as_ref()
            .and_then(Value::as_object)
            .map(|it| it.values().filter_map(Value::as_object).collect())
            .unwrap_or_default();
        if models.is_empty() {
            return self.clone();
        }
        let sum = |key: &str| {
            models
                .iter()
                .map(|it| it.count(key).unwrap_or(0))
                .fold(0_i64, i64::wrapping_add)
        };
        Self {
            tokens: Some(TokenTotals {
                input: sum("inputTokens"),
                output: sum("outputTokens"),
                cache_read: sum("cacheReadInputTokens"),
                cache_creation: sum("cacheCreationInputTokens"),
            }),
            ..self.clone()
        }
    }
}

/// The models of an `initialize` response (`response.response.models`), or `None` when it has
/// none. A model without a `value` is left out; one without a display name
/// shows its value.
pub(crate) fn models_of_response(response: Option<&Value>) -> Option<Arc<[ModelRecord]>> {
    let models = response?.as_object()?.obj("response")?.array("models")?;
    let non_empty = |text: Option<&str>| text.filter(|it| !it.is_empty()).map(str::to_owned);
    Some(
        models
            .iter()
            .filter_map(|item| {
                let fields = item.as_object()?;
                let value = non_empty(fields.string("value"))?;
                Some(ModelRecord {
                    resolved_model: non_empty(fields.string("resolvedModel")),
                    display_name: non_empty(fields.string("displayName"))
                        .unwrap_or_else(|| value.clone()),
                    description: fields.string("description").unwrap_or_default().to_owned(),
                    supports_effort: fields.get("supportsEffort").and_then(Value::as_bool),
                    supported_effort_levels: fields.array("supportedEffortLevels").map(|levels| {
                        levels
                            .iter()
                            .filter_map(|it| non_empty(it.as_str()))
                            .collect()
                    }),
                    value,
                })
            })
            .collect(),
    )
}
