package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.core.models.ApprovalDecision
import dev.ukitomato.closta.core.models.SavedSessionSummary
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.TreeRules

/**
 * What the presenter folds: the CLI's stdout lines, and the two things only the host knows because it sent
 * them on stdin — the user's own words, which the CLI never echoes, and its answer to an approval.
 */
sealed interface PresenterInput {
    /**
     * The user pressed stop: the host writes `interrupt` after this. The turns open now stop running at the next
     * `result`, whatever turn it names. Core does not change.
     */
    data object StopRequested : PresenterInput

    /** One stdout line. */
    data class Event(
        val event: AgentEvent,
    ) : PresenterInput

    /**
     * The host sent a user message. The host chooses [messageId], which becomes the message's key in the
     * tree, so it must be a key there (see [TreeRules.isKey]); the host names it before the CLI says anything
     * about the turn.
     */
    data class UserSent(
        val messageId: String,
        val text: String,
        /** The files that went with it: their points, ahead of the words in the message. */
        val attachments: List<AttachmentRecord> = emptyList(),
        /** The uuid the message goes to the CLI with; the transcript keeps which message it belongs to. */
        val uuid: String? = null,
    ) : PresenterInput {
        init {
            require(TreeRules.isKey(messageId)) { "a user message id must be a tree key: '$messageId'" }
        }
    }

    /**
     * The host found what the turn that answered the user message [askKey] changed on disk, against the Local History
     * label it put down when the message was sent. Core's state does not change.
     */
    data class TurnChangesFound(
        val askKey: String,
        val files: List<ChangedFile>,
        /** Whether more files changed than the host looked at ([files] are the first ones). */
        val more: Boolean = false,
    ) : PresenterInput

    /**
     * The webview asked to rewind the files to before the message [messageId]; [commandId] is its own mark and
     * [requestId] the host's mark on the request to the CLI. [sendsAt] is how many user messages had been sent and
     * [turnsAt] how many turns there had been. Folded before the request is written, as a [ControlRequested] is.
     */
    data class RewindRequested(
        val requestId: String,
        val commandId: String,
        val messageId: String,
        val dryRun: Boolean,
        val sendsAt: Int,
        val turnsAt: Int,
    ) : PresenterInput

    /**
     * The host did not send a rewind to the CLI, and says why in [reason]. It is not named like
     * `EffortRefused`: REFUSED is used for the CLI's own refusal, so the host not sending is called NotSent.
     */
    data class RewindNotSent(
        val commandId: String,
        val messageId: String,
        val dryRun: Boolean,
        val reason: String,
    ) : PresenterInput

    /**
     * The host did not send a message because of its attachments; [requestId] is the mark it made for the
     * refusal. The words of the message and the files are not kept: only why.
     */
    data class AttachmentRefused(
        val requestId: String,
        val reason: AttachmentRefusal,
    ) : PresenterInput

    /**
     * The host answered a pending approval; the first two are the arguments the caller gives core's `resolveApproval`.
     * [passedOn] is what it passed on to the CLI with an allow (the suggestions it accepted, the input it sent).
     */
    data class Decided(
        val decision: ApprovalDecision,
        val elapsedMs: Long,
        val passedOn: PassedOn = PassedOn(),
    ) : PresenterInput {
        // The input is the user's: never in a log.
        override fun toString(): String =
            "Decided(${decision.javaClass.simpleName}, $elapsedMs ms, ${passedOn.acceptedSuggestions.size} suggestions)"
    }

    /**
     * The host could not pass its answer for [approvalId] on to the CLI. [message] is the host's own fixed sentence,
     * never the text of an exception. An approval that is already settled is left as it is.
     */
    data class AnswerFailed(
        val approvalId: String,
        val message: String,
    ) : PresenterInput

    /**
     * The host answered the webview's `query-files`: the last answer is the one the tree shows. The record's
     * [FileSearchRecord.commandId] is the webview's own command id.
     */
    data class FilesFound(
        val search: FileSearchRecord,
    ) : PresenterInput

    /** The host answered the webview's `capture-selection`: the place of the selection, never its text. */
    data class SelectionCaptured(
        val selection: SelectionRecord,
    ) : PresenterInput

    /** The host answered the webview's `apply-code`: the place written or why nothing was, never the text. */
    data class CodeApplied(
        val applied: ApplyRecord,
    ) : PresenterInput

