//! What the composer is offered, kept next to the transcript: the CLI's slash commands and the
//! last answer to the webview's file query (ComposerRecords.kt).

use std::fmt;
use std::sync::Arc;

use serde_json::Value;

use crate::input::PresenterInput;
use crate::json::JsonFields;
use crate::records::turn_end::fold_turn_changes;
use crate::transcript::Transcript;

/// One slash command the CLI has. `argument_hint` is absent when the CLI gave none (or an empty
/// one).
///
/// The name, description and hint come from the CLI and the user's account, so `Debug` leaves
/// them out: it shows only the description's length and whether there is a hint.
#[derive(Clone, PartialEq, Eq)]
pub struct SlashCommandRecord {
    pub name: String,
    pub description: String,
    pub argument_hint: Option<String>,
}

impl fmt::Debug for SlashCommandRecord {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "SlashCommandRecord(description {} bytes, hint={})",
            self.description.len(),
            self.argument_hint.is_some()
        )
    }
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

/// The slash commands of an `initialize` response (`response.response.commands`), or `None` when it
/// has none. An entry without a name is left out; an empty hint is no hint.
pub(crate) fn commands_of_response(response: Option<&Value>) -> Option<Arc<[SlashCommandRecord]>> {
    let commands = response?.as_object()?.obj("response")?.array("commands")?;
    Some(commands_of(commands))
}

/// The slash commands in `items`, each an object with a name, a sentence and a hint; one with no
/// name is left out.
pub(crate) fn commands_of(items: &[Value]) -> Arc<[SlashCommandRecord]> {
    items
        .iter()
        .filter_map(|item| {
            let fields = item.as_object()?;
            let name = fields.string("name").filter(|it| !it.is_empty())?;
            Some(SlashCommandRecord {
                name: name.to_owned(),
                description: fields.string("description").unwrap_or_default().to_owned(),
                argument_hint: fields
                    .string("argumentHint")
                    .filter(|it| !it.is_empty())
                    .map(str::to_owned),
            })
        })
        .collect()
}

/// The names of a `system/init`'s `slash_commands`, or `None` when it has none.
pub(crate) fn commands_of_init(
    slash_commands: Option<&Value>,
) -> Option<Arc<[SlashCommandRecord]>> {
    Some(
        slash_commands?
            .as_array()?
            .iter()
            .filter_map(|item| {
                let name = item.as_str().filter(|it| !it.is_empty())?;
                Some(SlashCommandRecord {
                    name: name.to_owned(),
                    description: String::new(),
                    argument_hint: None,
                })
            })
            .collect(),
    )
}

/// What the host found: its answer to the webview's file query, the last one only, and what a turn
/// changed on disk, by the turn's user message. An answer equal to the one kept changes nothing.
pub(crate) fn fold_answered(
    transcript: &Arc<Transcript>,
    input: &PresenterInput,
) -> Arc<Transcript> {
    match input {
        PresenterInput::FilesFound(search) => {
            if transcript.file_search.as_ref() == Some(search) {
                Arc::clone(transcript)
            } else {
                Arc::new(Transcript {
                    file_search: Some(search.clone()),
                    ..Transcript::clone(transcript)
                })
            }
        }
        PresenterInput::TurnChangesFound(found) => fold_turn_changes(transcript, found),
        _ => Arc::clone(transcript),
    }
}
