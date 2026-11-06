@file:Suppress("TooManyFunctions") // the records of the operations: one reader per kind of input, kept together

package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.presenter.tree.JsonNumber
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonRead

// What the operations console shows, kept next to the transcript: what the host asked the CLI to change and how
// each request ended, the models the CLI offers, the context usage, the tokens and the compactions.

/** What a request to the CLI is about. A request is recorded under the id the host made for it, before it is sent. */
enum class ControlKind {
    MODEL,
    MODE,
    CONTEXT,

    /** The list of MCP servers: it waits in its own column, as the usage does. */
    MCP_STATUS,

    /** An MCP server turned on, off, or reconnected; the value is the server's name. */
    MCP_ENABLE,
    MCP_DISABLE,
    MCP_RECONNECT,

    /** The settings in effect (`get_settings`): it waits in its own column, as the usage does. */
    SETTINGS,

    /** The effort changed live (`apply_flag_settings`); the value is the level. */
    EFFORT,
}

/**
 * What a switch the user asked for is about. [EFFORT] is changed live (before, it was a restart, and only its
 * refusal was a record). [RESUME] opens a saved session in a new one: only a refusal is a record of it, and of
 * [ATTACHMENT] (a message the host did not send).
 */
enum class SwitchKind(
    val wire: String,
) {
    MODEL("model"),
    MODE("mode"),
    EFFORT("effort"),
    RESUME("resume"),
    ATTACHMENT("attachment"),
    MCP_ENABLE("mcp-enable"),
    MCP_DISABLE("mcp-disable"),
    MCP_RECONNECT("mcp-reconnect"),
}

/** Whether a switch of this kind is about an MCP server: its sentence is made by `mcpSentence`. */
internal val SwitchKind.isMcp: Boolean get() =
    this == SwitchKind.MCP_ENABLE ||
        this == SwitchKind.MCP_DISABLE ||
        this == SwitchKind.MCP_RECONNECT

/** How a switch ended. [PENDING] is asked and not answered. */
enum class SwitchOutcome(
    val wire: String,
) {
    PENDING("pending"),
    APPLIED("applied"),
    REJECTED("rejected"),
    FAILED("failed"),
}

/**
 * One switch: what was asked for ([value], as the user chose it), and how it ended. [seq] is its place in the order
 * things were folded, one number for switches and compactions together; [detail] is the sentence of a refusal. The
 * request's [id] is the host's own mark and is never shown in the tree.
 */
data class SwitchRecord(
    val id: String,
    val seq: Int,
    val kind: SwitchKind,
    val value: String,
    val outcome: SwitchOutcome = SwitchOutcome.PENDING,
    val detail: String? = null,
)

/** One model the CLI offers (the `initialize` response's `models`). */
data class ModelRecord(
    val value: String,
    val resolvedModel: String?,
    val displayName: String,
    val description: String,
    val supportsEffort: Boolean?,
    val supportedEffortLevels: List<String>?,
)

/** The last context usage the CLI answered (`get_context_usage`, summary). */
data class ContextRecord(
    val totalTokens: Long,
    val maxTokens: Long,
    val percentage: Double,
    val autoCompactThreshold: Long?,
)

/** One compaction the CLI did (`system/compact_boundary`). */
data class CompactionRecord(
    val seq: Int,
    val trigger: String,
    val preTokens: Long,
    val postTokens: Long,
)

/** The session's tokens so far, summed over the models of the last `result`'s `modelUsage` (a running total). */
data class TokenTotals(
    val input: Long,
    val output: Long,
    val cacheRead: Long,
    val cacheCreation: Long,
)

/**
 * Everything the console shows that core does not keep, as one value so the projection compares it in one step.
 * [seq] is the last number given. [waiting] are the ids of the usage requests not answered yet, oldest first, and
 * [mcpWaiting] those of the MCP status requests (a column of their own, so that neither pushes the other out).
 * [mcpServers] is the last list the CLI gave (null before the first answer, an empty list for a session with no
 * server) and [mcpUnreadable] says the last ask could not be read, so the list is the one before it.
 * [builtInMcpServers] are the names of the in-process servers the session declared when it was opened.
 */