    /**
     * The host is about to ask the CLI for something under [requestId], a mark it made itself: the model or the
     * permission mode to [value], or the context usage ([value] is null). It is folded before the request is sent, so
     * the CLI's answer, which carries the same id, never comes before the request it answers.
     */
    data class ControlRequested(
        val requestId: String,
        val kind: ControlKind,
        val value: String? = null,
    ) : PresenterInput

    /** The request [requestId] could not be written to the CLI, as when the session is already closed. */
    data class ControlSendFailed(
        val requestId: String,
    ) : PresenterInput

    /**
     * The host did not restart the session for the effort [effort] because a turn is running; [requestId] is the
     * mark it made for the switch.
     */
    data class EffortRefused(
        val requestId: String,
        val effort: String,
    ) : PresenterInput

    /**
     * The session was started with the effort [effort], or with none, and with the in-process MCP servers named
     * [builtInMcpServers]: the names it declared to the CLI, which the list of servers shows as the host's own.
     * [sandbox] is whether it was asked to start in the sandbox (`--settings`); the CLI's settings say whether it is.
     */
    data class Launched(
        val effort: String?,
        val builtInMcpServers: List<String> = emptyList(),
        val sandbox: Boolean = false,
    ) : PresenterInput

    /**
     * The host did not restart the session into the sandbox because a turn is running; [requestId] is the mark it
     * made for the switch.
     */
    data class SandboxRefused(
        val requestId: String,
    ) : PresenterInput

    /**
     * The CLI asked to start in the sandbox did not start (it wrote a `result` and exited before `initialize`).
     * [requestId] is the switch's mark, or a new one when the launch was not a switch; [detail] is the CLI's sentence.
     */
    data class SandboxNotStarted(
        val requestId: String,
        val detail: String?,
    ) : PresenterInput

    /**
     * The host listed the project's saved sessions: the last list is the one the tree shows. [currentId] is the
     * session this thread talks to, which the list marks. With [unreadable] the list could not be read: [sessions] is
     * empty and the list the tree had stays.
     */
    data class SessionsListed(
        val sessions: List<SavedSessionSummary>,
        val currentId: String,
        val unreadable: Boolean = false,
    ) : PresenterInput {
        // The titles are the user's own words: never in a log.
        override fun toString(): String = "SessionsListed(${sessions.size} sessions, unreadable=$unreadable)"
    }

    /**
     * A line of the record of a session that is being resumed, put back before the CLI says anything. It folds as
     * the same line from stdout does, and a user's own words in it become a user message: they are in the record, and
     * only there (the CLI does not echo them).
     */
    data class Restored(
        val event: AgentEvent,
    ) : PresenterInput

    /** Everything the record gave is back; [dropped] lines of it were older than the host puts back. */
    data class HistoryRestored(
        val dropped: Int,
    ) : PresenterInput

    /** The session was resumed, and its record could not be read: it goes on without the earlier conversation. */
    data object HistoryUnavailable : PresenterInput

    /**
     * The host did not open the saved session [sessionId], for [reason] (a turn is running, or another tab has
     * it); [requestId] is the mark it made for the request.
     */
    data class ResumeRefused(
        val requestId: String,
        val sessionId: String,
        val reason: ResumeRefusal = ResumeRefusal.TURN,
    ) : PresenterInput
}

/** Why the host did not open a saved session: it is the one thing a record's sentence depends on. */
enum class ResumeRefusal {
    /** A turn is running in the session that would have been replaced. */
    TURN,

    /** Another tab of the tool window already has that session. */
    ELSEWHERE,
}

/**
 * What the host passed on to the CLI with an allow, as one value from the answer's making ([updatedPermissions] and
 * [acceptedSuggestions] together are one choice, and one fact more of an answer is one field here, not one more
 * parameter through every layer between the webview and the tree).
 *
 * [updatedPermissions] is the JSON array of the suggestions given to the CLI, in the CLI's own shape and opaque here;
 * [acceptedSuggestions] are their ids as the tree names them; [input] is the input the allow carried. The tree shows
 * the input only when it is not the request's own (a rewrite), and the accepted ids only for an answer that was an
 * allow.
 */
data class PassedOn(
    val updatedPermissions: String? = null,
    val acceptedSuggestions: List<String> = emptyList(),
    val input: JsonObject? = null,
) {
    // The suggestions and the input are the user's and the CLI's: never in a log.
    override fun toString(): String = "PassedOn(${acceptedSuggestions.size} suggestions)"
}
