package dev.ukitomato.closta.presenter.diff

import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonString
import dev.ukitomato.closta.presenter.tree.JsonValue
import dev.ukitomato.closta.presenter.tree.TreeRules

/**
 * The ops that turn [prev] into [next], found by walking both trees together.
 *
 * At each path, below the root:
 * - a node that is the same object in both trees, or an equal value, gives no op. A caller that hands back an
 *   untouched branch as the same object lets the walk spend its time where something changed;
 * - a string that grew at its end gives `append-text` with what was added; any other change of a string gives
 *   `set`. Strings are compared as UTF-16 code units, the units JavaScript appends, so an addition that starts
 *   with the second half of a surrogate pair joins the first half on the webview as it does here;
 * - two objects are walked key by key in [next]'s order: a key new in [next] gives `set` of its value, a key in
 *   both is walked further. The object is set whole instead when [prev] has a key [next] lacks, or [next] has a
 *   key that cannot be a path segment (empty, an array index, `__proto__`, `constructor`, `prototype`);
 * - an array is never entered: if it changed it is set whole, so no path holds a position;
 * - a value that changed kind is set whole.
 *
 * The root follows the same rules, except that it cannot be set whole: where it would be, the result is
 * [Diff.Replace].
 *
 * There is no op that removes a key — the applier knows only `set` and `append-text` — and a key set to null is
 * still there, a null the receiver refuses where it expects a node. So the object that lost a key is set whole.
 * That sends again, and re-creates on the webview, everything under it: for a collection, every entity in its
 * `byId`, none of which whatever recognises them by object (the converter cache in assistant-ui) recognises
 * afterwards. A removal costs the size of the object that held the key; how often that happens is the caller's.
 *
 * The result is fixed by the two values: the walk goes depth first in [next]'s key order, so the same trees, or
 * copies of them, always give the same list. The walk never goes below a path it wrote, so no op's path is a
 * prefix of another's — the webview checks a patch along each op's path in the tree after the whole patch, and a
 * later op that replaced part of an earlier op's path would fail a correct tree there.
 *
 * An op's path and the depth of its value add up to at most the depth of [next], so a [next] within
 * [TreeRules.MAX_DEPTH] gives ops within the webview's depth limit. That is all the differ says about the values:
 * they go into the ops as they are, so that they are safe for the webview — no unsafe member, no number that is not
 * finite ([TreeRules.fits]) — is a premise of the input, not something the differ checks or mends.
 */
fun structuralDiff(
    prev: JsonObject,
    next: JsonObject,
): Diff =
    when {
        prev === next -> Diff.Ops(emptyList())
        !takesKeys(prev, next) -> if (prev == next) Diff.Ops(emptyList()) else Diff.Replace
        else -> Diff.Ops(Walk().apply { members(prev, next) }.ops)
    }

/**
 * Whether [next] can be reached from [prev] by ops below them: no key of [prev] is gone, and every key of [next]
 * can be a path segment. Otherwise the object has to be set whole.
 */
private fun takesKeys(
    prev: JsonObject,
    next: JsonObject,
): Boolean = prev.keys.all(next::containsKey) && next.keys.all(TreeRules::isKey)

/** One walk: the path it stands at and the ops found so far. */
private class Walk {
    private val path = ArrayList<String>()
    val ops = ArrayList<Op>()

    fun members(
        prev: JsonObject,
        next: JsonObject,
    ) {
        for ((key, value) in next.entries) {
            path.add(key)
            val old = prev[key]
            if (old == null) ops.add(Op.Set(path, value)) else node(old, value)
            path.removeAt(path.lastIndex)
        }
    }

    private fun node(
        prev: JsonValue,
        next: JsonValue,
    ) {
        when {
            prev === next -> Unit
            prev is JsonObject && next is JsonObject -> obj(prev, next)
            prev is JsonString && next is JsonString -> text(prev, next)
            prev != next -> ops.add(Op.Set(path, next))
        }
    }

    // Walking two equal objects key by key gives no op, so equality is only asked where the walk would not go in.
    private fun obj(
        prev: JsonObject,
        next: JsonObject,
    ) {
        when {
            takesKeys(prev, next) -> members(prev, next)
            prev != next -> ops.add(Op.Set(path, next))
        }
    }

    private fun text(
        prev: JsonString,
        next: JsonString,
    ) {
        val old = prev.value
        val new = next.value
        when {
            new.length > old.length && new.startsWith(old) -> ops.add(Op.AppendText(path, new.substring(old.length)))
            new != old -> ops.add(Op.Set(path, next))
        }
    }
}