data class OperationRecords(
    val seq: Int = 0,
    val switches: List<SwitchRecord> = emptyList(),
    val waiting: List<String> = emptyList(),
    val context: ContextRecord? = null,
    val compactions: List<CompactionRecord> = emptyList(),
    val compacting: Boolean = false,
    /**
     * The effort in effect: the level the session was started with (`--effort`), then the one the CLI's
     * settings say it sends with its next request (`get_settings`'s `applied.effort`). One field and not two:
     * the webview reads it as the level in effect (the pressed level of the Effort row), and the start level is only a
     * first word for the same thing, which the CLI's answer replaces. An answer whose effort is null (a model that
     * takes none) leaves it as it was: the row is not drawn for such a model.
     */
    val effort: String? = null,
    /**
     * The model the CLI says it uses (`get_settings`'s `applied.model`), known before the first message; null
     * until that answer. Not `session.model` (that is `system/init`'s, which comes after the first message).
     */
    val appliedModel: String? = null,
    /** The ids of the settings requests not answered yet, a column of their own as [mcpWaiting] is. */
    val settingsWaiting: List<String> = emptyList(),
    val models: List<ModelRecord> = emptyList(),
    /** The permission mode the `initialize` response says the CLI is in; null until that answer. */
    val startPermissionMode: String? = null,
    val tokens: TokenTotals? = null,
    val mcpWaiting: List<String> = emptyList(),
    val mcpServers: List<McpServerRecord>? = null,
    val mcpUnreadable: Boolean = false,
    val builtInMcpServers: List<String> = emptyList(),
    /** The last rewind of the files the webview asked for; null before the first. */
    val rewind: RewindRecord? = null,
)

/** The most switches kept (the newest); an answer for one pushed out is an answer for an id nobody knows. */
const val MAX_SWITCHES = 20

/** The most usage requests kept while they wait for an answer (the newest): a CLI that never answers cannot fill it. */
const val MAX_WAITING = 5

/** The most compactions kept (the newest). */
const val MAX_COMPACTIONS = 20

/** The sentence of an effort switch the host refused because a turn was running. */
const val EFFORT_REFUSED_TURN = "A turn is running"

internal fun OperationRecords.control(input: PresenterInput.ControlRequested): OperationRecords {
    if (knows(input.requestId)) return this
    return when (input.kind) {
        ControlKind.CONTEXT -> copy(waiting = (waiting + input.requestId).takeLast(MAX_WAITING))
        ControlKind.MCP_STATUS -> copy(mcpWaiting = (mcpWaiting + input.requestId).takeLast(MAX_WAITING))
        ControlKind.MCP_ENABLE -> withSwitch(mcpSwitch(input, SwitchKind.MCP_ENABLE))
        ControlKind.MCP_DISABLE -> withSwitch(mcpSwitch(input, SwitchKind.MCP_DISABLE))
        ControlKind.MCP_RECONNECT -> withSwitch(mcpSwitch(input, SwitchKind.MCP_RECONNECT))
        ControlKind.MODEL -> withSwitch(SwitchRecord(input.requestId, seq + 1, SwitchKind.MODEL, input.value.orEmpty()))
        ControlKind.MODE -> withSwitch(SwitchRecord(input.requestId, seq + 1, SwitchKind.MODE, input.value.orEmpty()))
        ControlKind.SETTINGS -> copy(settingsWaiting = (settingsWaiting + input.requestId).takeLast(MAX_WAITING))
        ControlKind.EFFORT ->
            withSwitch(SwitchRecord(input.requestId, seq + 1, SwitchKind.EFFORT, input.value.orEmpty()))
    }
}

/** The host refused an effort switch: it is a record that is over at once. */
internal fun OperationRecords.refuseEffort(input: PresenterInput.EffortRefused): OperationRecords =
    if (switches.any { it.id == input.requestId }) {
        this
    } else {
        withSwitch(
            SwitchRecord(
                input.requestId,
                seq + 1,
                SwitchKind.EFFORT,
                input.effort,
                SwitchOutcome.REJECTED,
                EFFORT_REFUSED_TURN,
            ),
        )
    }

internal fun OperationRecords.withSwitch(record: SwitchRecord): OperationRecords =
    copy(seq = record.seq, switches = (switches + record).takeLast(MAX_SWITCHES))

/** The request could not be written: a switch fails, a usage request is not waited for. */
internal fun OperationRecords.sendFailed(requestId: String): OperationRecords =
    rewindSendFailed(requestId) ?: when {
        requestId in waiting -> copy(waiting = waiting - requestId)
        requestId in settingsWaiting -> copy(settingsWaiting = settingsWaiting - requestId)
        // The list could not be asked for: what is shown is the one before, and it says so.
        requestId in mcpWaiting -> copy(mcpWaiting = mcpWaiting - requestId, mcpUnreadable = true)
        else -> settle(requestId) { it.copy(outcome = SwitchOutcome.FAILED) }
    }

/** Whether [requestId] is already recorded: a switch, or a request still waited for. */
private fun OperationRecords.knows(requestId: String): Boolean =
    switches.any { it.id == requestId } ||
        requestId in waiting ||
        requestId in mcpWaiting ||
        requestId in settingsWaiting

