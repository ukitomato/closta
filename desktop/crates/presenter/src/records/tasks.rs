//! The running list above the composer: what runs in the background, read from the CLI's own
//! lists (RunningTasks.kt). The fold keeps the last list whole (the CLI replaces it every time)
//! and the last progress of each.

use std::sync::Arc;

use imbl::HashMap;

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
