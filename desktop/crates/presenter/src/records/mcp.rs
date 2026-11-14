//! What the MCP console shows, kept next to the operations: the servers the CLI last listed
//! (`mcp_status`) (McpServerRecord.kt). The answer's `config` and `serverInfo` are never read, so
//! nothing of them can reach a record, a tree or a log.

use std::sync::Arc;

/// One MCP server as the CLI listed it. `status` is one of [`MCP_STATUSES`] or [`MCP_UNKNOWN`];
/// `source` is the CLI's `source`, else its `scope`, else empty (capture 24: both are `dynamic`);
/// `error` is a sentence already made safe to show and keep.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct McpServerRecord {
    pub name: String,
    pub status: String,
    pub source: String,
    pub tools: Arc<[String]>,
    pub error: Option<String>,
}

/// The states `McpServerStatus` names (sdk.d.ts 0.3.302), as the CLI writes them.
pub const MCP_STATUSES: [&str; 5] = ["connected", "failed", "needs-auth", "pending", "disabled"];

/// What a state the host does not know reads as.
pub const MCP_UNKNOWN: &str = "unknown";

/// The `source` that is the host's own in-process server (`sdk`, sdk.d.ts: "only the host can
/// register one").
pub const MCP_SOURCE_SDK: &str = "sdk";

/// The most servers kept of one answer.
pub const MAX_MCP_SERVERS: usize = 100;

/// The most tool names kept of one server.
pub const MAX_MCP_TOOLS: usize = 64;

/// The longest an MCP sentence is, in UTF-16 units (Kotlin's characters).
pub const MAX_MCP_SENTENCE_CHARS: usize = 200;