/**
 * The CLI's answer to [event]'s request. An id nobody asked with, or an answer to a settled one, changes nothing.
 * One branch per kind of request the host sends: split, they no longer read as one table.
 */
@Suppress("CyclomaticComplexMethod")
internal fun OperationRecords.answered(event: AgentEvent.ControlResponse): OperationRecords {
    val id = event.requestId ?: return this
    val succeeded = event.subtype == "success"
    return rewindAnswered(event) ?: when {
        id in waiting -> {
            val body = (JsonRead.parse(event.response.text) as? JsonObject)?.obj("response")
            val read = if (succeeded) body?.let(::contextOf) else null
            copy(waiting = waiting - id, context = read ?: context)
        }
        id in mcpWaiting -> mcpAnswered(id, event)
        id in settingsWaiting -> settingsAnswered(id, event)
        succeeded -> {
            val record = switches.firstOrNull { it.id == id }
            val settled =
                settle(id) { it.copy(outcome = SwitchOutcome.APPLIED) }.let {
                    // An effort applied is in effect from the next request: shown at once, and the settings asked
                    // after it (SessionRuntime) say what the CLI really took.
                    val effortApplied = record?.kind == SwitchKind.EFFORT && record.outcome == SwitchOutcome.PENDING
                    if (effortApplied && record.value.isNotEmpty()) it.copy(effort = record.value) else it
                }
            // A switch that ended now (not one already over) is written into the last list.
            if (record != null && record.outcome == SwitchOutcome.PENDING) settled.mcpSwitchApplied(record) else settled
        }
        else ->
            settle(id) {
                it.copy(outcome = SwitchOutcome.REJECTED, detail = sentenceOf(event.error, it.kind))
            }
    }
}

// A refusal of an MCP switch says what `mcpSentence` makes of the CLI's error (a first line of at most 200 characters,
// its URLs without userinfo and query); the model's and the mode's stay as they were (500 characters).
private fun sentenceOf(
    error: String?,
    kind: SwitchKind,
): String =
    if (kind.isMcp) {
        error?.let(::mcpSentence)?.takeIf { it.isNotEmpty() } ?: NO_SENTENCE
    } else {
        plainSentenceOf(error)
    }

/**
 * The answer to a settings request: `response.response.applied`'s `effort` and `model` (capture 28). A refusal,
 * or an answer without them, leaves what was shown.
 */
private fun OperationRecords.settingsAnswered(
    id: String,
    event: AgentEvent.ControlResponse,
): OperationRecords {
    val applied =
        if (event.subtype == "success") {
            (JsonRead.parse(event.response.text) as? JsonObject)?.obj("response")?.obj("applied")
        } else {
            null
        }
    return copy(
        settingsWaiting = settingsWaiting - id,
        effort = applied?.string("effort")?.takeIf { it.isNotEmpty() } ?: effort,
        appliedModel = applied?.string("model")?.takeIf { it.isNotEmpty() } ?: appliedModel,
    )
}

/**
 * Whether [event] is an answer after which the host asks the CLI for its settings: the answer to `initialize`
 * (it lists the models), or the success of a model or effort switch still pending here (a new model has its own
 * default effort; an effort is read back as the CLI took it). Read on the records **before** the event is folded.
 */
fun OperationRecords.asksForSettings(event: AgentEvent): Boolean {
    if (event !is AgentEvent.ControlResponse || event.subtype != "success") return false
    val id = event.requestId
    val switched =
        switches.any {
            it.id == id &&
                it.outcome == SwitchOutcome.PENDING &&
                (it.kind == SwitchKind.MODEL || it.kind == SwitchKind.EFFORT)
        }
    return switched || modelsOfResponse(JsonRead.parse(event.response.text)) != null
}

private fun OperationRecords.settle(
    id: String,
    change: (SwitchRecord) -> SwitchRecord,
): OperationRecords {
    val record = switches.firstOrNull { it.id == id }
    if (record == null || record.outcome != SwitchOutcome.PENDING) return this
    return copy(switches = switches.map { if (it === record) change(it) else it })
}

private fun contextOf(body: JsonObject): ContextRecord? {
    val total = body.count("totalTokens")
    val max = body.count("maxTokens")
    val percentage = body.number("percentage")?.takeIf { it.isFinite() && it >= 0 }
    if (total == null || max == null || percentage == null) return null
    return ContextRecord(total, max, percentage, body.count("autoCompactThreshold"))
}

/** A non-negative whole number member; anything else reads as absent. */
internal fun JsonObject.count(key: String): Long? = (this[key] as? JsonNumber)?.text?.toLongOrNull()?.takeIf { it >= 0 }

internal fun JsonObject.number(key: String): Double? = (this[key] as? JsonNumber)?.text?.toDoubleOrNull()
