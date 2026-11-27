package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.ConversationState
import dev.ukitomato.closta.presenter.tree.JsonArray
import dev.ukitomato.closta.presenter.tree.JsonNumber
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonString
import java.util.IdentityHashMap

/**
 * The conversation as rows, the unit a lazy list draws: one row per user message, per text or thinking block, per tool
 * call. A row says what to draw and nothing of how, so any surface (Swing now, Compose some day) draws the same rows.
 * Rows of a record that did not change are the same objects as before, which is how a surface knows what it may leave
 * alone.
 */
sealed interface ThreadRow {
    val key: String

    /** Whether this row opens a message (a surface leaves more room above it). */
    val opens: Boolean
}

/** A message the user sent, with the files sent with it. */
data class AskRow(
    override val key: String,
    val text: String,
    val attachments: List<AttachmentRecord>,
) : ThreadRow {
    override val opens = true
}

/** A text block of a reply, as Markdown; the surface splits it into blocks of its own. */
data class TextRow(
    override val key: String,
    val markdown: String,
    val streaming: Boolean,
    override val opens: Boolean,
) : ThreadRow

data class ThinkingRow(
    override val key: String,
    val text: String,
    val streaming: Boolean,
    override val opens: Boolean,
    val estimate: Long? = null,
) : ThreadRow

/** One tool call. A sub-agent's call is one of these too; what it did inside is read in a tab of its own. */
data class ToolRow(
    override val key: String,
    val line: ToolLine,
    val toolUseId: String,
    val toolName: String,
    val depth: Int,
    override val opens: Boolean,
    /** What the line shows when it is opened; null for a row made without its call. */
    val detail: ToolDetail? = null,
    /** What a sub-agent's call shows on its card; null for any other tool. */
    val agent: AgentSummary? = null,
) : ThreadRow

/** Read-only tool calls that came one after another, shown as one line ("Explored 3 files"). */
data class ExploredRow(
    override val key: String,
    val members: List<ToolRow>,
    val depth: Int,
    override val opens: Boolean,
) : ThreadRow {
    val lines: List<ToolLine> get() = members.map { it.line }

    /** How many different files (or searches) the calls looked at: the same file read twice is one. */
    val files: Int get() = members.map { it.detail?.target ?: it.key }.distinct().size
}

/** The to-do list a `TodoWrite` call wrote, or a run of `TaskCreate` and `TaskUpdate` calls left. */
data class TodoRow(
    override val key: String,
    val items: List<TodoItem>,
    override val opens: Boolean,
) : ThreadRow

/** One to-do; [status] is the CLI's word for it (`pending`, `in_progress`, `completed`). */
data class TodoItem(
    val content: String,
    val status: String,
)

/**
 * The end of a turn: how long it took and what it changed (null until the host has looked), after the turn's reply
 * and its cards. [askKey] is the user message the turn answered, where Review and rewinding go.
 */
data class TurnEndRow(
    override val key: String,
    val askKey: String,
    val durationMs: Long?,
    val changes: TurnChangesRecord?,
    /** Whether an ask the CLI knows came after this turn's: only then can the conversation be rewound to here. */
    val followed: Boolean = false,
    override val opens: Boolean = false,
) : ThreadRow

/** A line across the thread where the conversation changed under it; what came before stays above it. */
data class DividerRow(
    override val key: String,
    val divider: Divider,
    override val opens: Boolean,
) : ThreadRow

/** What an [InformationalRecord] says of its level, as the CLI draws it: grey, or more prominent. */
enum class NoticeLevel { NOTICE, SUGGESTION, WARNING }

/** A line of the CLI's own ([content]); [stopped] when the CLI did not go on after it. */
data class NoticeRow(
    override val key: String,
    val level: NoticeLevel,
    val content: String,
    val stopped: Boolean,
    override val opens: Boolean,
) : ThreadRow

/** What a [DividerRow] marks. */
sealed interface Divider {
    /** The conversation was cleared; [at] is when, as the CLI wrote it (ISO 8601, UTC), null when it did not say. */
    data class Cleared(
        val at: String?,
    ) : Divider

    /** The conversation was compacted from [preTokens] to [postTokens] (null when not said), or [failed] to be. */
    data class Compacted(
        val trigger: String,
        val preTokens: Long,
        val postTokens: Long?,
        val failed: Boolean,
    ) : Divider
}

/** After the reply that said the CLI is not signed in: how to sign in, as the `/login` it names cannot run here. */
data class SignInRow(
    override val key: String,
) : ThreadRow {
    override val opens = false
}

/** The tools that only read; two or more in a row fold into one [ExploredRow]. */
val READ_ONLY_TOOLS: Set<String> = setOf("Read", "Grep", "Glob", "LS")

