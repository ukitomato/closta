package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.Task
import dev.ukitomato.closta.core.models.TaskStatus
import dev.ukitomato.closta.core.models.TurnPhase
import dev.ukitomato.closta.presenter.tree.JsonArray
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonString
import dev.ukitomato.closta.presenter.tree.JsonText
import dev.ukitomato.closta.presenter.tree.JsonValue

/**
 * Projects one thread, reusing what [previous] built wherever a node's record is the same object and what it
 * is drawn with is equal: such a node is the previous node, and a collection whose entries are all previous
 * nodes in the same order is the previous collection, up to the thread.
 */
internal class ThreadProjection(
    private val source: ThreadSource,
    private val previous: ThreadMemo?,
) {
    private val transcript = source.transcript
    private val context =
        Context(source.conversation, transcript).let { fresh ->
            previous?.context?.takeIf(fresh::sameAs)
                ?: fresh
        }

    fun project(): ThreadMemo {
        if (previous != null && previous.transcript === transcript && previous.context === context) return previous
        val isRunning = threadIsRunning(source.conversation, transcript)
        val messages = topMessages(previous?.messages)
        val reused =
            previous
                ?.takeIf {
                    it.isRunning == isRunning &&
                        it.messages.node === messages.node &&
                        it.context.extras == context.extras
                }?.node
        val extras = context.extras
        val node = reused ?: threadNode(source.id, isRunning, messages.node, extras)
        return ThreadMemo(transcript, context, isRunning, messages, node)
    }

    /**
     * A derived part goes to the assistant message its request belonged to, while that message is there; else to
     * the last assistant message; with none, it gets a message of its own.
     */
    private fun topMessages(memo: CollectionMemo?): CollectionMemo {
        val records = transcript.messages
        val assistants = records.order.filterTo(LinkedHashSet()) { records[it]?.role == Role.ASSISTANT }
        val last = assistants.lastOrNull()
        val placed = orphansOf(transcript, context).groupBy { it.record.anchor?.takeIf(assistants::contains) ?: last }
        val level = Levels.messageIn(Levels.TOP_MESSAGES)
        val entries = LinkedHashMap<String, Projected>()
        for (key in records.order) {
            val record = records[key] ?: continue
            val inputs = MessageInputs(context, placed[key].orEmpty(), scope = false)
            entries[key] = message(record, level, inputs, memo?.entries?.get(key) as? MessageMemo)
        }
        for (orphan in placed[null].orEmpty()) {
            val key = claimKey(entries::containsKey, "approval:${orphan.record.requestId}")
            entries[key] = orphanMessage(key, orphan, level, memo?.entries?.get(key) as? OrphanMessageMemo)
        }
        return collection(entries, memo)
    }

    private fun message(
        record: MessageRecord,
        level: Int,
        inputs: MessageInputs,
        memo: MessageMemo?,
    ): MessageMemo {
        if (memo != null && memo.record === record && memo.inputs == inputs) return memo
        val place =
            Place(
                Levels.partOf(level),
                runningOf(record.source, context, inputs.scope),
                record.role == Role.USER,
            )
        val parts = parts(record, place, inputs.orphans, memo?.parts)
        val look = messageLook(record.source, context, parts.pending)
        val reused = memo?.takeIf { it.look == look && it.parts.node === parts.node }?.node
        return MessageMemo(
            record,
            inputs,
            look,
            parts,
            reused ?: messageNode(record.key, record.role, look, parts.node),
        )
    }

    private fun parts(
        record: MessageRecord,
        place: Place,
        orphans: List<Orphan>,
        memo: CollectionMemo?,
    ): CollectionMemo {
        val entries = LinkedHashMap<String, Projected>()
        for (key in record.parts.order) {
            val part = record.parts[key] ?: continue
            entries[key] = part(key, part, place, memo?.entries?.get(key))
        }
        for (orphan in orphans) {
            val key = claimKey(entries::containsKey, orphan.key)
            entries[key] = derivedPart(key, orphan.record, place, memo?.entries?.get(key) as? DerivedPartMemo)
        }
        return collection(entries, memo)
    }

    private fun part(
        key: String,
        record: PartRecord,
        place: Place,
        memo: Projected?,
    ): Projected =
        when (record) {
            is TextRecord -> {
                val look = Look(textStatus(record, place))
                reuseOr(memo as? PartMemo, record, look) { textNode(record, look.status) }
            }
            is OtherRecord -> reuseOr(memo as? PartMemo, record, Look(null)) { otherNode(record) }
            is AttachmentRecord -> reuseOr(memo as? PartMemo, record, Look(null)) { attachmentNode(record) }
            is ToolCallRecord -> toolCall(key, record, place, memo as? ToolCallMemo)
        }

    private fun toolCall(
        key: String,
        record: ToolCallRecord,
        place: Place,
        memo: ToolCallMemo?,
    ): ToolCallMemo {
        val approval = context.approvalByTool[record.toolUseId]
        val pending = approval != null && approval.requestId in context.pendingIds
        val task = context.taskByTool[record.toolUseId]
        val (status, error) = toolStatus(pending, task, record.result != null, place.running)
        val look =
            Look(status, error, approval?.let { approvalNode(it, pending, questionFor(it, record.input), place.level) })
        val nestedLevel = Levels.nestedUnder(place.level)
        // A sub-agent's calls go on until the call that started it was cut off or failed: its lines keep coming after
        // the turn's result, and after a re-sent task_started that core leaves complete (captures 10 and 11).
        val goesOn = !status.incomplete
        val messages = record.messages.takeIf { it.size > 0 }
        val nested = messages?.let { nestedMessages(it, nestedLevel, goesOn, memo?.nested) }
        val leaves =
            memo?.leaves?.takeIf { memo.record.sameLeaves(record) }
                ?: toolLeaves(record.argsText, record.input, record.result, place.level, record.streaming)
        val reused = memo?.takeIf { it.draws(record, look, nested) }?.node
        val node = reused ?: toolCallNode(key, record.toolName, leaves, look, nested?.node)
        return ToolCallMemo(record, look, leaves, nested, node, pending || nested?.pending == true)
    }

    private fun derivedPart(
        key: String,
        record: ApprovalRecord,
        place: Place,
        memo: DerivedPartMemo?,
    ): DerivedPartMemo {
        val pending = record.requestId in context.pendingIds
        val task = record.toolUseId?.let { context.taskByTool[it] }
        val (status, error) = toolStatus(pending, task, hasResult = false, place.running)
        val look = Look(status, error, approvalNode(record, pending, questionFor(record, null), place.level))
        if (memo?.draws(record, look) == true) return memo
        // The request is the only account of this call: shown as text when it cannot be read as JSON.
        val argsText = record.input?.let(JsonText::compact) ?: record.unreadable.orEmpty()
        val leaves = toolLeaves(argsText, record.input, null, place.level, streaming = false)
        return DerivedPartMemo(
            record,
            look,
            toolCallNode(key, record.toolName ?: "unknown", leaves, look, null),
            pending,
        )
    }

    private fun orphanMessage(
        key: String,
        orphan: Orphan,
        level: Int,
        memo: OrphanMessageMemo?,
    ): OrphanMessageMemo {
        if (memo != null && memo.orphan == orphan && memo.context === context) return memo
        val place = Place(Levels.partOf(level), running = false, user = false)
        val part =
            derivedPart(orphan.key, orphan.record, place, memo?.parts?.entries?.get(orphan.key) as? DerivedPartMemo)
        val parts = collection(linkedMapOf(orphan.key to part), memo?.parts)
        // No turn holds it, so nothing is running here: it waits for an answer or has ended.
        val look = Look(if (parts.pending) Status.REQUIRES_ACTION else Status.COMPLETE_UNKNOWN)
        val reused = memo?.takeIf { it.parts.node === parts.node }?.node
        return OrphanMessageMemo(orphan, context, parts, reused ?: messageNode(key, Role.ASSISTANT, look, parts.node))
    }

    private fun nestedMessages(
        messages: Keyed<MessageRecord>,
        level: Int,
        scope: Boolean,
        memo: CollectionMemo?,
    ): CollectionMemo {
        val entries = LinkedHashMap<String, Projected>()
        val inputs = MessageInputs(context, emptyList(), scope)
        for (key in messages.order) {
            val record = messages[key] ?: continue
            entries[key] = message(record, Levels.messageIn(level), inputs, memo?.entries?.get(key) as? MessageMemo)
        }
        return collection(entries, memo)
    }
}

