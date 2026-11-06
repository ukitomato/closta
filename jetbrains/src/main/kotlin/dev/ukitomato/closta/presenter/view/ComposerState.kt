package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.ConversationState

/**
 * What the composer shows, worked out from the conversation: the model and effort in effect, the permission mode,
 * the context used, the switch waiting for an answer. Every name and level is the CLI's own; nothing is written into
 * the plugin.
 */
data class ComposerState(
    val model: ModelChoice,
    val models: List<ModelChoice>,
    /** The model in use when the CLI's list does not name it (shown as a disabled first row). */
    val unknownModel: String?,
    val effort: String?,
    /** The levels the model in effect takes; empty when it takes none. */
    val effortLevels: List<String>,
    /** Effort can be changed only between turns (the CLI refuses it during one). */
    val effortEnabled: Boolean,
    val mode: String?,
    val modes: List<String>,
    val context: ContextRecord?,
    val tokens: TokenTotals?,
    val costUsd: Double?,
    /** The last model, mode or effort switch still waiting for the CLI's answer. */
    val switching: SwitchRecord?,
    val running: Boolean,
    /** Stop was pressed and the CLI has not answered with a `result` yet. */
    val stopping: Boolean,
    val commands: List<SlashCommandRecord>,
)

/** One row of the model list. [label] is what the button says; [resolved] the model's full id, when the CLI gave it. */
data class ModelChoice(
    val value: String,
    val label: String,
    val description: String,
    val resolved: String?,
)

/** The CLI's permission modes, in the order Shift+Tab goes through them. */
val PERMISSION_MODES: List<String> = listOf("default", "acceptEdits", "plan", "auto", "dontAsk", "bypassPermissions")

private const val DEFAULT_MODEL = "default"
private const val DEFAULT_WORD = "Default"
private val SWITCHES_SHOWN = setOf(SwitchKind.MODEL, SwitchKind.MODE, SwitchKind.EFFORT)

fun composerState(
    conversation: ConversationState,
    transcript: Transcript,
): ComposerState {
    val operations = transcript.operations
    val records = operations.models
    val inUse = conversation.session?.model ?: operations.appliedModel
    val (chosen, unknown, model) = inEffect(operations, inUse)
    val running = threadIsRunning(conversation, transcript)
    return ComposerState(
        model = model,
        models = records.map { choiceOf(it, records, inUse) },
        unknownModel = unknown,
        effort = operations.effort,
        effortLevels = if (chosen?.supportsEffort == true) chosen.supportedEffortLevels.orEmpty() else emptyList(),
        effortEnabled = !running,
        mode =
            conversation.session?.permissionMode ?: lastApplied(operations, SwitchKind.MODE)
                ?: operations.startPermissionMode,
        modes = PERMISSION_MODES,
        context = operations.context,
        tokens = operations.tokens,
        costUsd = conversation.usage.sessionCostUsd.takeIf { it > 0.0 },
        switching = operations.switches.lastOrNull { it.kind in SWITCHES_SHOWN && it.outcome == SwitchOutcome.PENDING },
        running = running,
        stopping = running && transcript.routing.stopping.isNotEmpty(),
        commands = transcript.commands.items,
    )
}

private data class InEffect(
    val chosen: ModelRecord?,
    val unknown: String?,
    val model: ModelChoice,
)

/**
 * The model in effect: the last switch the CLI applied, else the model it says it uses matched to a row by value or
 * full id, else the default row. A model the list does not name is [InEffect.unknown].
 */
private fun inEffect(
    operations: OperationRecords,
    inUse: String?,
): InEffect {
    val records = operations.models
    val switched = lastApplied(operations, SwitchKind.MODEL)
    val chosen =
        switched?.let { value -> records.firstOrNull { it.value == value } }
            ?: inUse?.let { id -> records.firstOrNull { it.value == id || it.resolvedModel == id } }
            ?: records.firstOrNull { it.value == DEFAULT_MODEL }.takeIf { inUse == null }
    val unknown = if (chosen == null && switched == null) inUse else null
    val model =
        when {
            chosen != null -> choiceOf(chosen, records, inUse)
            unknown != null -> ModelChoice(unknown, unknown, "", unknown)
            else -> ModelChoice(DEFAULT_MODEL, DEFAULT_WORD, "", null)
        }
    return InEffect(chosen, unknown, model)
}

private fun lastApplied(
    operations: OperationRecords,
    kind: SwitchKind,
): String? = operations.switches.lastOrNull { it.kind == kind && it.outcome == SwitchOutcome.APPLIED }?.value

/** The row for [record]; the default row names the model it stands for, in brackets, as the CLI shows it. */
private fun choiceOf(
    record: ModelRecord,
    records: List<ModelRecord>,
    inUse: String?,
): ModelChoice {
    if (record.value != DEFAULT_MODEL) {
        return ModelChoice(record.value, record.displayName, record.description, record.resolvedModel)
    }
    val behind =
        inUse?.let { id ->
            records.firstOrNull { it.value != DEFAULT_MODEL && (it.value == id || it.resolvedModel == id) }?.displayName
                ?: id
        }
    val label = if (behind == null) DEFAULT_WORD else "$DEFAULT_WORD ($behind)"
    return ModelChoice(record.value, label, record.description, inUse)
}

/** The label for a narrow composer: "Default (Opus 5.5)" says only "Opus 5.5". */
fun shortLabel(choice: ModelChoice): String =
    choice.label
        .removePrefix("$DEFAULT_WORD (")
        .takeIf { it != choice.label }
        ?.removeSuffix(")") ?: choice.label

fun modeLabel(mode: String): String =
    when (mode) {
        "default" -> "Default"
        "acceptEdits" -> "Accept Edits"
        "plan" -> "Plan"
        "auto" -> "Auto"
        "dontAsk" -> "Don't Ask"
        "bypassPermissions" -> "Bypass Permissions"
        else -> mode
    }

fun shortModeLabel(mode: String): String =
    when (mode) {
        "acceptEdits" -> "Edits"
        "bypassPermissions" -> "Bypass"
        else -> modeLabel(mode)
    }

fun effortLabel(level: String): String =
    when (level) {
        "low" -> "Low"
        "medium" -> "Medium"
        "high" -> "High"
        "xhigh" -> "Extra High"
        "max" -> "Max"
        else -> level
    }
