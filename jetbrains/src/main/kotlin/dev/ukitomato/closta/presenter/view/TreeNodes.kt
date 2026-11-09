package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.presenter.tree.JsonArray
import dev.ukitomato.closta.presenter.tree.JsonBool
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonString

// The tree's vocabulary is the protocol's, field for field; nothing here adds a key of its
// own, because the webview passes unknown keys on to assistant-ui untouched.

/**
 * The levels of the tree's fixed skeleton, the root being 1 (MAX_DEPTH counts the same way): root,
 * `threads`, its `byId`, the thread, `messages`, its `byId`, the message, `parts`, its `byId`, the part.
 */
internal object Levels {
    const val THREAD = 4
    const val TOP_MESSAGES = THREAD + 1

    // From a collection to an entity in it: the collection, its byId, the entity.
    private const val COLLECTION_TO_ENTITY = 2

    /** The level of a message whose collection sits at [collection]. */
    fun messageIn(collection: Int): Int = collection + COLLECTION_TO_ENTITY

    /** The level of a part of a message at [message]: `parts` is one below the message. */
    fun partOf(message: Int): Int = message + 1 + COLLECTION_TO_ENTITY

    /** The level of the collection of messages nested under a part at [part]. */
    fun nestedUnder(part: Int): Int = part + 1
}

/** A status of a message or part; [node] is how the tree spells it, shared so equal statuses are one object. */
internal enum class Status(
    val node: JsonObject?,
) {
    RUNNING(status("running")),
    REQUIRES_ACTION(status("requires-action", "interrupt")),
    COMPLETE(status("complete")),
    COMPLETE_STOP(status("complete", "stop")),
    COMPLETE_UNKNOWN(status("complete", "unknown")),
    CANCELLED(status("incomplete", "cancelled")),

    /** A failure; its node carries the error, so it is made per failure ([failed]). */
    FAILED(null),
    ;

    /** Whether the work it describes was cut off or failed. */
    val incomplete: Boolean get() = this == CANCELLED || this == FAILED
}

/** The node of [status], with [error] when it is [Status.FAILED] and the failure said something. */
internal fun statusNode(
    status: Status,
    error: String?,
): JsonObject {
    val failed = JsonObject.Builder().put("type", JsonString("incomplete")).put("reason", JsonString("error"))
    if (!error.isNullOrEmpty()) failed.put("error", JsonString(error))
    return status.node ?: failed.build()
}

private fun status(
    type: String,
    reason: String? = null,
): JsonObject =
    if (reason == null) {
        JsonObject.of("type" to JsonString(type))
    } else {
        JsonObject.of("type" to JsonString(type), "reason" to JsonString(reason))
    }

internal fun collectionNode(
    order: JsonArray,
    byId: JsonObject,
): JsonObject = JsonObject.of("order" to order, "byId" to byId)

internal fun rootNode(threads: JsonObject): JsonObject = JsonObject.of("threads" to threads)

internal fun messageNode(
    key: String,
    role: Role,
    look: Look,
    parts: JsonObject,
): JsonObject {
    val node = JsonObject.Builder().put("id", JsonString(key)).put("role", JsonString(role.wire))
    look.status?.let { node.put("status", statusNode(it, look.error)) }
    return node.put("parts", parts).build()
}

internal fun textNode(
    record: TextRecord,
    status: Status?,
): JsonObject {
    val node =
        JsonObject
            .Builder()
            .put(
                "type",
                JsonString(if (record.reasoning) "reasoning" else "text"),
            ).put("text", JsonString(record.text))
    status?.let { node.put("status", statusNode(it, null)) }
    return node.build()
}

/**
 * The part kinds the protocol knows. A block of an unknown type spelled like one of them would claim fields it lacks,
 * and one without a type names nothing, so both show as `unknown`.
 */
private val KNOWN_PART_TYPES = setOf("text", "reasoning", "tool-call", "attachment")

internal fun otherNode(record: OtherRecord): JsonObject {
    val type = record.type.takeUnless { it.isEmpty() || it in KNOWN_PART_TYPES } ?: "unknown"
    return JsonObject.of("type" to JsonString(type))
}

internal fun toolCallNode(
    key: String,
    toolName: String,
    leaves: ToolLeaves,
    look: Look,
    messages: JsonObject?,
): JsonObject {
    val node =
        JsonObject
            .Builder()
            .put("type", JsonString("tool-call"))
            .put("toolCallId", JsonString(key))
            .put("toolName", JsonString(toolName))
            .put("argsText", JsonString(leaves.argsText))
            .put("args", leaves.args)
    leaves.result?.let { node.put("result", it) }
    leaves.isError?.let { node.put("isError", JsonBool.of(it)) }
    look.status?.let { node.put("status", statusNode(it, look.error)) }
    look.approval?.let { node.put("approval", it) }
    messages?.let { node.put("messages", it) }
    return node.build()
}

/**
 * An approval as the tree shows it. A question shows its options when they can be read ([question]); one that cannot
 * be answered by choosing shows as a decision, with the question's text when that can be read. While it is
 * pending it says only what is asked;
 * once it is not, it says how it ended — the host's answer, or cancelled when the CLI stopped waiting without
 * one (a `result` discarded it).
 */
internal fun approvalNode(
    record: ApprovalRecord,
    pending: Boolean,
    question: Question?,
    level: Int,
): JsonObject {
    // An answer is chosen by its label: that is what `updatedInput.answers` carries back (capture 14).
    fun option(option: AnswerOption): JsonObject {
        val node = JsonObject.Builder().put("id", JsonString(option.id)).put("kind", JsonString("answer"))
        node.put("label", JsonString(option.label))
        option.description?.let { node.put("description", JsonString(it)) }
        return node.build()
    }

    val node = JsonObject.Builder().put("id", JsonString(record.requestId))
    val choices = question?.options.orEmpty()
    node.put("display", JsonString(if (choices.isEmpty()) "decision" else "select"))
    question?.prompt?.let { node.put("prompt", JsonString(it)) }
    if (choices.isNotEmpty()) node.put("options", JsonArray(choices.map(::option)))
    inputNode(record, level)?.let { node.put("input", it) }
    if (record.suggestions.isNotEmpty()) node.put("suggestions", JsonArray(record.suggestions.map(::suggestionNode)))
    if (question != null && question.questions.isNotEmpty()) {
        node.put("questions", JsonArray(question.questions.map(::questionNode)))
    }
    if (!pending) settled(node, record.outcome)
    answerNodes(node, record, level)
    return node.build()
}
