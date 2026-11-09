package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.ConversationState
import dev.ukitomato.closta.core.models.TurnPhase

/**
 * Whether a thread is running: the one rule the tree's `isRunning` and the bridge's "in a turn" both follow.
 *
 * It runs while a turn is open, while the CLI speaks on its own (a resume that is open), while it waits on an
 * approval the tree shows (one with an id: the webview cannot answer without one), and between a send and core's
 * turn for it (core opens one turn per message the CLI takes, queued or started). A turn a stop ended
 * ([Routing.stopped]) does not run, whether or not a `result` named it.
 */
fun threadIsRunning(
    conversation: ConversationState,
    transcript: Transcript,
): Boolean =
    conversation.turns.any { it.phase == TurnPhase.OPEN && it.commandUuid !in transcript.routing.stopped } ||
        transcript.routing.openResume != null ||
        conversation.pendingApprovals.any { it.requestId.isNotEmpty() } ||
        transcript.routing.sends > conversation.turns.size
