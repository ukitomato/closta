package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.presenter.tree.JsonArray
import dev.ukitomato.closta.presenter.tree.JsonBool
import dev.ukitomato.closta.presenter.tree.JsonNumber
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonString
import dev.ukitomato.closta.presenter.tree.TreeRules

// The parts of an approval the tree shows besides its decision (ApprovalSuggestion and ApprovalQuestion).

/** One suggestion the CLI offered: its id, kind, detail and, when it has one, where it would be kept. */
internal fun suggestionNode(offered: SuggestionRecord): JsonObject {
    val node =
        JsonObject
            .Builder()
            .put("id", JsonString(offered.id))
            .put("kind", JsonString(offered.kind))
            .put("detail", JsonString(offered.detail))
    offered.destination?.let { node.put("destination", JsonString(it)) }
    return node.build()
}

/** One question of a call, with its own options. A question without text shows the empty prompt. */
internal fun questionNode(asked: AskedQuestion): JsonObject {
    val options =
        asked.options.map { choice ->
            val entry = JsonObject.Builder().put("id", JsonString(choice.id)).put("label", JsonString(choice.label))
            choice.description?.let { entry.put("description", JsonString(it)) }
            entry.build()
        }
    return JsonObject
        .Builder()
        .put("id", JsonString(asked.id))
        .put("prompt", JsonString(asked.prompt.orEmpty()))
        .put("multiSelect", JsonBool.of(asked.multiSelect))
        .put("options", JsonArray(options))
        .build()
}

/**
 * What the host did with the answer and what it could not do: the suggestions it passed on, the input it sent when
 * that is not the request's own, and the sentence for the last answer that did not go through with how many there were.
 */
internal fun answerNodes(
    node: JsonObject.Builder,
    record: ApprovalRecord,
    level: Int,
) {
    if (record.acceptedSuggestions.isNotEmpty()) {
        node.put("acceptedSuggestions", JsonArray(record.acceptedSuggestions.map(::JsonString)))
    }
    record.updatedInput
        ?.takeIf { TreeRules.fits(it, TreeRules.MAX_DEPTH - level - 1) }
        ?.let { node.put("updatedInput", it) }
    record.failure?.let { node.put("failure", JsonString(it)) }
    if (record.failures > 0) node.put("failures", JsonNumber.of(record.failures.toLong()))
}

/** How an approval that is no longer pending ended: the host's answer, or cancelled when none came. */
internal fun settled(
    node: JsonObject.Builder,
    outcome: ApprovalOutcome?,
) {
    when (outcome) {
        ApprovalOutcome.APPROVED -> node.put("approved", JsonBool.TRUE)
        ApprovalOutcome.DENIED -> node.put("approved", JsonBool.FALSE)
        ApprovalOutcome.EXPIRED -> node.put("resolution", JsonString("expired"))
        ApprovalOutcome.CANCELLED, null -> node.put("resolution", JsonString("cancelled"))
    }
}

/**
 * What the request would run with, for the webview to start a rewritten input from: the request's `input` when it is
 * an object that fits under the approval at [level] (the level of the part the approval sits on, as for a tool call's
 * `args`); an input that does not is left out, as it is not an input to rewrite.
 */
internal fun inputNode(
    record: ApprovalRecord,
    level: Int,
): JsonObject? = (record.input as? JsonObject)?.takeIf { TreeRules.fits(it, TreeRules.MAX_DEPTH - level - 1) }
