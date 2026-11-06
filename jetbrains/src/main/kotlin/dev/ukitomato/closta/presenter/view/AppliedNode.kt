package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.presenter.tree.JsonBool
import dev.ukitomato.closta.presenter.tree.JsonNumber
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonString

/** The last answer to the webview's `apply-code`: the lines written or a failure (never the text). */
internal fun appliedNode(record: ApplyRecord): JsonObject {
    val node = JsonObject.Builder().put("commandId", JsonString(record.commandId))
    when (val answer = record.answer) {
        is ApplyAnswer.Written ->
            node
                .put("path", JsonString(answer.path))
                .put("startLine", JsonNumber(answer.startLine.toString()))
                .put("endLine", JsonNumber(answer.endLine.toString()))
                .put("undoable", JsonBool.of(answer.undoable))
        is ApplyAnswer.Failed -> node.put("failure", JsonString(answer.failure))
    }
    return node.build()
}
