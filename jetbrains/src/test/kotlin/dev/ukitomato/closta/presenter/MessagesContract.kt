package dev.ukitomato.closta.presenter

import dev.ukitomato.closta.presenter.TreeContract.Issue
import dev.ukitomato.closta.presenter.tree.JsonArray
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonString
import dev.ukitomato.closta.presenter.tree.JsonValue

/**
 * A Kotlin copy of `parseHostMessage` in the webview's TypeScript receiver: what the webview makes of each message
 * the host sends, before the receiver's rule ([SyncContract]) decides what to do with it. The checks of the tree and
 * the ops are [TreeContract]'s, as the original takes them from its tree and op checks. It is a copy for the tests that
 * keeps the TypeScript's branches, so the receiver can be replayed without Node; `SyncContractTest` shows the copy
 * agrees with the original on the sync fixtures.
 */
object MessagesContract {
    /** What `parseHostMessage` returns: the message as the receiver reads it, or the first fault. */
    sealed interface Parsed {
        data class Rejected(
            val issue: Issue,
        ) : Parsed

        data class Snapshot(
            val epoch: String,
            val seq: Long,
            val tree: JsonObject,
        ) : Parsed

        data class Patch(
            val epoch: String,
            val seq: Long,
            val ops: List<JsonValue>,
        ) : Parsed

        data class Theme(
            val message: JsonObject,
        ) : Parsed

        data class Capabilities(
            val message: JsonObject,
        ) : Parsed
    }

    private val tokenName = Regex("^--[A-Za-z0-9_-]+$")
    private val tokenValue = Regex("^[A-Za-z0-9 #%.,()+\\-*/_]{1,200}$")
    private val tokenCall = Regex("([A-Za-z0-9_-]*)\\(")
    private val tokenFunctions =
        setOf(
            "",
            "rgb",
            "rgba",
            "hsl",
            "hsla",
            "hwb",
            "lab",
            "lch",
            "oklab",
            "oklch",
            "color",
            "color-mix",
            "calc",
            "min",
            "max",
            "clamp",
            "var",
        )

    private fun rejected(
        code: String,
        at: String,
    ) = Parsed.Rejected(Issue(code, at))

    private fun count(value: JsonValue?): Long = TreeContract.number(value).toLong()

    fun parseHostMessage(raw: JsonValue?): Parsed {
        if (raw !is JsonObject || raw["type"] !is JsonString) return rejected("malformed", "message")
        return when ((raw["type"] as JsonString).value) {
            "snapshot" -> snapshot(raw)
            "patch" -> patch(raw)
            "theme" -> theme(raw)
            "capabilities" -> capabilities(raw)
            else -> rejected("unknown-type", "message.type")
        }
    }

    // The envelope is checked where TreeContract.checkSnapshot checks it, so the two copies cannot part.
    private fun snapshot(raw: JsonObject): Parsed =
        TreeContract.snapshotIssue(raw)?.let(Parsed::Rejected)
            ?: Parsed.Snapshot((raw["epoch"] as JsonString).value, count(raw["seq"]), raw["tree"] as JsonObject)

    private fun patch(raw: JsonObject): Parsed {
        TreeContract.checkPatch(raw)?.let { return Parsed.Rejected(it) }
        val ops = (raw["ops"] as JsonArray).items
        return Parsed.Patch((raw["epoch"] as JsonString).value, count(raw["seq"]), ops)
    }

    private fun isTokenValue(value: JsonValue?): Boolean {
        if (value !is JsonString || !tokenValue.matches(value.value)) return false
        return tokenCall.findAll(value.value).all { it.groupValues[1].lowercase() in tokenFunctions }
    }

    @Suppress("ReturnCount")
    private fun theme(raw: JsonObject): Parsed {
        val kind = (raw["kind"] as? JsonString)?.value
        if (kind != "light" && kind != "dark") return rejected("malformed", "theme.kind")
        val tokens = raw["tokens"] as? JsonObject ?: return rejected("malformed", "theme.tokens")
        for (name in TreeContract.jsKeyOrder(tokens)) {
            if (!tokenName.matches(name) || !isTokenValue(tokens[name])) {
                return rejected("malformed", "theme.tokens.$name")
            }
        }
        return Parsed.Theme(raw)
    }

    private fun capabilities(raw: JsonObject): Parsed {
        val names = raw["names"] as? JsonArray
        val strings = names?.items?.map { (it as? JsonString)?.value?.takeIf(String::isNotEmpty) }
        if (strings == null || null in strings || strings.toSet().size != strings.size) {
            return rejected("malformed", "capabilities.names")
        }
        return Parsed.Capabilities(raw)
    }
}
