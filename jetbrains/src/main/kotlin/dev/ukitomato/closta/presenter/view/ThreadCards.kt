package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.presenter.tree.JsonBool
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonRead
import dev.ukitomato.closta.presenter.tree.JsonString
import dev.ukitomato.closta.presenter.tree.JsonText
import dev.ukitomato.closta.presenter.tree.JsonValue

/** What the CLI asked the user, drawn as a card in the conversation (never as a dialog in the middle of the screen). */
sealed interface ThreadCard {
    val requestId: String

    /** How it was answered; null while it waits. */
    val answered: ApprovalOutcome?
}

/**
 * A tool the CLI asks to run. [subject] is what it would run on: a command or a file, whole, or for another tool the
 * first string of its input. [failure] is the sentence for an answer that could not be passed on.
 */
data class PermissionCard(
    override val requestId: String,
    val toolName: String,
    val subject: String?,
    val suggestions: List<SuggestionRecord>,
    override val answered: ApprovalOutcome?,
    val failure: String?,
    /** The change an `Edit` or `Write` asks to make, as a small diff; null for any other tool. */
    val diff: EditDiff? = null,
    /**
     * The input's keys and values besides [subject]: every key for another tool, every key but `command` and
     * `description` for Bash, every key but the path for MultiEdit and NotebookEdit; none for Edit and Write (their
     * [diff] shows the change) and Read.
     */
    val inputFields: List<InputField> = emptyList(),
    /**
     * Whether [subject], any of [inputFields] or any of [suggestionLines] had a hidden or bidirectional character, now
     * shown as a mark.
     */
    val hiddenMarked: Boolean = false,
    /** Whether [subject] is one of [inputFields] (another tool's first string), so it is not shown a second time. */
    val subjectInFields: Boolean = false,
    /** Whether a Bash call asks to run outside the sandbox (`dangerouslyDisableSandbox` is true). */
    val sandboxOff: Boolean = false,
    /** A file tool's path as the request gives it, to open; [subject] is that path with hidden characters marked. */
    val rawPath: String? = null,
    /** One line per offered suggestion, so "allow for this session" lists everything it accepts. */
    val suggestionLines: List<SuggestionLine> = emptyList(),
) : ThreadCard

/** One suggestion the CLI offered, by its [kind] and the [detail] the screen words it with. */
data class SuggestionLine(
    val kind: String,
    val detail: String,
)

/** The [suggestions] as lines, in the order offered, hidden characters in each detail marked. */
fun suggestionLinesOf(suggestions: List<SuggestionRecord>): List<SuggestionLine> =
    suggestions.map { SuggestionLine(it.kind, visible(it.detail).text) }

/** One key of a tool's input and its value: a string as it is, any other value as compact JSON, hidden ones marked. */
data class InputField(
    val key: String,
    val value: String,
)

/** An `AskUserQuestion`: its questions, each with the options to choose from. */
data class QuestionCard(
    override val requestId: String,
    val questions: List<QuestionView>,
    override val answered: ApprovalOutcome?,
    val failure: String?,
) : ThreadCard

data class QuestionView(
    val text: String,
    val header: String?,
    val multiSelect: Boolean,
    val options: List<QuestionOption>,
)

/** One option of a question: the [label] the answer sends, and the [description] the request gives it, if any. */
data class QuestionOption(
    val label: String,
    val description: String?,
)

/** A card in the conversation, after the message the request came with. */
data class CardRow(
    override val key: String,
    val card: ThreadCard,
    override val opens: Boolean,
) : ThreadRow

private val BY_COMMAND = setOf("Bash")
private val BY_FILE = setOf("Edit", "Write", "Read", "NotebookEdit", "MultiEdit")
private val WITHOUT_FIELDS = setOf("Edit", "Write", "Read")
private const val ASK_TOOL = "AskUserQuestion"

/** The card for [approval]; [go] is where a plan's first choice leads. */
fun cardOf(
    approval: ApprovalRecord,
    go: PlanGo,
): ThreadCard =
    when {
        approval.toolName == PLAN_TOOL -> planCardOf(approval, go)
        approval.toolName == ASK_TOOL || approval.ask -> questionCardOf(approval)
        else -> permissionCardOf(approval)
    }

private fun questionCardOf(approval: ApprovalRecord): QuestionCard {
    val input = approval.input as? JsonObject
    val questions =
        input?.array("questions")?.items.orEmpty().mapNotNull { item ->
            val question = item as? JsonObject ?: return@mapNotNull null
            val text = question.string("question") ?: return@mapNotNull null
            val options =
                question.array("options")?.items.orEmpty().mapNotNull { item ->
                    val option = item as? JsonObject
                    option?.string("label")?.let { QuestionOption(it, option.string("description")) }
                }
            QuestionView(text, question.string("header"), question["multiSelect"].isTrue(), options)
        }
    return QuestionCard(approval.requestId, questions, approval.outcome, approval.failure)
}

