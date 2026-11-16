//! What the MCP tab shows of the servers the CLI listed (McpRows.kt).

use std::collections::HashSet;

use crate::records::mcp::{MCP_UNKNOWN, McpServerRecord};
use crate::records::operations::{OperationRecords, SwitchOutcome};

/// One MCP server as the MCP tab shows it. Every value is the CLI's; the server's `config` was
/// never read, so it cannot be here. `status` is the CLI's word for the state; the screen finds
/// the words it shows for it.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct McpRow {
    pub name: String,
    pub status: String,
    pub tools: usize,
    pub error: Option<String>,
    pub can_toggle: bool,
    pub enabled: bool,
    pub can_reconnect: bool,
    pub needs_sign_in: bool,
    pub busy: bool,
}

/// What the MCP tab shows: nothing listed yet, a list that could not be read, or the rows.
#[derive(Clone, PartialEq, Eq, Debug)]
pub enum McpList {
    Waiting,
    Unreadable,
    /// The servers in the CLI's order. `stale` says the last ask could not be read, so these are
    /// the list before it; `notice` is the sentence of the last MCP switch when it was refused or
    /// failed.
    Rows {
        rows: Vec<McpRow>,
        stale: bool,
        notice: Option<String>,
    },
}

/// The MCP tab's list of `operations`.
pub fn mcp_list(operations: &OperationRecords) -> McpList {
    let Some(listed) = &operations.mcp_servers else {
        return if operations.mcp_unreadable {
            McpList::Unreadable
        } else {
            McpList::Waiting
        };
    };
    let mcp_switches = || operations.switches.iter().filter(|it| it.kind.is_mcp());
    let busy: HashSet<&str> = mcp_switches()
        .filter(|it| it.outcome == SwitchOutcome::Pending)
        .map(|it| it.value.as_str())
        .collect();
    let notice = mcp_switches()
        .last()
        .filter(|it| matches!(it.outcome, SwitchOutcome::Rejected | SwitchOutcome::Failed))
        .and_then(|it| it.detail.clone());
    McpList::Rows {
        rows: listed
            .iter()
            .map(|server| {
                row_of(
                    server,
                    server.is_built_in(&operations.built_in_mcp_servers),
                    busy.contains(server.name.as_str()),
                )
            })
            .collect(),
        stale: operations.mcp_unreadable,
        notice,
    }
}

fn row_of(server: &McpServerRecord, built_in: bool, busy: bool) -> McpRow {
    let free = !built_in && !busy;
    McpRow {
        name: server.name.clone(),
        status: server.status.clone(),
        tools: server.tools.len(),
        error: server.error.clone(),
        can_toggle: free && server.status != MCP_UNKNOWN,
        enabled: server.status != "disabled",
        can_reconnect: free && server.status != "needs-auth" && server.status != "disabled",
        needs_sign_in: server.status == "needs-auth",
        busy,
    }
}
