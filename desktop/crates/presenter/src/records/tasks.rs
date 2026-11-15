//! The running list above the composer: what runs in the background, read from the CLI's own
//! lists (RunningTasks.kt). The fold keeps the last list whole (the CLI replaces it every time)
//! and the last progress of each.

use std::sync::Arc;

use closta_model::AgentEvent;
use imbl::HashMap;
use serde_json::Value;

use crate::json::{JsonFields, parse};
use crate::transcript::Transcript;

/// One entry of `background_tasks_changed`'s `tasks[]`.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct BackgroundTaskRecord {
    pub task_id: String,
    pub task_type: String,
    pub description: String,
    pub subagent_type: Option<String>,
    pub parent_task_id: Option<String>,
    pub ambient: bool,
}

/// The last `task_progress` of a task: its last tool and the time it had run then.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct TaskProgressRecord {
    pub last_tool_name: String,
    pub duration_ms: Option<i64>,
    pub tool_use_id: Option<String>,
}

#[derive(Clone, PartialEq, Eq, Debug, Default)]
pub struct BackgroundTasks {
    pub live: Arc<[BackgroundTaskRecord]>,
    pub progress: HashMap<String, TaskProgressRecord>,
    /// The `tool_use_id` of the call that started each task, from `task_started`.
    pub tool_use_ids: HashMap<String, String>,
}

/// A row of the running list. `kind` is `agent`, `shell`, or the CLI's own `task_type` for
/// anything else.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct RunningTask {
    pub task_id: String,
    pub title: String,
    pub kind: String,
    pub detail: Option<String>,
    pub depth: i32,
    pub elapsed_ms: Option<i64>,
    pub tool_use_id: Option<String>,
}

/// The tools that start a subagent.
pub const AGENT_TOOLS: [&str; 2] = ["Agent", "Task"];

/// Folds the CLI's lists of what runs in the background (`foldBackground`): the whole list of
/// `background_tasks_changed`, the last `task_progress` of each task, and the call `task_started`
/// names. Any other event, or a list that cannot be read, changes nothing.
pub fn fold_background(transcript: &Arc<Transcript>, event: &AgentEvent) -> Arc<Transcript> {
    let now = &transcript.background;
    let next = match event {
        AgentEvent::SystemBackgroundTasksChanged { tasks, .. } => {
            tasks_of(&tasks.0).map(|live| BackgroundTasks {
                live,
                ..now.clone()
            })
        }
        AgentEvent::SystemTaskProgress {
            task_id,
            last_tool_name,
            usage,
            tool_use_id,
            ..
        } => {
            let duration_ms = parse(&usage.0)
                .as_ref()
                .and_then(Value::as_object)
                .and_then(|it| it.get("duration_ms"))
                .and_then(Value::as_i64);
            let record = TaskProgressRecord {
                last_tool_name: last_tool_name.clone(),
                duration_ms,
                tool_use_id: tool_use_id.clone(),
            };
            Some(BackgroundTasks {
                progress: now.progress.update(task_id.clone(), record),
                ..now.clone()
            })
        }
        AgentEvent::SystemTaskStarted {
            task_id,
            tool_use_id,
            ..
        } => Some(BackgroundTasks {
            tool_use_ids: now
                .tool_use_ids
                .update(task_id.clone(), tool_use_id.clone()),
            ..now.clone()
        }),
        _ => None,
    };
    match next {
        Some(background) => Arc::new(Transcript {
            background,
            ..Transcript::clone(transcript)
        }),
        None => Arc::clone(transcript),
    }
}

fn tasks_of(text: &str) -> Option<Arc<[BackgroundTaskRecord]>> {
    let Some(Value::Array(items)) = parse(text) else {
        return None;
    };
    Some(
        items
            .iter()
            .filter_map(|item| {
                let task = item.as_object()?;
                Some(BackgroundTaskRecord {
                    task_id: task.string("task_id")?.to_owned(),
                    task_type: task.string("task_type").unwrap_or_default().to_owned(),
                    description: task.string("description").unwrap_or_default().to_owned(),
                    subagent_type: task.string("subagent_type").map(str::to_owned),
                    parent_task_id: task.string("parent_task_id").map(str::to_owned),
                    ambient: task.get("ambient").and_then(Value::as_bool) == Some(true),
                })
            })
            .collect(),
    )
}
