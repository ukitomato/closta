package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent

/** The CLI's `SDKAssistantMessageError` for a send it could not make because it is not signed in. */
private const val NOT_SIGNED_IN = "authentication_failed"

/**
 * A top-level reply the CLI made itself because it is not signed in marks its message for signing in; the model's
 * next reply clears the mark (the CLI reads the credentials again on each send, so nothing has to be restarted).
 */
internal fun foldSignIn(
    transcript: Transcript,
    event: AgentEvent.Assistant,
): Transcript {
    if (event.parentToolUseId != null) return transcript
    val signIn =
        if (event.error == NOT_SIGNED_IN) {
            transcript.routing.currentTurn ?: transcript.routing.openResume
        } else {
            null
        }
    return if (signIn == transcript.signIn) transcript else transcript.copy(signIn = signIn)
}
