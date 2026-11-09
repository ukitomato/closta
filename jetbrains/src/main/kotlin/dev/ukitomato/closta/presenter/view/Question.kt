package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.presenter.tree.JsonBool
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonValue

/**
 * What an `AskUserQuestion` asks, as the approval shows it: the first question's text and options (what the parts
 * that show one prompt read), and [questions], all of them.
 */
internal data class Question(
    val prompt: String?,
    val options: List<AnswerOption>,
    val questions: List<AskedQuestion> = emptyList(),
)

/**
 * One of the questions of a call: [id] is `q1`, `q2`… by its place among them ([questionId]), and its options are
 * made as the first question's are. The projection and the answer made for it ([askedQuestions]) are the same
 * function, so an id means the same question on both sides.
 */
internal data class AskedQuestion(
    val id: String,
    val prompt: String?,
    val multiSelect: Boolean,
    val options: List<AnswerOption>,
)

/** The id of the question at [position] (from 0) among the questions of a call. */
internal fun questionId(position: Int): String = "q${position + 1}"

/** One answer. [id] is the label, made unique within the question when two options share one. */
internal data class AnswerOption(
    val id: String,
    val label: String,
    val description: String?,
)

/**
 * What a request asks: the options from the request's input, else from the tool call's own input (the same
 * `questions[0]` shape), and the question's text from whichever has it. Null when neither says anything; a
 * question without options cannot be answered by choosing, but its text is still worth showing.
 */
internal fun askedQuestion(
    request: JsonValue?,
    call: JsonValue?,
): Question? {
    val fromRequest = askedQuestions(request)
    val fromCall = askedQuestions(call)
    val first = fromRequest.firstOrNull()
    val options = first?.options?.takeIf { it.isNotEmpty() } ?: fromCall.firstOrNull()?.options.orEmpty()
    val prompt = first?.prompt ?: fromCall.firstOrNull()?.prompt
    val all = fromRequest.ifEmpty { fromCall }
    return if (options.isEmpty() && prompt == null && all.isEmpty()) null else Question(prompt, options, all)
}

/**
 * The questions of [input] (an `AskUserQuestion`'s), in order: the entries of `questions` that are objects, each with
 * the options it lists. A question without text has no prompt: it still has options to choose from.
 */
internal fun askedQuestions(input: JsonValue?): List<AskedQuestion> =
    (input as? JsonObject)
        ?.array("questions")
        ?.items
        .orEmpty()
        .filterIsInstance<JsonObject>()
        .mapIndexed { position, question ->
            AskedQuestion(
                questionId(position),
                question.string("question"),
                (question["multiSelect"] as? JsonBool)?.value == true,
                optionsOf(question),
            )
        }

/** The options of a question, each id its label, made unique within the question when two share one. */
private fun optionsOf(question: JsonObject): List<AnswerOption> {
    val ids = HashSet<String>()
    return question.array("options")?.items.orEmpty().mapNotNull { item ->
        val fields = item as? JsonObject
        fields?.string("label")?.let { label ->
            val id = claimKey(ids::contains, label)
            ids += id
            AnswerOption(id, label, fields.string("description"))
        }
    }
}