private fun permissionCardOf(approval: ApprovalRecord): PermissionCard {
    val input = approval.input as? JsonObject
    val tool = approval.toolName ?: "?"
    val (subjectKey, raw) = subjectOf(tool, input) ?: (null to null)
    val subject = raw?.let(::visible)
    val left = setOfNotNull(subjectKey, "description".takeIf { tool in BY_COMMAND })
    val fields =
        if (input == null || tool in WITHOUT_FIELDS) {
            emptyList()
        } else {
            input.entries.filter { it.key !in left }.map { (key, value) ->
                visible(key) to visible((value as? JsonString)?.value ?: JsonText.compact(value))
            }
        }
    return PermissionCard(
        approval.requestId,
        tool,
        subject?.text,
        approval.suggestions,
        approval.outcome,
        approval.failure,
        editDiff(tool, input),
        fields.map { (key, value) -> InputField(key.text, value.text) },
        subject?.hadHidden == true ||
            fields.any { (key, value) -> key.hadHidden || value.hadHidden } ||
            approval.suggestions.any { visible(it.detail).hadHidden },
        subjectInFields = subject != null && subjectKey == null,
        sandboxOff = tool in BY_COMMAND && input?.get("dangerouslyDisableSandbox").isTrue(),
        rawPath = raw.takeIf { tool in BY_FILE },
        suggestionLines = suggestionLinesOf(approval.suggestions),
    )
}

private fun JsonValue?.isTrue() = this == JsonBool.TRUE

/**
 * The subject and the key it is under: the command or the path; or another tool's first string, under no key, as it
 * stays among the fields.
 */
private fun subjectOf(
    tool: String,
    input: JsonObject?,
): Pair<String?, String>? {
    input ?: return null

    fun keyed(key: String): Pair<String?, String>? = input.string(key)?.let { key to it }
    return when (tool) {
        in BY_COMMAND -> keyed("command")
        in BY_FILE -> keyed("file_path") ?: keyed("notebook_path")
        else -> input.values.firstNotNullOfOrNull { (it as? JsonString)?.value }?.let { null to it }
    }
}

/** What an allow sends: the request's own input, so the tool runs on what it asked for (never on `{}`). */
fun allowPayload(approval: ApprovalRecord): String = JsonText.compact(approval.input ?: JsonObject.EMPTY)

/**
 * What answering a question sends: the request's input with `answers` added, by question text, each answer as
 * [questionAnswers] joins it (captures 14 and 18; a multi-select join is not captured, it follows sdk-tools.d.ts'
 * string value).
 */
fun answerPayload(
    approval: ApprovalRecord,
    answers: Map<String, String>,
): String {
    val input = approval.input as? JsonObject ?: JsonObject.EMPTY
    val builder = JsonObject.Builder()
    input.entries.forEach { (key, value) -> builder.put(key, value) }
    val answered = JsonObject.Builder()
    answers.forEach { (question, answer) -> answered.put(question, JsonString(answer)) }
    builder.put("answers", answered.build())
    return JsonText.compact(builder.build())
}

/** Where the CLI can keep a rule the user allows for good, in the order a card offers them. */
val SUGGESTION_DESTINATIONS: List<String> = listOf("localSettings", "projectSettings", "userSettings", "session")

/**
 * What goes to the CLI with an allow that keeps [accepted] (the suggestions as the CLI sent them, rewritten only where
 * the user chose another place to keep them) and runs on the request's own input.
 */
fun passedOn(
    approval: ApprovalRecord,
    accepted: List<SuggestionRecord>,
): PassedOn =
    PassedOn(
        updatedPermissions = if (accepted.isEmpty()) null else accepted.joinToString(",", "[", "]") { it.raw },
        acceptedSuggestions = accepted.map { it.id },
        input = approval.input as? JsonObject,
    )

/** [suggestion] kept in [destination] instead of where the CLI proposed. */
fun withDestination(
    suggestion: SuggestionRecord,
    destination: String,
): SuggestionRecord {
    val raw = JsonRead.parse(suggestion.raw) as? JsonObject ?: return suggestion
    val builder = JsonObject.Builder()
    raw.entries.forEach { (key, value) -> builder.put(key, value) }
    builder.put("destination", JsonString(destination))
    return suggestion.copy(destination = destination, raw = JsonText.compact(builder.build()))
}
