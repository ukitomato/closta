package dev.ukitomato.closta.presenter.diff

import dev.ukitomato.closta.presenter.TreeApplier
import dev.ukitomato.closta.presenter.tree.JsonArray
import dev.ukitomato.closta.presenter.tree.JsonNumber
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonRead
import dev.ukitomato.closta.presenter.tree.JsonString
import dev.ukitomato.closta.presenter.tree.JsonText
import dev.ukitomato.closta.presenter.tree.JsonValue
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

/** Each rule of [structuralDiff] on a hand-made pair, with the exact ops it gives, as the protocol sends them. */
class StructuralDiffTest {
    private fun obj(text: String): JsonObject = JsonRead.parse(text) as JsonObject

    // The ops as JSON text, so a test states exactly what goes over the wire, in order.
    private fun ops(
        prev: JsonObject,
        next: JsonObject,
    ): String {
        val diff = structuralDiff(prev, next)
        val ops = (diff as? Diff.Ops ?: error("expected ops, got $diff")).ops
        val applied = TreeApplier.apply(prev, ops.map(Op::toJson))
        assertEquals(next, applied, "the ops turn prev into next")
        return JsonText.compact(JsonArray(ops.map(Op::toJson)))
    }

    private fun ops(
        prev: String,
        next: String,
    ): String = ops(obj(prev), obj(next))

    private fun text(
        prev: String,
        next: String,
    ): String = ops(JsonObject.of("t" to JsonString(prev)), JsonObject.of("t" to JsonString(next)))

    private fun set(value: String) = """[{"type":"set","path":["t"],"value":$value}]"""

    private fun append(value: String) = """[{"type":"append-text","path":["t"],"value":$value}]"""

    @Test
    fun `a string that grew at its end gives append-text with what was added`() {
        assertEquals(append("\" runs Gradle.\""), text("The build", "The build runs Gradle."))
        assertEquals(append("\"abc\""), text("", "abc"))
        assertEquals(append("\"\\n\""), text("line", "line\n"))
    }

    @Test
    fun `any other change of a string gives set`() {
        assertEquals(set("\"The bui\""), text("The build", "The bui"), "shrunk")
        assertEquals(set("\"The bXild\""), text("The build", "The bXild"), "changed in the middle")
        assertEquals(set("\"The builT\""), text("The build", "The builT"), "same length")
        assertEquals(set("\"he build!\""), text("The build", "he build!"), "longer, but the old text is not its start")
        assertEquals(set("\"\""), text("The build", ""), "emptied")
        assertEquals("[]", text("The build", "The build"), "equal")
    }

    @Test
    fun `strings are compared in UTF-16 code units, so an addition may start with half a surrogate pair`() {
        assertEquals(append("\"b\""), text("a\uD83D\uDE00", "a\uD83D\uDE00b"))
        assertEquals(append("\"\uD83D\uDE00\""), text("a", "a\uD83D\uDE00"))
        assertEquals(set("\"a\uD83D\uDE01\""), text("a\uD83D\uDE00", "a\uD83D\uDE01"), "the low halves differ")
        // The first half arrived alone. The writer escapes the second half, and appending rejoins the pair.
        val split = text("a\uD83D", "a\uD83D\uDE00!")
        assertEquals(append("\"\\ude00!\""), split)
        val sent = (JsonRead.parse(split) as JsonArray).items
        assertEquals(
            JsonObject.of("t" to JsonString("a\uD83D\uDE00!")),
            TreeApplier.apply(obj("""{"t":"a\ud83d"}"""), sent),
        )
    }

    @Test
    fun `a node that is the same object gives no op, even where the rules would set it whole`() {
        val odd = obj("""{"a":{"0":1,"":2},"b":"x"}""")
        assertEquals(Diff.Ops(emptyList()), structuralDiff(odd, odd))
        val inner = odd["a"]!!
        val next = JsonObject.of("a" to inner, "b" to JsonString("xy"))
        assertEquals("""[{"type":"append-text","path":["b"],"value":"y"}]""", ops(odd, next))
    }

