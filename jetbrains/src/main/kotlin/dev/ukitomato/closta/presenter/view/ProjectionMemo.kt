package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.ConversationState
import dev.ukitomato.closta.core.models.Notice
import dev.ukitomato.closta.core.models.NoticeKind
import dev.ukitomato.closta.core.models.Task
import dev.ukitomato.closta.core.models.Turn
import dev.ukitomato.closta.presenter.tree.JsonArray
import dev.ukitomato.closta.presenter.tree.JsonObject

// What the projection reads besides the records, and what it keeps of the last tree it built.

/**
 * The domain facts a node is drawn with, besides its record: core's turns, tasks, notices, session, usage and
 * pending approvals, and the transcript's approvals, slash commands, file search, selection and operations.
 * Core's fold and [foldTranscript] hand on a list they did not change as the same object, so "nothing a node depends
 * on changed" is a few identity checks ([sameAs]).
 */
internal class Context(
    conversation: ConversationState,
    transcript: Transcript,
) {
    private val turns = conversation.turns
    private val tasks = conversation.tasks
    private val session = conversation.session
    private val usage = conversation.usage
    private val notices = conversation.notices
    private val pending = conversation.pendingApprovals
    private val approvals = transcript.approvals
    private val commands = transcript.commands
    private val fileSearch = transcript.fileSearch
    private val selection = transcript.selection
    private val applied = transcript.applied
    private val history = HistoryFacts.of(transcript)

    // What the console shows. The count of numbers given and the usage requests waiting for an answer are the
    // transcript's own and not in the tree, so a request made or answered leaves the context as it was (every
    // message node is then reused).
    // The MCP status requests waiting are no more in the tree than the usage ones are.
    // So are the settings requests waiting.
    private val operations =
        transcript.operations.copy(
            seq = 0,
            waiting = emptyList(),
            mcpWaiting = emptyList(),
            settingsWaiting = emptyList(),
        )

    /**
     * Whether [other] would draw every node as this does. The session and the usage are small values compared by what
     * they hold (core makes a new one at a `system/status` and at every `result`); the lists, as the rest, by identity.
     */
    fun sameAs(other: Context): Boolean =
        turns === other.turns &&
            tasks === other.tasks &&
            pending === other.pending &&
            approvals === other.approvals &&
            notices === other.notices &&
            session == other.session &&
            usage == other.usage &&
            commands == other.commands &&
            fileSearch == other.fileSearch &&
            selection == other.selection &&
            applied == other.applied &&
            operations == other.operations &&
            history == other.history

    /** What the thread says besides its messages, made once per context. */
    val extras: ThreadExtras by lazy {
        ThreadExtras(
            session = session?.let(::sessionNode),
            // The cost is the session's: with none there is no total to show.
            usage = session?.let { usageNode(usage, operations.tokens) },
            // A record that could not be read is the first notice, ahead of the CLI's: the CLI's come later, and
            // a notice is keyed by its place, so a place taken at the start never moves.
            notices =
                (listOfNotNull(historyNotice()) + notices).takeIf { it.isNotEmpty() }?.let(::noticesNode),
            tasks = tasks.takeIf { it.isNotEmpty() }?.let(::tasksNode),
            commands = commands.items.takeIf { it.isNotEmpty() }?.let(::commandsNode),
            fileSearch = fileSearch?.let(::fileSearchNode),
            selection = selection?.let(::selectionNode),
            applied = applied?.let(::appliedNode),
            models = operations.models.takeIf { it.isNotEmpty() }?.let(::modelsNode),
            startPermissionMode = operations.startPermissionMode,
            switches = operations.switches.takeIf { it.isNotEmpty() }?.let(::switchesNode),
            context = operations.context?.let(::contextNode),
            rewind = operations.rewind?.let(::rewindNode),
            compactions = operations.compactions.takeIf { it.isNotEmpty() }?.let(::compactionsNode),
            compacting = operations.compacting,
            effort = operations.effort,
            appliedModel = operations.appliedModel,
            savedSessions = history.savedSessions?.let(::savedSessionsNode),
            savedSessionsUnreadable = history.savedSessionsUnreadable,
            restoredUntil = history.restored?.until,
            restoredCount = history.restored?.count,
            restoredPartly = history.restored?.partly == true,
            mcpServers = operations.mcpServers?.let { mcpServersNode(it, operations.builtInMcpServers) },
            mcpServersUnreadable = operations.mcpUnreadable,
        )
    }

    private fun historyNotice(): Notice? =
        if (history.unavailable) Notice(NoticeKind.ERROR, HISTORY_UNAVAILABLE_TEXT) else null

    val pendingIds: Set<String> by lazy { pending.mapTo(HashSet()) { it.requestId } }

    /** The approval each tool call shows, chosen as [replaces] says. */
    val approvalByTool: Map<String, ApprovalRecord> by lazy {
        val shown = HashMap<String, ApprovalRecord>()
        for (record in approvals.values()) {
            val call = record.toolUseId ?: continue
            if (replaces(shown[call], record)) shown[call] = record
        }
        shown
    }

    /**
     * Whether [candidate], asked after [current] about the same call, is the one to show: the one the CLI is
     * waiting on, if any, else the latest asked.
     */
    fun replaces(
        current: ApprovalRecord?,
        candidate: ApprovalRecord,
    ): Boolean = current == null || candidate.requestId in pendingIds || current.requestId !in pendingIds

    /** The latest task each tool call started. */
    val taskByTool: Map<String, Task> by lazy {
        tasks
            .mapNotNull { task ->
                task.parentToolUseId?.let { it to task }
            }.toMap()
    }

    val turnByCommand: Map<String, Turn> by lazy { turns.associateBy { it.commandUuid } }

    /** The approvals in arrival order. */
    fun approvals(): List<ApprovalRecord> = approvals.values()
}

