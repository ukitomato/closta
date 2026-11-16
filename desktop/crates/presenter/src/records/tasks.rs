//! The running list above the composer: what runs in the background, read from the CLI's own
//! lists (RunningTasks.kt). The fold keeps the last list whole (the CLI replaces it every time)
//! and the last progress of each.

use std::collections::{HashMap as StdHashMap, HashSet};
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

/// What a row says for the CLI's own `task_type`; any other type is said as it is.
fn kind_of(task_type: &str) -> &str {
    match task_type {
        "local_agent" => "agent",
        "local_bash" => "shell",
        other => other,
    }
}

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

/// What runs now, parents first and each child right under its parent, one step further in.
/// Ambient tasks (watchers, not activity) are left out; a parent the list does not hold is no
/// parent.
pub fn running_tasks(transcript: &Transcript) -> Vec<RunningTask> {
    let background = &transcript.background;
    let shown: Vec<&BackgroundTaskRecord> =
        background.live.iter().filter(|it| !it.ambient).collect();
    let ids: HashSet<&str> = shown.iter().map(|it| it.task_id.as_str()).collect();
    let is_listed = |task: &BackgroundTaskRecord| {
        task.parent_task_id
            .as_deref()
            .is_some_and(|parent| ids.contains(parent))
    };
    // Each parent's children in list order; the map is only looked up, never iterated.
    let mut children: StdHashMap<&str, Vec<&BackgroundTaskRecord>> = StdHashMap::new();
    for task in shown.iter().copied().filter(|it| is_listed(it)) {
        let parent = task.parent_task_id.as_deref().unwrap_or_default();
        children.entry(parent).or_default().push(task);
    }
    let mut placer = Placer {
        background,
        children: &children,
        placed: HashSet::new(),
        out: Vec::with_capacity(shown.len()),
    };
    for task in shown.iter().copied().filter(|it| !is_listed(it)) {
        placer.place(task, 0);
    }
    // A loop of parents (which the CLI should never send) still shows each task once.
    for task in shown.iter().copied() {
        placer.place(task, 0);
    }
    placer.out
}

struct Placer<'a> {
    background: &'a BackgroundTasks,
    children: &'a StdHashMap<&'a str, Vec<&'a BackgroundTaskRecord>>,
    placed: HashSet<&'a str>,
    out: Vec<RunningTask>,
}

impl<'a> Placer<'a> {
    // Depth first with an explicit stack, so a long chain of children cannot overflow the stack.
    fn place(&mut self, task: &'a BackgroundTaskRecord, depth: i32) {
        let mut stack = vec![(task, depth)];
        while let Some((task, depth)) = stack.pop() {
            if !self.placed.insert(task.task_id.as_str()) {
                continue;
            }
            let progress = self.background.progress.get(&task.task_id);
            self.out.push(RunningTask {
                task_id: task.task_id.clone(),
                title: task.description.clone(),
                kind: kind_of(&task.task_type).to_owned(),
                detail: progress.map(|it| it.last_tool_name.clone()),
                depth,
                elapsed_ms: progress.and_then(|it| it.duration_ms),
                tool_use_id: self
                    .background
                    .tool_use_ids
                    .get(&task.task_id)
                    .cloned()
                    .or_else(|| progress.and_then(|it| it.tool_use_id.clone())),
            });
            if let Some(children) = self.children.get(task.task_id.as_str()) {
                stack.extend(children.iter().rev().map(|child| (*child, depth + 1)));
            }
        }
    }
}
