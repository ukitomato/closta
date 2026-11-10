package dev.ukitomato.closta.platforms.intellij.session

import dev.ukitomato.closta.core.models.resolveApproval
import dev.ukitomato.closta.presenter.view.PresenterInput

/**
 * The view after [input], folded as the session's store folds it: an event through core, a decision through core's
 * `resolveApproval`, and what only the host knows into the transcript. The tests that replay a capture through the
 * store use this one fold, so a new kind of input is one line here.
 */
fun SessionView.fold(input: PresenterInput): SessionView =
    when (input) {
        is PresenterInput.Event -> event(input)
        is PresenterInput.UserSent -> sent(input)
        PresenterInput.StopRequested -> requested(input)
        is PresenterInput.Decided ->
            decided(resolveApproval(conversation, input.decision, input.elapsedMs), input.decision, input.elapsedMs)
        is PresenterInput.AnswerFailed -> answerFailed(input.approvalId, input.message)
        is PresenterInput.FilesFound -> filesFound(input.search)
        is PresenterInput.SelectionCaptured -> selectionCaptured(input.selection)
        is PresenterInput.CodeApplied -> codeApplied(input.applied)
        is PresenterInput.ControlRequested,
        is PresenterInput.ControlSendFailed,
        is PresenterInput.EffortRefused,
        is PresenterInput.Launched,
        is PresenterInput.SandboxRefused,
        is PresenterInput.SandboxNotStarted,
        is PresenterInput.ResumeRefused,
        is PresenterInput.AttachmentRefused,
        is PresenterInput.RewindRequested,
        is PresenterInput.RewindNotSent,
        is PresenterInput.TurnChangesFound,
        -> requested(input)
        is PresenterInput.SessionsListed -> listed(input)
        is PresenterInput.Restored -> restored(input.event)
        is PresenterInput.HistoryRestored -> historyRestored(input.dropped)
        PresenterInput.HistoryUnavailable -> historyUnavailable()
    }
