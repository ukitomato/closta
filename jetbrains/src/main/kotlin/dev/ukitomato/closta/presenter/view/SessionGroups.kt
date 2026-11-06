package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.ConversationState

// How the sessions list groups a session, and which notifications a change of its view raises. The screen and the
// notifications only show these.

/** A session's place in the sessions list; the list shows the groups in this order. */
enum class SessionGroup { WAITING, RUNNING, UNREAD, OTHER }

/** [reason] is what a waiting session waits for; null for the other groups. */
data class SessionSummary(
    val group: SessionGroup,
    val reason: WaitReason?,
)

/** What a waiting session waits for; the screen puts it into words. */
sealed interface WaitReason {
    data object Question : WaitReason

    data object Plan : WaitReason

    /** A tool's permission; [subject] is the start of what it acts on, when there is one. */
    data class Permission(
        val toolName: String,
        val subject: String?,
    ) : WaitReason

    data object Other : WaitReason
}

fun sessionSummary(
    conversation: ConversationState,
    transcript: Transcript,
    unread: Boolean,
): SessionSummary {
    val first = waitingApprovals(conversation, transcript).firstOrNull()
    return when {
        first != null -> SessionSummary(SessionGroup.WAITING, reasonOf(first))
        threadIsRunning(conversation, transcript) -> SessionSummary(SessionGroup.RUNNING, null)
        unread -> SessionSummary(SessionGroup.UNREAD, null)
        else -> SessionSummary(SessionGroup.OTHER, null)
    }
}

/** Something to tell the user about a session they do not see; [key] names its notification. */
sealed interface SessionAlert {
    val key: String
}

/**
 * A tool waits for a yes or no that can be given from the notification. [subject] may be shown: the start of a command,
 * or a file name.
 */
data class PermissionAlert(
    override val key: String,
    val requestId: String,
    val toolName: String,
    val subject: String,
    val answerable: Boolean,
) : SessionAlert

/** Something to read before answering: the notification only opens the session. */
data class OpenOnlyAlert(
    override val key: String,
    val requestId: String,
    val what: AlertKind,
) : SessionAlert

/** A turn ended. */
data class FinishedAlert(
    override val key: String,
) : SessionAlert

enum class AlertKind { PLAN, QUESTION, EDIT }

/** The notifications to raise, and the keys of those to take back. */
data class AlertChange(
    val raised: List<SessionAlert>,
    val expired: List<String>,
)

/**
 * What changed between two views of one session: an alert for each approval that has begun to wait, the key of each
 * that no longer waits, and a [FinishedAlert] when the session stopped running. [before] is null the first time the
 * session is seen: whatever waits then is raised (a resumed session's too), and nothing is said to have finished.
 */
fun alertsBetween(
    before: Pair<ConversationState, Transcript>?,
    after: Pair<ConversationState, Transcript>,
): AlertChange {
    val now = waitingApprovals(after.first, after.second)
    val then = before?.let { waitingApprovals(it.first, it.second) }.orEmpty()
    val thenIds = then.mapTo(HashSet()) { it.requestId }
    val nowIds = now.mapTo(HashSet()) { it.requestId }
    val raised = now.filter { it.requestId !in thenIds }.map(::alertOf).toMutableList<SessionAlert>()
    val finished =
        before != null &&
            threadIsRunning(before.first, before.second) &&
            !threadIsRunning(after.first, after.second)
    if (finished) raised += FinishedAlert("$FINISHED${after.first.turns.size}")
    return AlertChange(raised, then.map { it.requestId }.filter { it !in nowIds })
}

private const val FINISHED = "finished:"
private val EDIT_TOOLS = setOf("Edit", "Write", "MultiEdit", "NotebookEdit")
private val FILE_TOOLS = EDIT_TOOLS + "Read"
private val COMMAND_TOOLS = setOf("Bash")
private const val REASON_SUBJECT = 40
private const val ALERT_SUBJECT = 80

/** The approvals and questions that wait, in arrival order: those core holds as pending and the transcript recorded. */
internal fun waitingApprovals(
    conversation: ConversationState,
    transcript: Transcript,
): List<ApprovalRecord> =
    conversation.pendingApprovals
        .filter { it.requestId.isNotEmpty() }
        .mapNotNull { transcript.approvals[it.requestId] }

private fun reasonOf(record: ApprovalRecord): WaitReason {
    val card = cardOf(record)
    return when {
        card is QuestionCard -> WaitReason.Question
        record.toolName == PLAN_TOOL -> WaitReason.Plan
        card is PermissionCard -> WaitReason.Permission(card.toolName, card.subject?.take(REASON_SUBJECT))
        else -> WaitReason.Other
    }
}

private fun alertOf(record: ApprovalRecord): SessionAlert {
    val id = record.requestId
    val card = cardOf(record)
    return when {
        card is QuestionCard -> OpenOnlyAlert(id, id, AlertKind.QUESTION)
        record.toolName == PLAN_TOOL -> OpenOnlyAlert(id, id, AlertKind.PLAN)
        record.toolName in EDIT_TOOLS -> OpenOnlyAlert(id, id, AlertKind.EDIT)
        else -> {
            val tool = (card as? PermissionCard)?.toolName ?: record.toolName.orEmpty()
            val subject = (card as? PermissionCard)?.subject.orEmpty()
            // Only the start of a command or a file name may be shown; another tool's input (a URL, a pattern, a
            // prompt, an MCP argument) is not.
            val shown =
                when (tool) {
                    in COMMAND_TOOLS -> subject.take(ALERT_SUBJECT)
                    in FILE_TOOLS -> subject.substringAfterLast('/').substringAfterLast('\\').take(ALERT_SUBJECT)
                    else -> ""
                }
            PermissionAlert(id, id, tool, shown, answerable = true)
        }
    }
}

/** How long a session's name in the sessions list may be. */
const val TITLE_MAX = 60

/** A session's name in the sessions list: the first line of the user's first request, cut short; null before one. */
fun sessionTitle(transcript: Transcript): String? =
    transcript.messages.order
        .firstNotNullOfOrNull { key -> transcript.messages[key]?.takeIf { it.role == Role.USER } }
        ?.parts
        ?.values()
        ?.firstNotNullOfOrNull { part -> (part as? TextRecord)?.text?.lineSequence()?.firstOrNull { it.isNotBlank() } }
        ?.trim()
        ?.take(TITLE_MAX)