/**
 * An approval no tool call of the thread carries — its call has not arrived, or the request named none. The
 * projection makes a tool-call part for it so it can be answered; the part is derived and
 * never stored, so it is gone once the real call shows up.
 */
internal data class Orphan(
    val key: String,
    val record: ApprovalRecord,
)

/** How a node is drawn besides its record: its status, and the approval on it. */
internal data class Look(
    val status: Status?,
    val error: String? = null,
    val approval: JsonObject? = null,
)

/** Where a part is drawn: its level in the tree, whether its message still runs, and whether it is the user's. */
internal data class Place(
    val level: Int,
    val running: Boolean,
    val user: Boolean,
)

/** What a message is drawn with besides its record; equal inputs on the same record draw the same message. */
internal data class MessageInputs(
    val context: Context,
    val orphans: List<Orphan>,
    val scope: Boolean,
)

/** A built node, and whether a pending approval sits anywhere under it. */
internal sealed interface Projected {
    val node: JsonObject
    val pending: Boolean
}

internal class CollectionMemo(
    val keys: List<String>,
    val order: JsonArray,
    val entries: Map<String, Projected>,
    override val node: JsonObject,
    override val pending: Boolean,
) : Projected

internal class MessageMemo(
    val record: MessageRecord,
    val inputs: MessageInputs,
    val look: Look,
    val parts: CollectionMemo,
    override val node: JsonObject,
) : Projected {
    override val pending: Boolean get() = parts.pending
}

internal class OrphanMessageMemo(
    val orphan: Orphan,
    val context: Context,
    val parts: CollectionMemo,
    override val node: JsonObject,
) : Projected {
    override val pending: Boolean get() = parts.pending
}

/** A text or unknown part. */
internal class PartMemo(
    val record: PartRecord,
    val look: Look,
    override val node: JsonObject,
) : Projected {
    override val pending: Boolean get() = false

    fun draws(
        record: PartRecord,
        look: Look,
    ): Boolean = this.record === record && this.look == look
}

internal class ToolCallMemo(
    val record: ToolCallRecord,
    val look: Look,
    val leaves: ToolLeaves,
    val nested: CollectionMemo?,
    override val node: JsonObject,
    override val pending: Boolean,
) : Projected {
    fun draws(
        record: ToolCallRecord,
        look: Look,
        nested: CollectionMemo?,
    ): Boolean = this.record === record && this.look == look && this.nested?.node === nested?.node
}

/** A tool-call part made for an approval no tool call carries. */
internal class DerivedPartMemo(
    val record: ApprovalRecord,
    val look: Look,
    override val node: JsonObject,
    override val pending: Boolean,
) : Projected {
    fun draws(
        record: ApprovalRecord,
        look: Look,
    ): Boolean = this.record === record && this.look == look
}

internal class ThreadMemo(
    val transcript: Transcript,
    val context: Context,
    val isRunning: Boolean,
    val messages: CollectionMemo,
    override val node: JsonObject,
) : Projected {
    override val pending: Boolean get() = messages.pending
}
