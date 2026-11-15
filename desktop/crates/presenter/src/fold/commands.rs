//! The slash commands the transcript keeps, folded from the two lines that carry them
//! (CommandsFold.kt).

use std::sync::Arc;

use closta_model::RawJson;
use serde_json::Value;

use crate::json::{JsonFields, parse};
use crate::records::composer::{SlashCommands, commands_of_init, commands_of_response};
use crate::records::operations::{OperationRecords, models_of_response};
use crate::transcript::Transcript;

const SUCCESS: &str = "success";

/// The `initialize` response carries the slash commands with their descriptions; it replaces any
/// list. A response of another kind, an error, or one with no commands leaves the transcript as it
/// was.
pub(crate) fn fold_commands_of_response(
    transcript: &Arc<Transcript>,
    response: &RawJson,
    subtype: Option<&str>,
) -> Arc<Transcript> {
    let response = if subtype == Some(SUCCESS) {
        parse(&response.0)
    } else {
        None
    };
    let response = response.as_ref();
    let with_commands = match commands_of_response(response) {
        Some(items) => with_commands(
            transcript,
            SlashCommands {
                items,
                detailed: true,
            },
        ),
        None => Arc::clone(transcript),
    };
    // The same response lists the models; one that lists none leaves the ones the transcript has.
    let models = models_of_response(response).filter(|it| !it.is_empty());
    // And the permission mode the CLI starts in, shown before `system/init` says what the session
    // runs.
    let mode = permission_mode_of_response(response);
    if models.is_none() && mode.is_none() {
        return with_commands;
    }
    let operations = &with_commands.operations;
    let updated = OperationRecords {
        models: models.unwrap_or_else(|| Arc::clone(&operations.models)),
        start_permission_mode: mode.or_else(|| operations.start_permission_mode.clone()),
        ..OperationRecords::clone(operations)
    };
    if updated == **operations {
        with_commands
    } else {
        Arc::new(Transcript {
            operations: Arc::new(updated),
            ..Transcript::clone(&with_commands)
        })
    }
}

/// `system/init` names the commands only; it is used while no `initialize` response has given the
/// list.
pub(crate) fn fold_commands_of_init(
    transcript: &Arc<Transcript>,
    slash_commands: &RawJson,
) -> Arc<Transcript> {
    if transcript.commands.detailed {
        return Arc::clone(transcript);
    }
    match commands_of_init(parse(&slash_commands.0).as_ref()) {
        Some(items) => with_commands(
            transcript,
            SlashCommands {
                items,
                detailed: false,
            },
        ),
        None => Arc::clone(transcript),
    }
}

fn with_commands(transcript: &Arc<Transcript>, commands: SlashCommands) -> Arc<Transcript> {
    if transcript.commands == commands {
        Arc::clone(transcript)
    } else {
        Arc::new(Transcript {
            commands,
            ..Transcript::clone(transcript)
        })
    }
}

/// The permission mode of an `initialize` response (`response.response.current_permission_mode`),
/// or `None` when it has none. The SDK's type does not declare it; the captures do, and the capture
/// wins.
fn permission_mode_of_response(response: Option<&Value>) -> Option<String> {
    response?
        .as_object()?
        .obj("response")?
        .string("current_permission_mode")
        .filter(|it| !it.is_empty())
        .map(str::to_owned)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_initialize_response_gives_the_models_and_the_starting_mode_and_one_without_them_keeps_them()
     {
        let body = concat!(
            r#"{"response":{"current_permission_mode":"plan","models":[{"value":"opus","displayName":"Opus","#,
            r#""supportsEffort":true,"supportedEffortLevels":["low","",3]},{"value":""},{"value":"haiku"}]}}"#
        );

        let told = fold_commands_of_response(&Arc::default(), &RawJson(body.into()), Some(SUCCESS));
        let again = fold_commands_of_response(
            &told,
            &RawJson(r#"{"response":{"models":[]}}"#.into()),
            Some(SUCCESS),
        );
        let refused = fold_commands_of_response(&told, &RawJson(body.into()), Some("error"));

        let operations = &told.operations;
        assert_eq!(Some("plan"), operations.start_permission_mode.as_deref());
        assert_eq!(
            vec![("opus", "Opus"), ("haiku", "haiku")],
            operations
                .models
                .iter()
                .map(|it| (it.value.as_str(), it.display_name.as_str()))
                .collect::<Vec<_>>()
        );
        assert_eq!(Some(true), operations.models[0].supports_effort);
        assert_eq!(
            Some(vec!["low".to_owned()]),
            operations.models[0]
                .supported_effort_levels
                .as_deref()
                .map(<[String]>::to_vec)
        );
        assert!(Arc::ptr_eq(&told, &again), "no models and no mode");
        assert!(Arc::ptr_eq(&told, &refused), "an error says nothing");
    }
}
