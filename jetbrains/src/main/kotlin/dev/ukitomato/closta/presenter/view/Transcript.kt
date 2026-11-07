package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonValue

/**
 * What one thread has shown so far — the content core deliberately does not keep: the user's
 * words, the model's text and thinking, tool arguments and results, sub-agent conversations, and what each
 * approval asks. It is read out of the events' `RawJson` by [foldTranscript].
 *
 * It holds no domain fact core owns. Whether a turn is open or closed, which approvals are pending and how a
 * task ended are read from `ConversationState` when the tree is projected, so the two never disagree; what is
 * kept here about turns is only where content goes ([Routing]).
 *
 * Every record is immutable and an update copies only the path it touches: a message, part or approval that
 * an input did not touch is the same object afterwards, which is what the projection's memo keys on.
 */
data class Transcript(
    /** The thread's messages in order: the user's, one per turn, one per spontaneous resume. */
    val messages: Keyed<MessageRecord> = Keyed.empty(),
    /** Every approval and question the CLI asked, by `request_id`, in arrival order. */
    val approvals: Keyed<ApprovalRecord> = Keyed.empty(),
    val routing: Routing = Routing(),
    /** The slash commands the CLI has. */
    val commands: SlashCommands = SlashCommands(),
    /** The answer to the webview's last file query, by that command's id; only the last one is kept. */
    val fileSearch: FileSearchRecord? = null,
    /** The answer to the webview's last request to take the selection in, by that command's id. */
    val selection: SelectionRecord? = null,
    /** The answer to the webview's last `apply-code`, by that command's id. */
    val applied: ApplyRecord? = null,
    /** What the operations console shows that core does not keep. */
    val operations: OperationRecords = OperationRecords(),
    /** The CLI's uuid of each user message of this thread, by the message's key; the tree does not carry it. */
    val userUuids: Map<String, String> = emptyMap(),
    /** The project's saved sessions as the host last listed them; null until it has listed. */
    val savedSessions: List<SavedSessionRecord>? = null,
    /** Whether the last listing could not be read; [savedSessions] is then the one before it. */
    val savedSessionsUnreadable: Boolean = false,
    /** What was put back of an earlier conversation when the session was resumed; null when nothing was. */
    val restored: RestoredRecord? = null,
    /** Whether the session was resumed and its record could not be read. */
    val historyUnavailable: Boolean = false,
    /** What runs in the background, as the CLI last listed it (the running list). */
    val background: BackgroundTasks = BackgroundTasks(),
    /** How each turn a `result` closed ended, by the key of the turn's message. */
    val turnEnds: Map<String, TurnEndRecord> = emptyMap(),
    /** What the host found each turn changed, by the key of the user message the turn answered. */
    val turnChanges: Map<String, TurnChangesRecord> = emptyMap(),
    /** The key of the message whose reply said the CLI is not signed in, until the model's next reply. */
    val signIn: String? = null,
)

enum class Role(
    val wire: String,
) {
    USER("user"),
    ASSISTANT("assistant"),
}

data class MessageRecord(
    val key: String,
    val role: Role,
    val source: MessageSource,
    val parts: Keyed<PartRecord> = Keyed.empty(),
)

/** Where a message came from, which decides where its status is read. */
sealed interface MessageSource {
    /** The host's own user message. It has no status. */
    data object Sent : MessageSource

    /** The assistant's reply in the turn the user started with [commandUuid]; core's turn gives its status. */
    data class Turn(
        val commandUuid: String,
    ) : MessageSource

    /**
     * What the CLI said on its own after a background task finished. Core keeps no turn for it,
     * so the transcript records the `result` that closed it; [end] is null while it is open.
     */
    data class Resume(
        val end: ResumeEnd? = null,
    ) : MessageSource

    /** A sub-agent's message, nested under the tool call that started the sub-agent. It has no status. */
    data object Nested : MessageSource
}

data class ResumeEnd(
    val isError: Boolean,
    val result: String,
)

sealed interface PartRecord

/**
 * A text or thinking block. [streaming] is true from the stream's `content_block_start` until its
 * `content_block_stop`; a block that arrived only as a finished snapshot never streamed.
 */
data class TextRecord(
    val reasoning: Boolean,
    val text: String,
    val streaming: Boolean = false,
) : PartRecord

/**
 * A tool call, keyed in its message by [Keys.ofCliId] of [toolUseId]. [argsText] is the input as it streamed
 * in; [input] is the finished input from the `assistant` snapshot, kept as the CLI sent it — whether it can go
 * into the tree is decided when the tree is built, where its depth is known. [streaming] is true from the
 * stream's `content_block_start` until its `content_block_stop`, while [argsText] is still growing.
 */
data class ToolCallRecord(
    val toolUseId: String,
    val toolName: String,
    val argsText: String = "",
    val input: JsonValue? = null,
    val result: ToolResult? = null,
    /** A sub-agent's conversation, when this call started one. */
    val messages: Keyed<MessageRecord> = Keyed.empty(),
    val streaming: Boolean = false,
) : PartRecord

