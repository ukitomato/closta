//! What the MCP console shows, kept next to the operations: the servers the CLI last listed
//! (`mcp_status`) (McpServerRecord.kt). The answer's `config` and `serverInfo` are never read, so
//! nothing of them can reach a record, a tree or a log.

use std::sync::Arc;

use closta_model::RawJson;
use serde_json::{Map, Value};

use crate::json::{JsonFields, parse};
use crate::records::operations::{OperationRecords, SwitchKind, SwitchRecord, without};
use crate::text::{kt_lines, kt_trim, take_utf16};

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

impl McpServerRecord {
    /// Whether this is the host's own in-process server: the CLI says `sdk`, or it is a name the
    /// host declared.
    pub fn is_built_in(&self, declared: &[String]) -> bool {
        self.source == MCP_SOURCE_SDK || declared.contains(&self.name)
    }
}

/// What the CLI's answer to `mcp_status` says, or `None` when it is not an answer to read (no
/// `mcpServers` array). A server with no name is left out; a state the host does not know is
/// [`MCP_UNKNOWN`].
pub(crate) fn mcp_servers_of(body: Option<&Map<String, Value>>) -> Option<Arc<[McpServerRecord]>> {
    let servers = body?.array("mcpServers")?;
    let non_empty = |text: Option<&str>| text.filter(|it| !it.is_empty()).map(str::to_owned);
    Some(
        servers
            .iter()
            .filter_map(|item| {
                let fields = item.as_object()?;
                let name = non_empty(fields.string("name"))?;
                Some(McpServerRecord {
                    name,
                    status: fields
                        .string("status")
                        .filter(|it| MCP_STATUSES.contains(it))
                        .unwrap_or(MCP_UNKNOWN)
                        .to_owned(),
                    source: non_empty(fields.string("source"))
                        .unwrap_or_else(|| fields.string("scope").unwrap_or_default().to_owned()),
                    tools: fields
                        .array("tools")
                        .map(|tools| {
                            tools
                                .iter()
                                .filter_map(|it| non_empty(it.as_object()?.string("name")))
                                .take(MAX_MCP_TOOLS)
                                .collect()
                        })
                        .unwrap_or_else(|| Arc::from([])),
                    error: fields
                        .string("error")
                        .map(mcp_sentence)
                        .filter(|it| !it.is_empty()),
                })
            })
            .take(MAX_MCP_SERVERS)
            .collect(),
    )
}

/// A sentence of an MCP failure made safe to show and keep: the first line only, each URL in it
/// without its userinfo (what stands before an `@` in the authority) and without its query and
/// fragment (what stands after the first `?` or `#`: where a token may be), and then at most
/// [`MAX_MCP_SENTENCE_CHARS`] UTF-16 units. The URLs are cleaned before the cut, so a cut cannot
/// leave the front of a secret that the cleaning would have recognised by its end. One function
/// for every sentence that comes from the CLI's errors: the list's `error`, a refusal of a switch,
/// and a control error's notice.
pub fn mcp_sentence(text: &str) -> String {
    let first_line = kt_lines(kt_trim(text)).next().unwrap_or_default();
    take_utf16(&clean_urls(first_line), MAX_MCP_SENTENCE_CHARS).to_owned()
}

const SCHEME_MARK: &str = "://";

fn is_scheme_char(c: u8) -> bool {
    c.is_ascii_alphanumeric() || matches!(c, b'+' | b'.' | b'-')
}

/// Where a URL's text ends: Java's `\s` and the quotes and brackets McpServerRecord.kt's
/// `[^\s"'<>)\]]` stops at.
fn ends_url(c: char) -> bool {
    matches!(
        c,
        ' ' | '\t' | '\n' | '\u{b}' | '\u{c}' | '\r' | '"' | '\'' | '<' | '>' | ')' | ']'
    )
}

/// Each match of McpServerRecord.kt's `[A-Za-z][A-Za-z0-9+.\-]*://[^\s"'<>)\]]*`, leftmost first,
/// replaced by [`clean_url`] of it. The scheme cannot hold `:`, so a match ends its scheme at the
/// `://` it reaches, and starts at the first letter of the run of scheme characters before that.
fn clean_urls(line: &str) -> String {
    let bytes = line.as_bytes();
    let mut out = String::with_capacity(line.len());
    let mut done = 0;
    let mut search = 0;
    while let Some(found) = line[search..].find(SCHEME_MARK) {
        let mark = search + found;
        let mut run = mark;
        while run > done && is_scheme_char(bytes[run - 1]) {
            run -= 1;
        }
        let Some(start) = (run..mark).find(|at| bytes[*at].is_ascii_alphabetic()) else {
            search = mark + 1;
            continue;
        };
        let body = mark + SCHEME_MARK.len();
        let end = line[body..]
            .find(ends_url)
            .map_or(line.len(), |at| body + at);
        out.push_str(&line[done..start]);
        out.push_str(&clean_url(&line[start..end]));
        done = end;
        search = end.max(body);
    }
    out.push_str(&line[done..]);
    out
}