/** What a request asks, when core holds it as a question; [call] is its tool call's input, where there is one. */
private fun questionFor(
    record: ApprovalRecord,
    call: JsonValue?,
): Question? = if (record.ask) askedQuestion(record.input, call) else null

/** A user's words have no stream and no status; a block still streaming when its message stopped was cut off. */
private fun textStatus(
    record: TextRecord,
    place: Place,
): Status? =
    when {
        place.user -> null
        !record.streaming -> Status.COMPLETE
        place.running -> Status.RUNNING
        else -> Status.CANCELLED
    }

/** The previous part when it draws [record] with [look] (a part without nested messages), else a new one. */
private fun reuseOr(
    memo: PartMemo?,
    record: PartRecord,
    look: Look,
    build: () -> JsonObject,
): PartMemo = memo?.takeIf { it.draws(record, look) } ?: PartMemo(record, look, build())

private fun ToolCallRecord.sameLeaves(other: ToolCallRecord): Boolean =
    argsText === other.argsText && input === other.input && result === other.result && streaming == other.streaming

/** The approvals no tool call of the thread carries, one per call they name, chosen as [Context.replaces] says. */
private fun orphansOf(
    transcript: Transcript,
    context: Context,
): List<Orphan> {
    val byKey = LinkedHashMap<String, ApprovalRecord>()
    for (record in context.approvals()) {
        val toolUseId = record.toolUseId
        val key = if (toolUseId == null) "approval:${record.requestId}" else Keys.ofCliId(toolUseId)
        val orphan = toolUseId == null || key !in transcript.routing.tools
        if (orphan && context.replaces(byKey[key], record)) byKey[key] = record
    }
    return byKey.map { (key, record) -> Orphan(key, record) }
}