    @Test
    fun `equal values that are other objects give no op, whatever the key order`() {
        assertEquals(
            "[]",
            ops("""{"a":{"x":[1,{"y":2}],"0":true,"s":"t"}}""", """{"a":{"s":"t","0":true,"x":[1,{"y":2}]}}"""),
        )
        assertEquals("[]", ops("""{"a":{"":null}}""", """{"a":{"":null}}"""))
    }

    @Test
    fun `objects are walked in the next tree's key order, a new key set with its value`() {
        assertEquals(
            """[{"type":"set","path":["b","y"],"value":2},{"type":"set","path":["b","z"],"value":{"w":[]}},""" +
                """{"type":"append-text","path":["a","x"],"value":"!"}]""",
            ops("""{"a":{"x":"hi"},"b":{}}""", """{"b":{"y":2,"z":{"w":[]}},"a":{"x":"hi!"}}"""),
        )
    }

    @Test
    fun `an object that lost a key is set whole, siblings still walked`() {
        assertEquals(
            """[{"type":"set","path":["parts","order"],"value":["p2"]},""" +
                """{"type":"set","path":["parts","byId"],"value":{"p2":{"text":"b"}}}]""",
            ops(
                """{"parts":{"order":["p1","p2"],"byId":{"p1":{"text":"a"},"p2":{"text":"b"}}}}""",
                """{"parts":{"order":["p2"],"byId":{"p2":{"text":"b"}}}}""",
            ),
        )
    }

    @Test
    fun `an object with a key no path may name is set whole, even when that key did not change`() {
        for (key in listOf("", "0", "12", "__proto__", "constructor", "prototype")) {
            val prev = JsonObject.of("a" to JsonObject.of(key to JsonString("same"), "b" to JsonString("x")))
            val next = JsonObject.of("a" to JsonObject.of(key to JsonString("same"), "b" to JsonString("y")))
            val diff = structuralDiff(prev, next) as Diff.Ops
            assertEquals(listOf(listOf("a")), diff.ops.map { it.path }, "key '$key'")
            assertEquals(next["a"], (diff.ops.single() as Op.Set).value, "key '$key'")
        }
        // Keys that are not array indices by the protocol's rule are walked into.
        assertEquals(
            """[{"type":"set","path":["a","01"],"value":2},{"type":"set","path":["a","-1"],"value":3}]""",
            ops("""{"a":{"01":1,"-1":1}}""", """{"a":{"01":2,"-1":3}}"""),
        )
    }

    @Test
    fun `an array is never entered, it is set whole when it changed`() {
        assertEquals(
            """[{"type":"set","path":["order"],"value":["m1","m3","m2"]},""" +
                """{"type":"set","path":["byId","m3"],"value":{"id":"m3"}}]""",
            ops(
                """{"order":["m1","m2"],"byId":{"m1":{"id":"m1"},"m2":{"id":"m2"}}}""",
                """{"order":["m1","m3","m2"],"byId":{"m1":{"id":"m1"},"m2":{"id":"m2"},"m3":{"id":"m3"}}}""",
            ),
        )
        assertEquals(
            """[{"type":"set","path":["r"],"value":[{"text":"ab"}]}]""",
            ops("""{"r":[{"text":"a"}]}""", """{"r":[{"text":"ab"}]}"""),
        )
        assertEquals("[]", ops("""{"r":[[1],{"a":"b"}]}""", """{"r":[[1],{"a":"b"}]}"""))
    }

    @Test
    fun `a value that changed kind is set whole`() {
        val kinds = listOf("{}", "{\"a\":1}", "[]", "\"a\"", "1", "true", "null")
        for (old in kinds) {
            for (new in kinds) {
                if (old == new || (old.startsWith("{") && new.startsWith("{"))) continue
                assertEquals(
                    """[{"type":"set","path":["v"],"value":$new}]""",
                    ops("""{"v":$old}""", """{"v":$new}"""),
                    "$old -> $new",
                )
            }
        }
        assertEquals(
            """[{"type":"set","path":["v"],"value":1}]""",
            ops("""{"v":1.0}""", """{"v":1}"""),
            "numbers by their text",
        )
    }

