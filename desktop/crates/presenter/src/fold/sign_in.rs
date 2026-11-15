//! Whether the CLI said it is not signed in (SignInFold.kt).

use std::sync::Arc;

use crate::transcript::Transcript;

/// The CLI's `SDKAssistantMessageError` for a send it could not make because it is not signed in.
const NOT_SIGNED_IN: &str = "authentication_failed";

/// A top-level reply the CLI made itself because it is not signed in (`error`) marks its message
/// for signing in; the model's next reply clears the mark (the CLI reads the credentials again on
/// each send, so nothing has to be restarted). A sub-agent's reply (`parent`) changes nothing.
pub fn fold_sign_in(
    transcript: &Arc<Transcript>,
    parent: Option<&str>,
    error: Option<&str>,
) -> Arc<Transcript> {
    if parent.is_some() {
        return Arc::clone(transcript);
    }
    let routing = &transcript.routing;
    let sign_in = if error == Some(NOT_SIGNED_IN) {
        routing
            .current_turn
            .as_ref()
            .or(routing.open_resume.as_ref())
    } else {
        None
    };
    if sign_in == transcript.sign_in.as_ref() {
        Arc::clone(transcript)
    } else {
        Arc::new(Transcript {
            sign_in: sign_in.cloned(),
            ..Transcript::clone(transcript)
        })
    }
}
