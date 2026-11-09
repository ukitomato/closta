package dev.ukitomato.closta.presenter.tree

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

class JsonValueTest {
    @Test
    fun `values compare by structure, objects regardless of member order`() {
        val a = JsonObject.of("x" to JsonNumber.of(1), "y" to JsonArray(listOf(JsonString("s"), JsonNull)))
        val b = JsonObject.of("y" to JsonArray(listOf(JsonString("s"), JsonNull)), "x" to JsonNumber.of(1))
        assertEquals(a, b)
        assertEquals(a.hashCode(), b.hashCode())
        assertNotEquals(a, JsonObject.of("x" to JsonNumber.of(2)))
        assertNotEquals(
            JsonArray(listOf(JsonBool.TRUE, JsonBool.FALSE)),
            JsonArray(listOf(JsonBool.FALSE, JsonBool.TRUE)),
        )
    }

    @Test
    fun `an array copies its items, so the caller cannot change it afterwards`() {
        val items = mutableListOf<JsonValue>(JsonString("a"))
        val array = JsonArray(items)
        items += JsonString("b")
        assertEquals(1, array.items.size)
    }

    @Test
    fun `a number keeps its text and refuses what JSON does not write`() {
        assertEquals("1.0", JsonNumber("1.0").text)
        assertNotEquals(JsonNumber("1"), JsonNumber("1.0"))
        for (bad in listOf("", "01", "1.", ".5", "+1", "NaN", "Infinity", "1e", "--1", "0x10")) {
            assertThrows<IllegalArgumentException>(bad) { JsonNumber(bad) }
        }
        for (good in listOf("0", "-0", "12", "-3.25", "1e400", "6.02E+23", "1E-7", "123456789012345678901234567890")) {
            assertEquals(good, JsonNumber(good).text)
        }
    }

    @Test
    fun `the compact form escapes only what JSON requires, and unpaired surrogates`() {
        val text = "\"\\/\n\r\t\b\u000c\u0001\u001fあ😀\u2028" + "\ud800" + "x" + "\udc00"
        assertEquals(
            "\"\\\"\\\\/\\n\\r\\t\\b\\f\\u0001\\u001fあ😀\u2028\\ud800x\\udc00\"",
            JsonText.compact(JsonString(text)),
        )
    }

    @Test
    fun `the pretty form indents by two spaces, keeps member order and prints empties inline`() {
        val value =
            JsonObject.of(
                "b" to JsonArray(listOf(JsonNumber.of(1), JsonObject.EMPTY)),
                "a" to JsonArray.EMPTY,
                "c" to JsonObject.of("d" to JsonBool.TRUE, "e" to JsonNull),
            )
        assertEquals(
            "{\n  \"b\": [\n    1,\n    {}\n  ],\n  \"a\": [],\n  \"c\": {\n    \"d\": true,\n    \"e\": null\n  }\n}",
            JsonText.pretty(value),
        )
        assertEquals("""{"b":[1,{}],"a":[],"c":{"d":true,"e":null}}""", JsonText.compact(value))
    }

    @Test
    fun `reading gives back what writing printed`() {
        val value =
            JsonObject.of(
                "text" to JsonString("改行\nと \"引用\" と \\ と \u0000"),
                "numbers" to
                    JsonArray(
                        listOf(
                            JsonNumber("-0"),
                            JsonNumber("1.50"),
                            JsonNumber("1e400"),
                            JsonNumber("12345678901234567890"),
                        ),
                    ),
                "flags" to JsonArray(listOf(JsonBool.TRUE, JsonBool.FALSE, JsonNull)),
            )
        assertEquals(value, JsonRead.parse(JsonText.compact(value)))
        assertEquals(value, JsonRead.parse(JsonText.pretty(value)))
    }

    @Test
    fun `reading keeps __proto__ as an own key, as JSON-parse does, and a repeated key keeps its last value`() {
        val read = JsonRead.parse("""{"__proto__":{"a":1},"k":1,"k":2}""") as JsonObject
        assertTrue(read.containsKey("__proto__"))
        assertEquals(JsonNumber("2"), read["k"])
        assertEquals(listOf("__proto__", "k"), read.keys.toList())
    }

    @Test
    fun `reading what is not one JSON value gives null, never an exception`() {
        for (bad in listOf(
            "",
            " ",
            "{",
            "[1,]",
            "{\"a\":}",
            "nul",
            "{} {}",
            "[1] x",
            "'a'",
            "{a:1}",
            "NaN",
            "01",
            "\"\\x\"",
            "[\"\u0000\"]",
        )) {
            assertNull(JsonRead.parse(bad), bad)
        }
        assertEquals(JsonString("a"), JsonRead.parse(" \"a\" "))
        assertSame(JsonNull, JsonRead.parse("null"))
    }

    @Test
    fun `reading goes past Gson's habits up to its own limit, and marks what is deeper without overflowing`() {
        // Gson 2.11's JsonReader has no nesting limit; the reader counts nesting itself.
        assertEquals(deep(300), JsonRead.parse(deepText(300)))
        assertEquals(deep(JsonRead.NESTING_LIMIT), JsonRead.parse(deepText(JsonRead.NESTING_LIMIT)))
        val marked = deep(JsonRead.NESTING_LIMIT, JsonString(JsonRead.TOO_DEEP))
        assertEquals(marked, JsonRead.parse(deepText(JsonRead.NESTING_LIMIT + 1)))
        assertEquals(marked, JsonRead.parse(deepText(200_000)), "skipped with a counter, not by recursion")
        val line = JsonRead.parse("{\"a\":" + deepText(600) + ",\"b\":1}") as JsonObject
        assertEquals(JsonNumber("1"), line["b"], "the rest of the line is read")
        assertEquals("[nested deeper than 512 levels, not shown]", JsonRead.TOO_DEEP)
        assertNull(
            JsonRead.parse("{\"a\":" + deepText(600).dropLast(1) + "}"),
            "text that is not JSON is still unreadable",
        )
    }

    @Test
    fun `the collections a value hands out cannot be changed, even through a cast`() {
        val obj = JsonObject.of("a" to JsonNumber.of(1))
        val array = JsonArray(listOf(JsonNull))

        @Suppress("UNCHECKED_CAST")
        val attempts: List<() -> Unit> =
            listOf(
                { (obj.keys as MutableSet<String>).add("b") },
                { (obj.entries as MutableSet<Map.Entry<String, JsonValue>>).clear() },
                { (obj.values as MutableCollection<JsonValue>).clear() },
                { (array.items as MutableList<JsonValue>).add(JsonNull) },
                { (JsonObject.EMPTY.keys as MutableSet<String>).add("b") },
                { (JsonArray.EMPTY.items as MutableList<JsonValue>).add(JsonNull) },
            )
        // Kotlin's own read-only collections refuse the cast; the read-only views refuse the change.
        for (attempt in attempts) {
            val refused = assertThrows<RuntimeException> { attempt() }
            assertTrue(refused is UnsupportedOperationException || refused is ClassCastException, "$refused")
        }
        assertEquals(JsonObject.of("a" to JsonNumber.of(1)), obj)
        assertEquals(1, array.items.size)
    }

    private fun deepText(depth: Int) = "[".repeat(depth) + "]".repeat(depth)

    // [depth] arrays, the innermost holding [inside] when there is one.
    private fun deep(
        depth: Int,
        inside: JsonValue? = null,
    ): JsonValue {
        var value: JsonValue = JsonArray(listOfNotNull(inside))
        repeat(depth - 1) { value = JsonArray(listOf(value)) }
        return value
    }
}
