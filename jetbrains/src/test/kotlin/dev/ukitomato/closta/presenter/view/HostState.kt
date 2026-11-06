package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.ConversationState
import dev.ukitomato.closta.core.models.fold
import dev.ukitomato.closta.core.models.resolveApproval

/**
 * What the host holds for one thread, and the one place the tests fold an input the way the host does: core
 * first (`fold` for an event, `resolveApproval` for a decision), then the transcript with core's state before
 * and after.
 */
data class HostState(
    val conversation: ConversationState = ConversationState(),
    val transcript: Transcript = Transcript(),
) {
    fun next(input: PresenterInput): HostState {
        val after =
            when (input) {
                is PresenterInput.Event -> fold(conversation, input.event)
                is PresenterInput.Decided -> resolveApproval(conversation, input.decision, input.elapsedMs)
                is PresenterInput.Restored -> fold(conversation, input.event)
                // What only the host knows: core's state does not change for it.
                is PresenterInput.UserSent,
                PresenterInput.StopRequested,
                is PresenterInput.AnswerFailed,
                is PresenterInput.FilesFound,
                is PresenterInput.SelectionCaptured,
                is PresenterInput.CodeApplied,
                is PresenterInput.ControlRequested,
                is PresenterInput.ControlSendFailed,
                is PresenterInput.EffortRefused,
                is PresenterInput.Launched,
                is PresenterInput.SessionsListed,
                is PresenterInput.HistoryRestored,
                PresenterInput.HistoryUnavailable,
                is PresenterInput.ResumeRefused,
                is PresenterInput.AttachmentRefused,
                is PresenterInput.RewindRequested,
                is PresenterInput.RewindNotSent,
                is PresenterInput.TurnChangesFound,
                -> conversation
            }
        return HostState(after, foldTranscript(transcript, input, conversation, after))
    }

    fun source(threadId: String): ThreadSource = ThreadSource(threadId, conversation, transcript)
}
