package dev.ukitomato.closta.platforms.intellij.chat

import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.platforms.intellij.session.SessionOpening
import dev.ukitomato.closta.platforms.intellij.session.SessionStatus
import dev.ukitomato.closta.presenter.view.AskAction
import dev.ukitomato.closta.presenter.view.AskActions
import dev.ukitomato.closta.presenter.view.ForkFrom
import dev.ukitomato.closta.presenter.view.RewindOutcome
import dev.ukitomato.closta.presenter.view.RewindRecord
import dev.ukitomato.closta.presenter.view.RewindRefusal

// The steps of a rewind and a fork from the screen, free of `com.intellij`.

/** How the conversation of [sessionId] is opened rewound to before [rewindBefore]; null keeps nothing (a new one). */
fun rewindOpening(
    sessionId: String,
    rewindBefore: String?,
): SessionOpening = rewindBefore?.let { SessionOpening.Fork(sessionId, it) } ?: SessionOpening.New

/** How the conversation of [sessionId] is opened forked at [fork]. */
fun forkOpening(
    sessionId: String,
    fork: ForkFrom,
): SessionOpening = SessionOpening.Fork(sessionId, fork.rewindBefore)

/** What is said when the CLI did not answer the rewind of the files in time (or the session was not running). */
val FILES_REWIND_NO_ANSWER: String get() = ClostaBundle.message("chat.rewind.filesNoAnswer")

/**
 * Why the conversation is not rewound after the files were asked to go back ([record] is the CLI's answer, null when
 * none came): null when they went back. The CLI's own sentence is shown as it gave it.
 */
fun filesRewindRefusal(record: RewindRecord?): String? =
    when (record?.outcome) {
        RewindOutcome.DONE -> null
        RewindOutcome.REFUSED, RewindOutcome.FAILED ->
            record.detail?.let { ClostaBundle.message("chat.rewind.filesRefused.detail", it) }
                ?: ClostaBundle.message("chat.rewind.filesRefused")
        null, RewindOutcome.PENDING -> FILES_REWIND_NO_ANSWER
    }

/** What a rewind does with the copy it opened, by the copy's status. */
sealed interface CopyStep {
    /** Still starting: the original stays on screen and running. */
    data object Wait : CopyStep

    /** The copy runs: it takes the original's place, and the original is stopped. */
    data object Swap : CopyStep

    /** The copy will not run: it is stopped, the original stays, and [reason] is said. */
    data class Abandon(
        val reason: String,
    ) : CopyStep
}

val COPY_NOT_OPENED: String get() = ClostaBundle.message("chat.rewind.copyNotOpened")
val COPY_NO_START: String get() = ClostaBundle.message("chat.rewind.copyNoStart")

/**
 * The step a rewind takes on its copy's [status]: the original is left only once the copy runs. A copy that fails (a
 * cut point missing from the record included) or ends is abandoned.
 */
fun copyStep(status: SessionStatus): CopyStep =
    when (status) {
        SessionStatus.Starting -> CopyStep.Wait
        is SessionStatus.Running -> CopyStep.Swap
        is SessionStatus.Failed ->
            CopyStep.Abandon(ClostaBundle.message("chat.rewind.copyFailed", status.failure.cause))
        SessionStatus.Ended, SessionStatus.Closed -> CopyStep.Abandon(COPY_NOT_OPENED)
    }

/** The step when the copy did not leave [SessionStatus.Starting] in time. */
fun copyTimedOut(): CopyStep = CopyStep.Abandon(COPY_NO_START)

val ACTION_OUT_OF_DATE: String get() = ClostaBundle.message("chat.rewind.outOfDate")
val ACTION_BUSY: String get() = ClostaBundle.message("chat.rewind.busy")

/**
 * Why [action], chosen from what the row offered on hover, is not done now that [now] is what is offered at the click:
 * null when [now] still offers the same action.
 */
fun clickRefusal(
    action: AskAction,
    now: AskActions,
): String? =
    when (action) {
        now.rewind, now.rewindFiles, now.fork -> null
        else -> now.refusal?.let(::rewindRefusalText) ?: ACTION_OUT_OF_DATE
    }

/** Why the conversation is not rewound once the files came back: theirs, else a turn that started meanwhile. */
fun afterFilesRefusal(
    filesRefusal: String?,
    running: Boolean,
): String? = filesRefusal ?: rewindRefusalText(RewindRefusal.RUNNING).takeIf { running }

/** The sessions a rewind or a fork is under way for: one at a time per session. Thread-safe. */
class ActingGate {
    private val busy = HashSet<String>()

    /** Whether one may start for [sessionId] (and now has); false while another runs. */
    @Synchronized
    fun tryStart(sessionId: String): Boolean = busy.add(sessionId)

    @Synchronized
    fun done(sessionId: String) {
        busy.remove(sessionId)
    }
}

/**
 * Whether a session stopped from the screen leaves a mark in the list to resume it from: the saved list reads only
 * the project's own folder, so one in another folder (a worktree) with a conversation would otherwise be lost.
 */
fun marksOnStop(
    workingDirectory: String?,
    projectBase: String?,
    messages: Int,
): Boolean = workingDirectory != null && workingDirectory != projectBase && messages > 0