private const val TODO_TOOL = "TodoWrite"
private const val TASK_CREATE = "TaskCreate"
private const val TASK_UPDATE = "TaskUpdate"
private val TASK_TOOLS = setOf(TASK_CREATE, TASK_UPDATE)

/** What a `TaskCreate` result says first: `Task #1 created successfully: write tests`. */
private val TASK_CREATED = Regex("""Task #(\d+) created""")

private fun cardKey(
    anchor: String?,
    requestId: String,
): String = if (anchor == null) "card:$requestId" else "$anchor/card:$requestId"

/**
 * What a reused row is keyed by: the record, as the same object, and [extra], the state besides the record that the
 * row shows, as an equal value. A row is reused only while both are as they were.
 */
private class RowKey(
    val record: Any,
    val extra: Any?,
) {
    override fun equals(other: Any?): Boolean = other is RowKey && record === other.record && extra == other.extra

    override fun hashCode(): Int = 31 * System.identityHashCode(record) + extra.hashCode()
}

/**
 * Turns transcripts into rows, keeping the rows of every message and part that is the same object as last time and
 * whose extra state ([messageExtra] for a message, [partExtra] for a part) is equal to what it was.
 */
class ThreadRows internal constructor(
    private val messageExtra: (MessageRecord) -> Any? = { null },
    private val partExtra: (PartRecord) -> Any? = { null },
) {
    private var messages = HashMap<RowKey, List<ThreadRow>>()
    private var parts = HashMap<RowKey, ThreadRow?>()
    private var groups = HashMap<String, ExploredRow>()
    private var cards = IdentityHashMap<ApprovalRecord, CardRow>()
    private var asks = HashMap<String, CardRow>()
    private var ends = HashMap<String, TurnEndRow>()
    private val tasks = TaskTodos()

    /**
     * The rows of [transcript]. [conversation] says which requests for input core still holds as pending: a card that
     * waits is answerable only while it does.
     */
    fun of(
        transcript: Transcript,
        conversation: ConversationState,
    ): List<ThreadRow> {
        val nextMessages = HashMap<RowKey, List<ThreadRow>>()
        val nextParts = HashMap<RowKey, ThreadRow?>()
        val rows = ArrayList<ThreadRow>()
        val nextCards = IdentityHashMap<ApprovalRecord, CardRow>()
        val nextAsks = HashMap<String, CardRow>()
        val pending = conversation.pendingApprovals.mapTo(HashSet()) { it.requestId }
        val nextEnds = HashMap<String, TurnEndRow>()
        val go = planGoOf(transcript.operations)
        val byAnchor = transcript.approvals.values().groupBy { it.anchor }
        val asksByAnchor = transcript.elicitations.values().groupBy { it.anchor }
        val messageKeys = transcript.messages.order.toHashSet()
        val followed = liveAsks(transcript).dropLast(1).toHashSet()
        for (message in transcript.messages.values()) {
            val messageKey = RowKey(message, messageExtra(message))
            // A reply is kept only while every part still has its row (one whose extra state changed is made again).
            val kept =
                messages[messageKey]?.takeIf {
                    message.role == Role.USER ||
                        message.parts.values().all { parts.containsKey(RowKey(it, partExtra(it))) }
                }
            if (kept != null) carryParts(message, nextParts)
            val made = kept ?: rowsOf(message, nextParts)
            nextMessages[messageKey] = made
            rows += made
            if (message.key == transcript.signIn) rows += SignInRow("${message.key}/sign-in")
            byAnchor[message.key]?.forEach { rows += cardRow(it, nextCards, go) }
            asksByAnchor[message.key]?.forEach { rows += askRow(it, nextAsks, pending) }
            turnEndRow(transcript, message.key, followed)?.let {
                nextEnds[it.key] = it
                rows += it
            }
        }
        // A request whose message is not (or no longer) in the conversation still has to be answered: it goes last.
        byAnchor.filterKeys { it == null || it !in messageKeys }.values.flatten().forEach {
            rows +=
                cardRow(it, nextCards, go)
        }
        asksByAnchor.filterKeys { it == null || it !in messageKeys }.values.flatten().forEach {
            rows += askRow(it, nextAsks, pending)
        }
        messages = nextMessages
        parts = nextParts
        cards = nextCards
        asks = nextAsks
        ends = nextEnds
        return tasks.folded(grouped(rows), transcript)
    }

    private fun turnEndRow(
        transcript: Transcript,
        messageKey: String,
        followed: Set<String>,
    ): TurnEndRow? {
        val end = transcript.turnEnds[messageKey]
        val askKey = end?.askKey ?: return null
        val made =
            TurnEndRow("$messageKey/end", askKey, end.durationMs, transcript.turnChanges[askKey], askKey in followed)
        return ends[made.key]?.takeIf { it == made } ?: made
    }

    private fun cardRow(
        approval: ApprovalRecord,
        into: IdentityHashMap<ApprovalRecord, CardRow>,
        go: PlanGo,
    ): CardRow {
        val kept = cards[approval]?.takeIf { (it.card as? PlanCard)?.go.let { held -> held == null || held == go } }
        val made = kept ?: CardRow(cardKey(approval.anchor, approval.requestId), cardOf(approval, go), opens = false)
        into[approval] = made
        return made
    }

    private fun askRow(
        record: ElicitationRecord,
        into: HashMap<String, CardRow>,
        pending: Set<String>,
    ): CardRow {
        val card = elicitationCardOf(record, record.requestId in pending)
        val kept = asks[record.requestId]?.takeIf { it.card == card }
        val made = kept ?: CardRow(cardKey(record.anchor, record.requestId), card, opens = false)
        into[record.requestId] = made
        return made
    }

    private fun carryParts(
        message: MessageRecord,
        into: HashMap<RowKey, ThreadRow?>,
    ) {
        message.parts.values().forEach { part ->
            val key = RowKey(part, partExtra(part))
            if (parts.containsKey(key)) into[key] = parts[key]
        }
    }

    private fun rowsOf(
        message: MessageRecord,
        into: HashMap<RowKey, ThreadRow?>,
    ): List<ThreadRow> {
        val all = message.parts.values()
        if (message.role == Role.USER) {
            val words = all.filterIsInstance<TextRecord>().joinToString("\n") { it.text }
            return listOf(AskRow(message.key, words, all.filterIsInstance<AttachmentRecord>()))
        }
        val rows = ArrayList<ThreadRow>()
        for (partKey in message.parts.order) {
            val part = message.parts[partKey] ?: continue
            val key = RowKey(part, partExtra(part))
            val made =
                if (parts.containsKey(key)) {
                    parts[key]
                } else {
                    rowOf("${message.key}/$partKey", part, rows.isEmpty())
                }
            into[key] = made
            if (made != null) rows += made
        }
        return rows
    }

    private fun rowOf(
        key: String,
        part: PartRecord,
        opens: Boolean,
    ): ThreadRow? =
        when (part) {
            is TextRecord if part.reasoning ->
                ThinkingRow(key, part.text, part.streaming, opens, part.estimate.takeIf { part.streaming })
            is TextRecord ->
                if (part.text.isBlank() &&
                    !part.streaming
                ) {
                    null
                } else {
                    TextRow(key, part.text, part.streaming, opens)
                }
            is ClearedRecord -> DividerRow(key, Divider.Cleared(part.at), opens)
            is CompactedRecord ->
                DividerRow(
                    key,
                    Divider.Compacted(part.trigger, part.preTokens, part.postTokens, part.failed),
                    opens,
                )
            is InformationalRecord -> NoticeRow(key, noticeLevelOf(part.level), part.content, part.stopped, opens)
            is ToolCallRecord if part.toolName == TODO_TOOL -> TodoRow(key, todosOf(part.input), opens)
            is ToolCallRecord ->
                ToolRow(
                    key,
                    toolLine(part),
                    part.toolUseId,
                    part.toolName,
                    0,
                    opens,
                    toolDetail(part),
                    agentSummary(part),
                )
            else -> null
        }

    /** Folds each run of two or more read-only tool rows into one [ExploredRow], the same object while its run is. */
    private fun grouped(rows: List<ThreadRow>): List<ThreadRow> {
        val out = ArrayList<ThreadRow>(rows.size)
        val nextGroups = HashMap<String, ExploredRow>()
        var i = 0
        while (i < rows.size) {
            var end = i
            while (end < rows.size && rows[end].isReadOnlyTool()) end++
            if (end - i >= 2) {
                val members = rows.subList(i, end).map { it as ToolRow }
                val group =
                    sameGroup(members) ?: ExploredRow(members[0].key, members, members[0].depth, members[0].opens)
                nextGroups[group.key] = group
                out += group
                i = end
            } else {
                out += rows[i]
                i++
            }
        }
        groups = nextGroups
        return out
    }

    private fun sameGroup(members: List<ToolRow>): ExploredRow? {
        val old = groups[members[0].key] ?: return null
        val same = old.members.size == members.size && old.members.indices.all { old.members[it] === members[it] }
        return if (same) old else null
    }

    private fun ThreadRow.isReadOnlyTool() = this is ToolRow && toolName in READ_ONLY_TOOLS
}

