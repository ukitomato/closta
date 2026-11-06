package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonRead
import dev.ukitomato.closta.presenter.tree.JsonString
import dev.ukitomato.closta.presenter.tree.JsonText
import dev.ukitomato.closta.presenter.tree.JsonValue
import dev.ukitomato.closta.presenter.tree.TreeRules

/** What a tool call holds from the CLI, made safe for the place it goes. */
internal class ToolLeaves(
    val argsText: String,
    val args: JsonObject,
    val result: JsonValue?,
    val isError: Boolean?,
)

/**
 * `args` is the snapshot's input when it came, else what [argsText] parses to once its stream has stopped:
 * parsing every fragment while it streams would read the input over and over, and a fragment rarely parses.
 *
 * Values from the CLI go into the tree only when they fit where they go: no member that reaches a prototype
 * and no deeper than the room left under [level]. A value that does not fit is folded into its JSON text,
 * which keeps what it said; `args` must stay an object, so it becomes empty, and `argsText` still has the text.
 */
internal fun toolLeaves(
    argsText: String,
    input: JsonValue?,
    result: ToolResult?,
    level: Int,
    streaming: Boolean,
): ToolLeaves {
    val room = TreeRules.MAX_DEPTH - level
    val finished = argsText.takeIf { !streaming && it.isNotEmpty() }
    val candidate = input as? JsonObject ?: finished?.let(::readObject) ?: JsonObject.EMPTY
    val args = if (TreeRules.fits(candidate, room)) candidate else JsonObject.EMPTY
    val content = result?.content
    val shown = content?.let { if (TreeRules.fits(it, room)) it else JsonString(JsonText.compact(it)) }
    return ToolLeaves(argsText, args, shown, result?.isError)
}

private fun readObject(text: String): JsonObject? = JsonRead.parse(text) as? JsonObject