    @Test
    fun `the root takes ops below it, and a replace where it would be set whole`() {
        assertEquals("""[{"type":"set","path":["b"],"value":1}]""", ops("""{"a":1}""", """{"a":1,"b":1}"""))
        assertEquals(Diff.Replace, structuralDiff(obj("""{"a":1,"b":1}"""), obj("""{"a":1}""")))
        for (key in listOf("", "0", "constructor", "prototype")) {
            val next =
                JsonObject
                    .Builder()
                    .put("a", JsonNumber.of(1))
                    .put(key, JsonString("x"))
                    .build()
            assertEquals(Diff.Replace, structuralDiff(obj("""{"a":1}"""), next), key)
        }
        assertEquals(Diff.Replace, structuralDiff(obj("""{"0":1}"""), obj("""{"0":2}""")))
        assertEquals(
            Diff.Ops(emptyList()),
            structuralDiff(obj("""{"0":1}"""), obj("""{"0":1}""")),
            "equal roots give no op",
        )
        assertEquals(Diff.Ops(emptyList()), structuralDiff(JsonObject.EMPTY, JsonObject.EMPTY))
    }

    @Test
    fun `ops are values whose path cannot be changed afterwards`() {
        val diff = structuralDiff(obj("""{"a":{"b":"x"}}"""), obj("""{"a":{"b":"xy"},"c":true}""")) as Diff.Ops
        val first = diff.ops.first()
        assertEquals(listOf("a", "b"), first.path)
        assertThrows<UnsupportedOperationException> { (first.path as MutableList<String>).add("c") }
        assertThrows<UnsupportedOperationException> { (diff.ops as MutableList<Op>).clear() }
        assertEquals(diff, structuralDiff(obj("""{"a":{"b":"x"}}"""), obj("""{"a":{"b":"xy"},"c":true}""")))
        assertEquals("""{"type":"append-text","path":["a","b"],"value":"y"}""", JsonText.compact(first.toJson()))
    }

    @Test
    fun `an op prints its kind, path and size, never its value`() {
        val secret = "value-not-for-logs"
        val prev = obj("""{"t":{"s":"a"},"o":{"k":1},"x":"old"}""")
        val next =
            obj(
                """{"t":{"s":"a$secret"},"o":{"k":1,"n":{"a":"$secret","b":[1],"c":null}},"x":"$secret",
                "l":["$secret",2],"n":42,"b":true,"z":null}""",
            )
        val diff = structuralDiff(prev, next) as Diff.Ops
        assertEquals(
            listOf(
                """append-text ["t","s"] ${secret.length} chars""",
                """set ["o","n"] object(3)""",
                """set ["x"] string(${secret.length})""",
                """set ["l"] array(2)""",
                """set ["n"] number""",
                """set ["b"] boolean""",
                """set ["z"] null""",
            ),
            diff.ops.map(Op::toString),
        )
        assertEquals("Ops(${diff.ops.joinToString("; ")})", diff.toString())
        assertTrue(secret !in diff.toString() && "42" !in diff.toString(), diff.toString())
        // The wire form is the one that carries the values.
        assertTrue(diff.ops.any { secret in JsonText.compact(it.toJson()) })
    }

    @Test
    fun `an op prints its path as JSON strings, so a key with a newline or a quote cannot forge a log line`() {
        // Keys the CLI chose: a tool input's key, an id. Raw, the first would end the line and start a forged one.
        val forged = "k\n2026-10-07 INFO approved"
        val quote = "a\", \"b"
        val next = JsonObject.of(forged to JsonString("v"), quote to JsonObject.of("c" to JsonString("x")))
        val diff = structuralDiff(JsonObject.of(quote to JsonObject.EMPTY), next) as Diff.Ops
        assertEquals(
            listOf(
                """set ["k\n2026-10-07 INFO approved"] string(1)""",
                """set ["a\", \"b","c"] string(1)""",
            ),
            diff.ops.map(Op::toString),
        )
        for (op in diff.ops) assertTrue('\n' !in op.toString() && '\r' !in op.toString(), op.toString())
        assertTrue('\n' !in diff.toString(), diff.toString())
        // Each printed path reads back as the path.
        for (op in diff.ops) {
            val printed = op.toString().substringAfter(' ').substringBeforeLast(' ')
            assertEquals(JsonArray(op.path.map(::JsonString)), JsonRead.parse(printed), printed)
        }
    }

