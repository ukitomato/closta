//! What the composer is offered, kept next to the transcript: the CLI's slash commands and the
//! last answer to the webview's file query (ComposerRecords.kt).

use std::fmt;
use std::sync::Arc;

/// One slash command the CLI has. `argument_hint` is absent when the CLI gave none (or an empty
/// one).
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct SlashCommandRecord {
    pub name: String,
    pub description: String,
    pub argument_hint: Option<String>,
}

/// The slash commands the thread shows. `detailed` says the list came from the `initialize`
/// response (name, description and hint); a list from `system/init` is names only. A detailed list
/// is never replaced by a names-only one.
#[derive(Clone, PartialEq, Eq, Debug, Default)]
pub struct SlashCommands {
    pub items: Arc<[SlashCommandRecord]>,
    pub detailed: bool,
}

/// The answer to the webview's last file query, `command_id` being the id the webview gave that
/// command. `failure` is the kind of failure ([`ComposerFailure`]) when the host could not list the
/// files; `paths` are relative to the project root. The query and the paths are the user's
/// project: `Debug` leaves them out.
#[derive(Clone, PartialEq, Eq, Default)]
pub struct FileSearchRecord {
    pub command_id: String,
    pub r#match: String,
    pub paths: Arc<[String]>,
    pub truncated: bool,
    pub failure: Option<String>,
}

impl fmt::Debug for FileSearchRecord {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "FileSearchRecord({} paths, failure={:?})",
            self.paths.len(),
            self.failure
        )
    }
}

/// The kinds of failure a file query can end with, as the tree names them.
pub struct ComposerFailure;

impl ComposerFailure {
    pub const UNAVAILABLE: &str = "unavailable";
    pub const FAILED: &str = "failed";
}