// The userinfo goes first: what stands after the scheme up to the last `@` of the URL's whole
// lexical token, whatever it holds (a userinfo may carry a raw `/`, `?` or `#`, so the authority
// cannot be found by those). Then the query and fragment: what stands after the first `?` or `#`
// of what is left. A URL that has an `@` only in its path or query loses its host as well: the
// cleaning errs on the side of showing less.
fn clean_url(url: &str) -> String {
    let scheme_end = url.find(SCHEME_MARK).map_or(0, |at| at + SCHEME_MARK.len());
    let rest = &url[scheme_end..];
    let rest = rest.rfind('@').map_or(rest, |at| &rest[at + 1..]);
    let query_at = rest.find(['?', '#']).unwrap_or(rest.len());
    format!("{}{}", &url[..scheme_end], &rest[..query_at])
}

impl OperationRecords {
    /// The answer to a status request: a list replaces the last one; an error, or a body that is
    /// no list, keeps it.
    pub(crate) fn mcp_answered(&self, id: &str, response: &RawJson, succeeded: bool) -> Self {
        let parsed = parse(&response.0);
        let body = parsed
            .as_ref()
            .and_then(Value::as_object)
            .and_then(|it| it.obj("response"));
        let read = if succeeded {
            mcp_servers_of(body)
        } else {
            None
        };
        let mcp_waiting = without(&self.mcp_waiting, id);
        match read {
            None => Self {
                mcp_waiting,
                mcp_unreadable: true,
                ..self.clone()
            },
            Some(servers) => Self {
                mcp_waiting,
                mcp_servers: Some(servers),
                mcp_unreadable: false,
                ..self.clone()
            },
        }
    }

    /// What an applied switch of an MCP server does to the last list, until the list asked for
    /// again comes: the host writes the state the CLI measured after the same request (capture 24:
    /// disabled after a turn off, connected after a turn on), so the screen does not go back to the
    /// state before the press. A turn off makes the server `disabled`, without its tools and its
    /// sentence; a turn on makes a `disabled` one `pending` (connecting). A reconnect, a name the
    /// list does not have, and a list not yet answered change nothing.
    pub(crate) fn mcp_switch_applied(&self, record: &SwitchRecord) -> Self {
        let Some(listed) = &self.mcp_servers else {
            return self.clone();
        };
        let written: Arc<[McpServerRecord]> = listed
            .iter()
            .map(|server| {
                let state = match record.kind {
                    _ if server.name != record.value => None,
                    SwitchKind::McpDisable => Some("disabled"),
                    SwitchKind::McpEnable if server.status == "disabled" => Some("pending"),
                    _ => None,
                };
                state.map_or_else(
                    || server.clone(),
                    |status| McpServerRecord {
                        status: status.to_owned(),
                        tools: Arc::from([]),
                        error: None,
                        ..server.clone()
                    },
                )
            })
            .collect();
        if written == *listed {
            self.clone()
        } else {
            Self {
                mcp_servers: Some(written),
                ..self.clone()
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Each case is what the regex `[A-Za-z][A-Za-z0-9+.\-]*://[^\s"'<>)\]]*` matches, leftmost
    // first, with each match cleaned.

    #[test]
    fn a_scheme_starts_at_its_first_letter_so_leading_digits_stay_outside_the_url() {
        assert_eq!("a 9http://x b", mcp_sentence("a 9http://u@x?q b"));
    }

    #[test]
    fn a_run_with_no_letter_is_no_scheme_and_stays_as_it_is() {
        assert_eq!("see 1-2://u@x?q now", mcp_sentence("see 1-2://u@x?q now"));
    }

    #[test]
    fn two_urls_on_one_line_are_each_cleaned() {
        assert_eq!(
            "a https://h/x and ftp://g/y end",
            mcp_sentence("a https://u@h/x?q and ftp://p@g/y#f end")
        );
    }

    #[test]
    fn a_url_ends_at_a_closing_bracket_or_a_quote() {
        assert_eq!(
            r#"(https://h/x) [https://h/y] 'https://h/z' "https://h/w""#,
            mcp_sentence(r#"(https://h/x?q) [https://h/y?q] 'https://h/z?q' "https://h/w?q""#)
        );
    }

    #[test]
    fn a_scheme_right_after_a_non_ascii_character_starts_at_its_letter() {
        assert_eq!("éhttps://h/x", mcp_sentence("éhttps://u@h/x?q"));
    }
}
