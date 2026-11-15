//! What a thread says besides its messages, and how the tree spells it (ThreadExtras.kt): the
//! thread, session, usage, notices, tasks, slash commands and file search, with the history
//! (HistoryRecords.kt's `savedSessionsNode`) and the MCP servers (McpServerRecord.kt's
//! `mcpServersNode` and `putMcp`). What it is made from is ProjectionMemo.kt's `Context.extras`.

use closta_model::{ConversationState, Notice, NoticeKind, SessionInfo, Task, TaskStatus, Usage};
use closta_presenter::keyed::{claim_key, of_cli_id};
use closta_presenter::records::composer::{FileSearchRecord, SlashCommandRecord};
use closta_presenter::records::history::{
    HISTORY_UNAVAILABLE_TEXT, HistoryFacts, SavedSessionRecord,
};
use closta_presenter::records::mcp::{McpServerRecord, mcp_sentence};
use closta_presenter::records::operations::TokenTotals;
use closta_presenter::transcript::Transcript;
use serde_json::{Map, Number, Value, json};

use super::nodes::collection_node;
use super::operations::{compactions_node, context_node, models_node, rewind_node, switches_node};

/// What a thread says besides its messages: each is `None` while there is nothing to say (no
/// session yet, no notice, no task), and the thread then has no such key.
#[derive(Clone, Debug, Default)]
pub(crate) struct ThreadExtras {
    pub session: Option<Value>,
    pub usage: Option<Value>,
    pub notices: Option<Value>,
    pub tasks: Option<Value>,
    pub commands: Option<Value>,
    pub file_search: Option<Value>,
    pub models: Option<Value>,
    pub start_permission_mode: Option<String>,
    pub switches: Option<Value>,
    pub context: Option<Value>,
    pub rewind: Option<Value>,
    pub compactions: Option<Value>,
    pub compacting: bool,
    pub effort: Option<String>,
    pub applied_model: Option<String>,
    pub saved_sessions: Option<Value>,
    pub saved_sessions_unreadable: bool,
    pub restored_until: Option<String>,
    pub restored_count: Option<i32>,
    pub restored_partly: bool,
    pub mcp_servers: Option<Value>,
    pub mcp_servers_unreadable: bool,
}

/// What the thread says besides its messages, from core's state and the transcript. The count of
/// numbers given and the requests waiting for an answer are the transcript's own and not in the
/// tree, so nothing here reads them.
pub(crate) fn extras(conversation: &ConversationState, transcript: &Transcript) -> ThreadExtras {
    let operations = &transcript.operations;
    let history = HistoryFacts::of(transcript);
    // A record that could not be read is the first notice, ahead of the CLI's: the CLI's come
    // later, and a notice is keyed by its place, so a place taken at the start never moves.
    let history_notice = history.unavailable.then(|| Notice {
        kind: NoticeKind::Error,
        message: HISTORY_UNAVAILABLE_TEXT.to_owned(),
        request_id: None,
    });
    let notices: Vec<&Notice> = history_notice
        .iter()
        .chain(conversation.notices.iter())
        .collect();
    ThreadExtras {
        session: conversation.session.as_ref().map(session_node),
        // The cost is the session's: with none there is no total to show.
        usage: conversation
            .session
            .as_ref()
            .map(|_| usage_node(&conversation.usage, operations.tokens.as_ref())),
        notices: (!notices.is_empty()).then(|| notices_node(&notices)),
        tasks: (!conversation.tasks.is_empty()).then(|| tasks_node(&conversation.tasks)),
        commands: (!transcript.commands.items.is_empty())
            .then(|| commands_node(&transcript.commands.items)),
        file_search: transcript.file_search.as_ref().map(file_search_node),
        models: (!operations.models.is_empty()).then(|| models_node(&operations.models)),
        start_permission_mode: operations.start_permission_mode.clone(),
        switches: (!operations.switches.is_empty())
            .then(|| switches_node(operations.switches.iter())),
        context: operations.context.as_ref().map(context_node),
        rewind: operations.rewind.as_ref().map(rewind_node),
        compactions: (!operations.compactions.is_empty())
            .then(|| compactions_node(operations.compactions.iter())),
        compacting: operations.compacting,
        effort: operations.effort.clone(),
        applied_model: operations.applied_model.clone(),
        saved_sessions: history.saved_sessions.as_deref().map(saved_sessions_node),
        saved_sessions_unreadable: history.saved_sessions_unreadable,
        restored_until: history.restored.as_ref().map(|it| it.until.clone()),
        restored_count: history.restored.as_ref().map(|it| it.count),
        restored_partly: history.restored.as_ref().is_some_and(|it| it.partly),
        mcp_servers: operations
            .mcp_servers
            .as_deref()
            .map(|servers| mcp_servers_node(servers, &operations.built_in_mcp_servers)),
        mcp_servers_unreadable: operations.mcp_unreadable,
    }
}