/** Whether a message still runs: its turn is open, its resume has not ended, or (nested) its call was not cut off. */
private fun runningOf(
    source: MessageSource,
    context: Context,
    scope: Boolean,
): Boolean =
    when (source) {
        MessageSource.Sent -> false
        is MessageSource.Turn -> context.turnByCommand[source.commandUuid]?.phase == TurnPhase.OPEN
        is MessageSource.Resume -> source.end == null
        MessageSource.Nested -> scope
    }

/**
 * A message's status: core's turn for a turn the user started, the closing `result` the
 * transcript kept for a spontaneous resume. A pending approval anywhere in it makes it wait for the user,
 * whether or not its turn or resume has ended — the CLI still waits on the answer (a sub-agent may ask after
 * its parent's turn ended, and a resume's result may leave a request pending). The user's and a sub-agent's
 * messages have none.
 */
private fun messageLook(
    source: MessageSource,
    context: Context,
    pending: Boolean,
): Look =
    when (source) {
        MessageSource.Sent, MessageSource.Nested -> Look(null)
        is MessageSource.Turn -> {
            val turn = context.turnByCommand[source.commandUuid]
            when {
                pending -> Look(Status.REQUIRES_ACTION)
                turn == null -> Look(Status.COMPLETE_UNKNOWN)
                turn.phase == TurnPhase.OPEN -> Look(Status.RUNNING)
                turn.incompleteReason == null -> Look(Status.COMPLETE_STOP)
                else -> Look(Status.FAILED, turn.incompleteReason)
            }
        }
        is MessageSource.Resume -> {
            val end = source.end
            when {
                pending -> Look(Status.REQUIRES_ACTION)
                end == null -> Look(Status.RUNNING)
                end.isError -> Look(Status.FAILED, end.result)
                else -> Look(Status.COMPLETE_STOP)
            }
        }
    }

/**
 * A tool call's status: a pending approval first, then the task the call started — whose own
 * notification is the authority on how it ended, even after the call's result says it was launched — then the
 * result. A call left without one when its message stopped running was cut off.
 */
internal fun toolStatus(
    pending: Boolean,
    task: Task?,
    hasResult: Boolean,
    running: Boolean,
): Pair<Status, String?> =
    when {
        pending -> Status.REQUIRES_ACTION to null
        task != null ->
            when (task.status) {
                TaskStatus.RUNNING -> Status.RUNNING to null
                TaskStatus.COMPLETE -> Status.COMPLETE to null
                TaskStatus.INCOMPLETE -> Status.FAILED to task.incompleteReason
            }
        hasResult -> Status.COMPLETE to null
        !running -> Status.CANCELLED to null
        else -> Status.RUNNING to null
    }

/** The collection of [entries] in their order; the previous one when nothing in it changed. */
internal fun collection(
    entries: Map<String, Projected>,
    memo: CollectionMemo?,
): CollectionMemo {
    val keys = entries.keys.toList()
    val order = if (memo != null && memo.keys == keys) memo.order else JsonArray(keys.map(::JsonString))
    val node =
        if (memo != null && order === memo.order && keys.all { entries[it]?.node === memo.entries[it]?.node }) {
            memo.node
        } else {
            val byId = JsonObject.Builder()
            entries.forEach { (key, entry) -> byId.put(key, entry.node) }
            collectionNode(order, byId.build())
        }
    return CollectionMemo(keys, order, entries, node, entries.values.any { it.pending })
}
