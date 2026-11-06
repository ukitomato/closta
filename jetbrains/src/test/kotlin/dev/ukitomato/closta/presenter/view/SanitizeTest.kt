package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.presenter.Trees
import dev.ukitomato.closta.presenter.message
import dev.ukitomato.closta.presenter.part
import dev.ukitomato.closta.presenter.str
import dev.ukitomato.closta.presenter.toolCalls
import dev.ukitomato.closta.presenter.tree.JsonArray
import dev.ukitomato.closta.presenter.tree.JsonNumber
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonRead
import dev.ukitomato.closta.presenter.tree.JsonString
import dev.ukitomato.closta.presenter.tree.JsonText
import dev.ukitomato.closta.presenter.tree.JsonValue
import dev.ukitomato.closta.presenter.tree.TreeRules
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * What the CLI sends goes into the tree only when the webview would accept it there.
 * Every [Session] tree is also held to the contract, so a value that slipped through would fail there too.
 */
class SanitizeTest {
    // A top-level part sits at level 10, so its args and result have 246 levels; a sub-agent's part at 16.
    private val topRoom = TreeRules.MAX_DEPTH - 10
    private val nestedRoom = TreeRules.MAX_DEPTH - 16

    private fun callWith(
        input: JsonValue,
        result: JsonValue? = null,
    ): JsonObject {
        val session = Session()
        session.turn("c1")
        session.events(Lines.assistant("m1", Lines.toolUse("toolu_1", "Bash", JsonText.compact(input))))
        result?.let { session.events(Lines.user("u1", Lines.toolResult("toolu_1", JsonText.compact(it)))) }
        return session.thread.message("c1").part("toolu_1")
    }

    @Test
    fun `args that reach the prototype become empty, and argsText keeps what the CLI sent`() {
        for (input in listOf(
            JsonObject.of("a" to JsonObject.of("__proto__" to JsonString("x"))),
            JsonObject.of("constructor" to JsonObject.of("prototype" to JsonObject.EMPTY)),
            JsonObject.of("list" to JsonArray(listOf(JsonObject.of("__proto__" to JsonObject.EMPTY)))),
        )) {
            val call = callWith(input)
            assertEquals(JsonObject.EMPTY, call["args"], "$input")
            assertEquals(JsonText.compact(input), call.str("argsText"))
        }
        val harmless = JsonObject.of("constructor" to JsonString("ok"))
        assertEquals(harmless, callWith(harmless)["args"])
    }

    @Test
    fun `args as deep as the room left stay, one level deeper become empty`() {
        assertEquals(Trees.nested(topRoom), callWith(Trees.nested(topRoom))["args"])
        val tooDeep = callWith(Trees.nested(topRoom + 1))
        assertEquals(JsonObject.EMPTY, tooDeep["args"])
        assertEquals(JsonText.compact(Trees.nested(topRoom + 1)), tooDeep.str("argsText"))
    }

    @Test
    fun `a result too deep or unsafe for the tree is folded into its JSON text`() {
        val fits = Trees.nestedArray(topRoom)
        assertEquals(fits, callWith(JsonObject.EMPTY, fits)["result"])
        val deep = Trees.nestedArray(topRoom + 1)
        assertEquals(JsonString(JsonText.compact(deep)), callWith(JsonObject.EMPTY, deep)["result"])
        val unsafe = JsonArray(listOf(JsonObject.of("type" to JsonString("text"), "__proto__" to JsonObject.EMPTY)))
        assertEquals(JsonString(JsonText.compact(unsafe)), callWith(JsonObject.EMPTY, unsafe)["result"])
        val text = JsonArray(listOf(JsonObject.of("type" to JsonString("text"), "text" to JsonString("ok"))))
        assertEquals(text, callWith(JsonObject.EMPTY, text)["result"], "a block list that fits stays a list")
    }

    @Test
    fun `a sub-agent's call has less room, by the levels its nesting takes`() {
        val session = Session()
        session.turn("c1")
        session.events(
            Lines.assistant("m1", Lines.toolUse("agent", "Agent")),
            Lines.assistant(
                "m2",
                Lines.toolUse("fits", "Read", JsonText.compact(Trees.nested(nestedRoom))),
                parent = "agent",
            ),
            Lines.assistant(
                "m2",
                Lines.toolUse("deep", "Read", JsonText.compact(Trees.nested(nestedRoom + 1))),
                parent = "agent",
            ),
            Lines.user(
                "u1",
                Lines.toolResult("fits", JsonText.compact(Trees.nestedArray(nestedRoom + 1))),
                parent = "agent",
            ),
        )
        val calls = toolCalls(session.tree)
        assertEquals(Trees.nested(nestedRoom), calls.getValue("fits")["args"])
        assertEquals(JsonObject.EMPTY, calls.getValue("deep")["args"])
        assertTrue(calls.getValue("fits")["result"] is JsonString)
    }