pub(crate) fn thread_node(
    id: &str,
    is_running: bool,
    messages: Value,
    extras: ThreadExtras,
) -> Value {
    let mut node = Map::new();
    node.insert("id".into(), id.into());
    node.insert("isRunning".into(), is_running.into());
    node.insert("messages".into(), messages);
    let mut put = |key: &str, value: Option<Value>| {
        if let Some(value) = value {
            node.insert(key.into(), value);
        }
    };
    put("session", extras.session);
    put("usage", extras.usage);
    put("notices", extras.notices);
    put("tasks", extras.tasks);
    put("commands", extras.commands);
    put("fileSearch", extras.file_search);
    put("models", extras.models);
    put(
        "startPermissionMode",
        extras.start_permission_mode.map(Value::String),
    );
    put("switches", extras.switches);
    put("context", extras.context);
    put("compactions", extras.compactions);
    // Always there, true or false: a key that goes away is an op that sets the whole thread again
    // (the differ has none that removes a key), and compacting comes and goes.
    put("compacting", Some(extras.compacting.into()));
    put("effort", extras.effort.map(Value::String));
    // The history. Each is there only once it is true or known. The list comes once and is
    // replaced; the three that say what was put back come once, when the session is resumed, and
    // stay.
    put("savedSessions", extras.saved_sessions);
    put(
        "savedSessionsUnreadable",
        flag(extras.saved_sessions_unreadable),
    );
    put("restoredUntil", extras.restored_until.map(Value::String));
    put("restoredCount", extras.restored_count.map(Value::from));
    put("restoredPartly", flag(extras.restored_partly));
    // The MCP servers (`putMcp`): the list comes with an answer and is replaced; the flag is there
    // only while the last ask was not read.
    put("mcpServers", extras.mcp_servers);
    put("mcpServersUnreadable", flag(extras.mcp_servers_unreadable));
    // The last rewind of the files, after every key that was there before it.
    put("rewind", extras.rewind);
    // The model the CLI says it uses, after the rewind.
    put("appliedModel", extras.applied_model.map(Value::String));
    Value::Object(node)
}

/// `true` when it is set; a flag that is not set is left out.
fn flag(set: bool) -> Option<Value> {
    set.then_some(Value::Bool(true))
}

fn session_node(session: &SessionInfo) -> Value {
    json!({
        "model": session.model,
        "permissionMode": session.permission_mode,
        "cwd": session.cwd,
        "version": session.version,
    })
}

/// The session's running total in USD; a figure that is not finite reads as 0. With `tokens` the
/// node also says how many tokens the session has used, a running total as the cost is.
fn usage_node(usage: &Usage, tokens: Option<&TokenTotals>) -> Value {
    let cost = Number::from_f64(usage.session_cost_usd)
        .or_else(|| Number::from_f64(0.0))
        .map_or(Value::Null, Value::Number);
    let mut node = Map::new();
    node.insert("costUsd".into(), cost);
    if let Some(tokens) = tokens {
        node.insert("inputTokens".into(), tokens.input.into());
        node.insert("outputTokens".into(), tokens.output.into());
        node.insert("cacheReadInputTokens".into(), tokens.cache_read.into());
        node.insert(
            "cacheCreationInputTokens".into(),
            tokens.cache_creation.into(),
        );
    }
    Value::Object(node)
}