/**
 * The `tool_result` for a call. [content] is null when the block carried none. [durationMs] is how long a sub-agent
 * ran, when the line's `tool_use_result` says so.
 */
data class ToolResult(
    val content: JsonValue?,
    val isError: Boolean?,
    val durationMs: Long? = null,
)

/** A block of a type this version does not know; the tree shows it as a part of that type. */
data class OtherRecord(
    val type: String,
) : PartRecord

/**
 * One `control_request`. Only what the projection shows is kept: which tool call it gates, what it asks, and
 * what the host answered — the answer arrives on stdin, so core does not keep it.
 */
data class ApprovalRecord(
    val requestId: String,
    val toolUseId: String?,
    val toolName: String?,
    val agentId: String?,
    /** The request's `input`: what a question asks, and the input of a part made when no tool call carries it. */
    val input: JsonValue?,
    /** The request as the CLI sent it, when it is not a JSON object: still shown, as the only account of the call. */
    val unreadable: String? = null,
    /** Whether core holds the request as a question (its kind is `ASK`). */
    val ask: Boolean,
    /** The top-level assistant message receiving content (else the last one) when the request arrived. */
    val anchor: String?,
    val outcome: ApprovalOutcome? = null,
    /** What the CLI offered to remember along with an allow, from the request's `permission_suggestions`. */
    val suggestions: List<SuggestionRecord> = emptyList(),
    /** The ids of the suggestions the host passed on to the CLI with its allow; empty when none was. */
    val acceptedSuggestions: List<String> = emptyList(),
    /** The input the host sent with its allow, when that is not the request's own: a rewrite. */
    val updatedInput: JsonObject? = null,
    /** The host's sentence for the last answer it could not pass on; cleared by the next answer that was sent. */
    val failure: String? = null,
    /** How many answers could not be passed on; only grows, so a repeated failure is still a change. */
    val failures: Int = 0,
) {
    // The request's input, the rewritten input and the unreadable request are what the user and the CLI said: never
    // in a log.
    override fun toString(): String =
        "ApprovalRecord($requestId, ${toolName ?: "no tool"}, ${outcome ?: "open"}, ${suggestions.size} suggestions)"
}

/**
 * One of the request's `permission_suggestions`. [id] is `s1`, `s2`… by its place in that list, so the host finds the
 * suggestion again by position. [kind] is its `type` as the CLI wrote it; [detail] the one thing the type is about
 * (a `setMode`'s mode, an `addDirectories`' directories one to a line), empty for any other type; [destination] is
 * where the CLI would keep it. There is no sentence: the screen words it. [raw] is the item as the CLI sent it, compact
 * JSON, kept so the host can give it back to the CLI unchanged when the user accepts it; the tree never carries it.
 */
data class SuggestionRecord(
    val id: String,
    val kind: String,
    val detail: String,
    val destination: String?,
    val raw: String = "",
) {
    // [raw] holds what the CLI sent (directories, rules): never in a log.
    override fun toString(): String = "SuggestionRecord($id, $kind, ${destination ?: "no destination"})"
}

enum class ApprovalOutcome {
    APPROVED,
    DENIED,
    CANCELLED,
    EXPIRED,
}

/**
 * Where content goes. None of it is shown; it decides which message a line belongs to.
 */
data class Routing(
    /** The key of the message of the turn that is receiving content, between its `started` and its `result`. */
    val currentTurn: String? = null,
    /** The key of the spontaneous-resume message that is open, between its first content and its `result`. */
    val openResume: String? = null,
    /** The Anthropic message the `stream_event` frames belong to, from its `message_start` to its `message_stop`. */
    val streaming: String? = null,
    /** The message key of each started turn, by `command_uuid`. */
    val turns: Map<String, String> = emptyMap(),
    /** How many user messages the host sent. */
    val sends: Int = 0,
    /** The `command_uuid` of each turn open when the user pressed stop, until the next `result`. */
    val stopping: Set<String> = emptySet(),
    /** The turns a stop ended: they do not run any more, whether or not a `result` named them. */
    val stopped: Set<String> = emptySet(),
    /** Where each Anthropic message goes, by its `message.id`. */
    val anthropic: Map<String, AnthropicRoute> = emptyMap(),
    /** The location of the message holding each tool call, by the call's key. */
    val tools: Map<String, List<String>> = emptyMap(),
)

/**
 * The route of one Anthropic message. [location] is the path of keys to the message record that receives its
 * blocks: one top-level message key, or that followed by tool-call key and nested message key pairs.
 * [blocks] counts the blocks its `assistant` snapshot lines carried so far — each line carries the next block,
 * so the count is the next block's index. [streamed] maps a streamed block's index to its part key.
 */
data class AnthropicRoute(
    val location: List<String>,
    val blocks: Int = 0,
    val streamed: Map<Int, String> = emptyMap(),
)
