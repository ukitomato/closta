package dev.ukitomato.closta.platforms.intellij.session

import dev.ukitomato.closta.core.models.ApprovalDecision
import dev.ukitomato.closta.core.models.ConversationState
import dev.ukitomato.closta.core.models.fold
import dev.ukitomato.closta.presenter.view.ApplyRecord
import dev.ukitomato.closta.presenter.view.FileSearchRecord
import dev.ukitomato.closta.presenter.view.PassedOn
import dev.ukitomato.closta.presenter.view.PresenterInput
import dev.ukitomato.closta.presenter.view.SelectionRecord
import dev.ukitomato.closta.presenter.view.Transcript
import dev.ukitomato.closta.presenter.view.foldTranscript

/**
 * What one session has to show: core's state of the conversation and the presenter's [Transcript] of it, folded from
 * the same inputs in the same order — core first, then the transcript with core's state before and after, which is
 * what [foldTranscript] needs. Every write goes through [ConversationStore], under one lock, so an approval's answer
 * and a stdout line never fold against each other's stale state.
 *
 * Free of `com.intellij` (a test reads this file to keep it so), so the fast `src/test` suite folds the captures
 * through it and compares the result with the tests' own host fold.
 */
data class SessionView(
    val conversation: ConversationState = ConversationState(),
    val transcript: Transcript = Transcript(),
) {
    /** A stdout line. */
    fun event(input: PresenterInput.Event): SessionView = folded(fold(conversation, input.event), input)

    /** The host sent a user message; core's state does not change until the CLI says so. */
    fun sent(input: PresenterInput.UserSent): SessionView = folded(conversation, input)

    /**
     * The host answered an approval, and core's state after the answer is [after]. [passedOn] is what was passed on to
     * the CLI with the answer: the suggestions accepted and the input it carried.
     */
    fun decided(
        after: ConversationState,
        decision: ApprovalDecision,
        elapsedMs: Long,
        passedOn: PassedOn = PassedOn(),
    ): SessionView = folded(after, PresenterInput.Decided(decision, elapsedMs, passedOn))

    /** The host could not pass its answer for [approvalId] on; core's state stays, and so does the open approval. */
    fun answerFailed(
        approvalId: String,
        message: String,
    ): SessionView = folded(conversation, PresenterInput.AnswerFailed(approvalId, message))

    /** The host's answer to the webview's file query; core's state does not change. */
    fun filesFound(search: FileSearchRecord): SessionView = folded(conversation, PresenterInput.FilesFound(search))

    /** The host's answer to the webview's request for the selection; core's state does not change. */
    fun selectionCaptured(selection: SelectionRecord): SessionView =
        folded(conversation, PresenterInput.SelectionCaptured(selection))

    /** The host's answer to the webview's `apply-code`; core's state does not change. */
    fun codeApplied(applied: ApplyRecord): SessionView = folded(conversation, PresenterInput.CodeApplied(applied))

    /**
     * The host tells the view something about the requests it makes: a [PresenterInput.ControlRequested] before
     * the request is written, a [PresenterInput.ControlSendFailed], a [PresenterInput.EffortRefused], a
     * [PresenterInput.Launched] or a [PresenterInput.ResumeRefused]. Core's state does not change.
     */
    fun requested(input: PresenterInput): SessionView = folded(conversation, input)

    internal fun folded(
        after: ConversationState,
        input: PresenterInput,
    ) = SessionView(after, foldTranscript(transcript, input, conversation, after))
}