/**
 * Replaces the task calls' tool rows with the to-do list they build, one list per run of calls with nothing between
 * them. The list starts empty and again after each `/clear`; a list that did not change is the same object as before.
 */
private class TaskTodos {
    private var lists = HashMap<String, TodoRow>()
    private var callsOf = IdentityHashMap<MessageRecord, List<ToolCallRecord>>()

    fun folded(
        rows: List<ThreadRow>,
        transcript: Transcript,
    ): List<ThreadRow> {
        if (rows.none { it.isTask() }) {
            lists = HashMap()
            callsOf = IdentityHashMap()
            return rows
        }
        val calls = taskCalls(transcript)
        val out = ArrayList<ThreadRow>(rows.size)
        val nextLists = HashMap<String, TodoRow>()
        val board = TaskBoard()
        var first: ThreadRow? = null
        for ((index, row) in rows.withIndex()) {
            if (row is DividerRow && row.divider is Divider.Cleared) board.clear()
            if (row !is ToolRow || !row.isTask()) {
                out += row
            } else {
                val opening = first ?: row
                calls[row.toolUseId]?.let(board::apply)
                val runGoesOn = rows.getOrNull(index + 1)?.isTask() == true
                first = if (runGoesOn) opening else null
                val items = if (runGoesOn) emptyList() else board.items()
                if (items.isNotEmpty()) {
                    val made = TodoRow(row.key, items, opening.opens)
                    val list = lists[made.key]?.takeIf { it == made } ?: made
                    nextLists[list.key] = list
                    out += list
                }
            }
        }
        lists = nextLists
        return out
    }