    @Test
    fun `a value far deeper than the tree allows is still read, and folded rather than dropped`() {
        val depth = TreeRules.MAX_DEPTH + 44
        val call = callWith(Trees.nested(depth))
        assertEquals(JsonObject.EMPTY, call["args"])
        assertEquals(JsonText.compact(Trees.nested(depth)), call.str("argsText"))
    }

    @Test
    fun `a value deeper than the reader takes is marked, and the rest of its line is shown`() {
        val session = Session()
        session.turn("c1")
        val pad = "[".repeat(JsonRead.NESTING_LIMIT) + "]".repeat(JsonRead.NESTING_LIMIT)
        session.events(Lines.assistant("m1", Lines.toolUse("toolu_1", "Bash", """{"command":"ls","pad":$pad}""")))
        val call = session.thread.message("c1").part("toolu_1")
        assertTrue("\"command\":\"ls\"" in call.str("argsText")!!)
        assertTrue(JsonRead.TOO_DEEP in call.str("argsText")!!)
        assertEquals(JsonObject.EMPTY, call["args"], "still too deep for the tree")
    }

    @Test
    fun `a streaming call's args stay empty until its stream stops, then are what argsText parses to`() {
        val session = Session()
        session.turn("c1")
        session.events(
            Lines.messageStart("m1"),
            Lines.blockStart(0, Lines.toolUse("toolu_1", "Bash")),
            Lines.jsonDelta(0, "{\"command\": \"l"),
            Lines.jsonDelta(0, "s\"}"),
        )
        val streaming = session.thread.message("c1").part("toolu_1")
        assertEquals("{\"command\": \"ls\"}", streaming.str("argsText"))
        assertEquals(JsonObject.EMPTY, streaming["args"], "whole, but still streaming: not parsed yet")
        session.events(Lines.blockStop(0))
        assertEquals(JsonObject.of("command" to JsonString("ls")), session.thread.message("c1").part("toolu_1")["args"])
        assertNull(session.thread.message("c1").part("toolu_1")["result"])
    }

    @Test
    fun `the snapshot's input is the args even while streaming, and argsText that is not one object gives none`() {
        val session = Session()
        session.turn("c1")
        session.events(
            Lines.messageStart("m1"),
            Lines.blockStart(0, Lines.toolUse("toolu_1", "Bash")),
            Lines.jsonDelta(0, "{\"command\": \"ls\"}"),
            Lines.assistant("m1", Lines.toolUse("toolu_1", "Bash", """{"command":"ls -la"}""")),
        )
        assertEquals(
            JsonObject.of("command" to JsonString("ls -la")),
            session.thread.message("c1").part("toolu_1")["args"],
        )
        session.events(Lines.blockStop(0))
        assertEquals(
            JsonObject.of("command" to JsonString("ls -la")),
            session.thread.message("c1").part("toolu_1")["args"],
        )
        session.events(
            Lines.blockStart(1, Lines.toolUse("toolu_2", "Bash")),
            Lines.jsonDelta(1, "[1]"),
            Lines.blockStop(1),
        )
        assertEquals(JsonObject.EMPTY, session.thread.message("c1").part("toolu_2")["args"], "not one object")
        assertEquals(
            "[1]",
            session.thread
                .message("c1")
                .part("toolu_2")
                .str("argsText"),
        )
    }

    @Test
    fun `a number that is not finite as a double is folded like an unsafe value`() {
        val session = Session()
        session.turn("c1")
        session.events(
            Lines.messageStart("m1"),
            Lines.blockStart(0, Lines.toolUse("toolu_1", "Bash")),
            Lines.jsonDelta(0, "{\"n\": 1e999}"),
            Lines.blockStop(0),
            Lines.user("u1", Lines.toolResult("toolu_1", "1e999")),
        )
        val call = session.thread.message("c1").part("toolu_1")
        assertEquals(JsonObject.EMPTY, call["args"])
        assertEquals("{\"n\": 1e999}", call.str("argsText"))
        assertEquals(JsonString("1e999"), call["result"])
        assertEquals(
            JsonString("[1,-1E400]"),
            callWith(JsonObject.EMPTY, JsonArray(listOf(JsonNumber("1"), JsonNumber("-1E400"))))["result"],
        )
        assertEquals(
            JsonArray(listOf(JsonNumber("1e-400"))),
            callWith(JsonObject.EMPTY, JsonArray(listOf(JsonNumber("1e-400"))))["result"],
            "tiny is finite",
        )
    }
}