/// The notices in the order they came, each keyed `notice-N` by its place in that order (N from 1).
fn notices_node(notices: &[&Notice]) -> Value {
    let entries = notices
        .iter()
        .enumerate()
        .map(|(index, notice)| {
            let key = format!("notice-{}", index + 1);
            let control_error = notice.kind == NoticeKind::ControlError;
            let mut node = Map::new();
            node.insert("id".into(), key.as_str().into());
            node.insert(
                "kind".into(),
                if control_error {
                    "control-error"
                } else {
                    "error"
                }
                .into(),
            );
            // A control error's sentence is the CLI's own and may name a server by its URL: it is
            // made as an MCP sentence is, whatever the request was.
            let text = if control_error {
                mcp_sentence(&notice.message)
            } else {
                notice.message.clone()
            };
            node.insert("text".into(), text.into());
            if let Some(request_id) = &notice.request_id {
                node.insert("requestId".into(), request_id.as_str().into());
            }
            (key, Value::Object(node))
        })
        .collect();
    collection_node(entries)
}

/// The tasks in the order they came, each keyed as the CLI's id is ([`of_cli_id`]); `toolCallId`
/// is the key of the tool call part that started it (the same function), so it names that part.
fn tasks_node(tasks: &imbl::Vector<Task>) -> Value {
    let mut keys: Vec<String> = Vec::new();
    let mut entries = Vec::new();
    for task in tasks {
        let key = claim_key(
            |taken| keys.iter().any(|it| it == taken),
            &of_cli_id(&task.task_id),
        );
        keys.push(key.clone());
        let mut node = Map::new();
        node.insert("id".into(), key.as_str().into());
        if let Some(parent) = &task.parent_tool_use_id {
            node.insert("toolCallId".into(), of_cli_id(parent).into());
        }
        if let Some(agent) = &task.subagent_type {
            node.insert("agentType".into(), agent.as_str().into());
        }
        node.insert("background".into(), task.is_backgrounded.into());
        let status = match task.status {
            TaskStatus::Running => "running",
            TaskStatus::Complete => "complete",
            TaskStatus::Incomplete => "incomplete",
        };
        node.insert("status".into(), status.into());
        if task.status == TaskStatus::Incomplete
            && let Some(reason) = &task.incomplete_reason
        {
            node.insert("reason".into(), reason.as_str().into());
        }
        entries.push((key, Value::Object(node)));
    }
    collection_node(entries)
}

/// The slash commands, in the CLI's order: the name, the sentence (empty when only names are
/// known) and the hint.
fn commands_node(commands: &[SlashCommandRecord]) -> Value {
    commands
        .iter()
        .map(|command| {
            let mut node = Map::new();
            node.insert("name".into(), command.name.as_str().into());
            node.insert("description".into(), command.description.as_str().into());
            if let Some(hint) = &command.argument_hint {
                node.insert("argumentHint".into(), hint.as_str().into());
            }
            Value::Object(node)
        })
        .collect()
}

/// The last answer to the webview's file query; `commandId` is the webview's own command id.
fn file_search_node(search: &FileSearchRecord) -> Value {
    let mut node = Map::new();
    node.insert("commandId".into(), search.command_id.as_str().into());
    node.insert("match".into(), search.r#match.as_str().into());
    let paths: Vec<Value> = search
        .paths
        .iter()
        .map(|it| Value::String(it.clone()))
        .collect();
    node.insert("paths".into(), paths.into());
    node.insert("truncated".into(), search.truncated.into());
    if let Some(failure) = &search.failure {
        node.insert("failure".into(), failure.as_str().into());
    }
    Value::Object(node)
}

/// The saved sessions, newest first as the host listed them.
fn saved_sessions_node(sessions: &[SavedSessionRecord]) -> Value {
    sessions
        .iter()
        .map(|record| {
            json!({
                "id": record.id,
                "title": record.title,
                "updatedAt": record.updated_at_ms,
                "current": record.current,
            })
        })
        .collect()
}

/// The servers of an answer, as the tree spells them; `declared` are the host's own in-process
/// servers' names.
fn mcp_servers_node(servers: &[McpServerRecord], declared: &[String]) -> Value {
    servers
        .iter()
        .map(|server| {
            let tools: Vec<Value> = server
                .tools
                .iter()
                .map(|it| Value::String(it.clone()))
                .collect();
            let mut node = Map::new();
            node.insert("name".into(), server.name.as_str().into());
            node.insert("status".into(), server.status.as_str().into());
            node.insert("source".into(), server.source.as_str().into());
            node.insert("builtIn".into(), server.is_built_in(declared).into());
            node.insert("tools".into(), tools.into());
            if let Some(error) = &server.error {
                node.insert("error".into(), error.as_str().into());
            }
            Value::Object(node)
        })
        .collect()
}