    @Test
    fun `an op escapes the line separators and bidirectional controls a viewer would break or reorder a line on`() {
        // JSON leaves these alone, so JsonText writes them raw; a log viewer may start a new line at the first three
        // or show the text after the others in another order.
        val keys = listOf("a\u2028b", "c\u2029d", "e\u0085f", "g\u202ah", "i\u202ej", "k\u2066l", "m\u2069n")
        val next = JsonObject.of(*keys.map { it to JsonString("v") as JsonValue }.toTypedArray())
        val diff = structuralDiff(JsonObject.EMPTY, next) as Diff.Ops
        assertEquals(
            listOf(
                """set ["a\u2028b"] string(1)""",
                """set ["c\u2029d"] string(1)""",
                """set ["e\u0085f"] string(1)""",
                """set ["g\u202ah"] string(1)""",
                """set ["i\u202ej"] string(1)""",
                """set ["k\u2066l"] string(1)""",
                """set ["m\u2069n"] string(1)""",
            ),
            diff.ops.map(Op::toString),
        )
        val appended =
            structuralDiff(
                JsonObject.of("a\u2028b" to JsonString("x")),
                JsonObject.of(
                    "a\u2028b" to JsonString("xy"),
                ),
            )
        assertEquals(listOf("""append-text ["a\u2028b"] 1 chars"""), (appended as Diff.Ops).ops.map(Op::toString))
        for (op in diff.ops) {
            assertTrue(op.toString().none { it in "\u2028\u2029\u0085\u202a\u202e\u2066\u2069" }, op.toString())
            // The escapes read back as the path: JSON reads \u2028 as the character.
            val printed = op.toString().substringAfter(' ').substringBeforeLast(' ')
            assertEquals(JsonArray(op.path.map(::JsonString)), JsonRead.parse(printed), printed)
        }
        // The wire form stays as JsonText writes it.
        assertTrue(
            diff.ops
                .first()
                .toJson()
                .let { JsonText.compact(it) }
                .contains('\u2028'),
        )
    }

    @Test
    fun `an op escapes every control and format character, outside the first plane too, and leaves other text alone`() {
        // C1 controls (U+0084 moves a line down and U+009B starts a command on some terminals), the implicit direction
        // marks, U+FEFF and a tag, which lies outside the Basic Multilingual Plane; DEL is a control as well.
        val keys =
            listOf(
                "a\u0084b",
                "c\u009bd",
                "e\u200ef",
                "g\u061ch",
                "i\ufeffj",
                "k\udb40\udc01l",
                "m\u007fn",
                "o\u00e9\u65e5\ud83d\ude00p",
            )
        val next = JsonObject.of(*keys.map { it to JsonString("v") as JsonValue }.toTypedArray())
        val diff = structuralDiff(JsonObject.EMPTY, next) as Diff.Ops
        assertEquals(
            listOf(
                """set ["a\u0084b"] string(1)""",
                """set ["c\u009bd"] string(1)""",
                """set ["e\u200ef"] string(1)""",
                """set ["g\u061ch"] string(1)""",
                """set ["i\ufeffj"] string(1)""",
                """set ["k\udb40\udc01l"] string(1)""",
                """set ["m\u007fn"] string(1)""",
                "set [\"o\u00e9\u65e5\ud83d\ude00p\"] string(1)",
            ),
            diff.ops.map(Op::toString),
        )
        for (op in diff.ops) {
            val printed = op.toString().substringAfter(' ').substringBeforeLast(' ')
            assertEquals(JsonArray(op.path.map(::JsonString)), JsonRead.parse(printed), printed)
        }
    }

    @Test
    fun `a set hands on the next tree's own node`() {
        val value: JsonValue = obj("""{"x":{"y":[1]}}""")
        val next = JsonObject.of("v" to value)
        val set = (structuralDiff(obj("""{"v":1}"""), next) as Diff.Ops).ops.single() as Op.Set
        assertSame(value, set.value)
    }
}