    private fun ThreadRow.isTask() = this is ToolRow && toolName in TASK_TOOLS

    /** The task calls of the thread's own messages by their tool use id: a row kept from before holds no call. */
    private fun taskCalls(transcript: Transcript): Map<String, ToolCallRecord> {
        val nextCalls = IdentityHashMap<MessageRecord, List<ToolCallRecord>>()
        val byId = HashMap<String, ToolCallRecord>()
        for (message in transcript.messages.values()) {
            val calls =
                callsOf[message] ?: message.parts
                    .values()
                    .filterIsInstance<ToolCallRecord>()
                    .filter { it.toolName in TASK_TOOLS }
            nextCalls[message] = calls
            for (call in calls) byId[call.toolUseId] = call
        }
        callsOf = nextCalls
        return byId
    }
}

/**
 * The tasks as the calls so far left them, by id, in the order they were created. A create not yet answered takes the
 * number after the largest so far, the one the CLI gives next; if an answer later names that number, the unanswered
 * one moves on to the next free number, so two tasks never share an id.
 */
private class TaskBoard {
    private var items = LinkedHashMap<String, TodoItem>()
    private val unanswered = HashSet<String>()

    fun clear() {
        items.clear()
        unanswered.clear()
    }

    fun items(): List<TodoItem> = items.values.toList()

    fun apply(call: ToolCallRecord) {
        val input = call.input as? JsonObject ?: return
        if (call.toolName == TASK_CREATE) create(call, input) else update(input)
    }

    private fun create(
        call: ToolCallRecord,
        input: JsonObject,
    ) {
        val subject = input.string("subject") ?: return
        val said = call.result?.content?.let { TASK_CREATED.find(resultText(it))?.groupValues?.get(1) }
        if (said == null) {
            val id = nextId()
            unanswered += id
            items[id] = TodoItem(subject, "pending")
            return
        }
        if (said in unanswered) moveOn(said)
        items[said] = TodoItem(subject, "pending")
    }

    private fun nextId(): String = ((items.keys.mapNotNull { it.toLongOrNull() }.maxOrNull() ?: 0) + 1).toString()

    /** Gives the unanswered task [id] the next free number, keeping its place in the list. */
    private fun moveOn(id: String) {
        val moved = nextId()
        unanswered -= id
        unanswered += moved
        items = LinkedHashMap(items.mapKeys { (key, _) -> if (key == id) moved else key })
    }

    /** An update of a task this list does not hold changes nothing. */
    private fun update(input: JsonObject) {
        val id =
            when (val taskId = input["taskId"]) {
                is JsonString -> taskId.value
                is JsonNumber -> taskId.text
                else -> null
            }
        val item = id?.let(items::get) ?: return
        val status = input.string("status")
        if (status == "deleted") {
            items.remove(id)
        } else {
            items[id] = TodoItem(input.string("subject") ?: item.content, status ?: item.status)
        }
    }
}

private fun todosOf(input: Any?): List<TodoItem> {
    val todos = ((input as? JsonObject)?.array("todos") as? JsonArray)?.items.orEmpty()
    return todos.mapNotNull { item ->
        val todo = item as? JsonObject ?: return@mapNotNull null
        val content = todo.string("content") ?: return@mapNotNull null
        TodoItem(content, todo.string("status") ?: "pending")
    }
}

/** The CLI's `suggestion` and `warning` are prominent; `notice` and any level not known are the quiet one. */
internal fun noticeLevelOf(level: String): NoticeLevel =
    when (level) {
        "suggestion" -> NoticeLevel.SUGGESTION
        "warning" -> NoticeLevel.WARNING
        else -> NoticeLevel.NOTICE
    }
