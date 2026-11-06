package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.core.models.RawJson
import dev.ukitomato.closta.core.models.SavedSessionSummary
import dev.ukitomato.closta.presenter.TreeChecks
import dev.ukitomato.closta.presenter.at
import dev.ukitomato.closta.presenter.entries
import dev.ukitomato.closta.presenter.keysOf
import dev.ukitomato.closta.presenter.messages
import dev.ukitomato.closta.presenter.parts
import dev.ukitomato.closta.presenter.status
import dev.ukitomato.closta.presenter.str
import dev.ukitomato.closta.presenter.tree.JsonArray
import dev.ukitomato.closta.presenter.tree.JsonBool
import dev.ukitomato.closta.presenter.tree.JsonNumber
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonString
import dev.ukitomato.closta.presenter.tree.JsonValue
import dev.ukitomato.closta.providers.claude.history.CapturedTranscript
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * What the tree says of the history of sessions: the earlier conversation put back from the record of capture
 * 22
 * says what the first CLI's own stdout said, ends at a mark, and is not running; the list of saved sessions; a record
 * that could not be read; a resume that was turned down.
 */
class HistoryProjectionTest {
    private val projector = TreeProjector()

    private fun thread(state: HostState): JsonObject {
        val tree = projector.project(listOf(state.source(CaptureReplay.THREAD)))
        TreeChecks.assertContract(tree, "the tree after the history")
        return tree.at("threads", "byId", CaptureReplay.THREAD)
    }

    private fun fold(
        state: HostState,
        inputs: List<PresenterInput>,
    ): HostState = inputs.fold(state) { held, input -> held.next(input) }

    /** What a session that is opened puts back: each line of the record, then the mark. */
    private fun restored(
        events: List<AgentEvent>,
        dropped: Int = 0,
    ): HostState =
        fold(HostState(), events.map { PresenterInput.Restored(it) } + PresenterInput.HistoryRestored(dropped))

    /** What the first CLI's own stdout made: the capture's inputs up to the recorder's mark. */
    private fun firstCli(): HostState {
        val inputs = CaptureReplay.inputs("22-resume")
        val mark = inputs.indexOfFirst { (it as? PresenterInput.Event)?.event is AgentEvent.UnknownKind }
        assertTrue(mark > 0, "the recorder's mark is among the inputs")
        return fold(HostState(), inputs.take(mark))
    }

    /** A message as the screen would read it, with the keys left out: its role, its status and what its parts say. */
    private fun shape(thread: JsonObject): List<String> =
        thread.messages().map { message ->
            val parts =
                message.parts().joinToString(" | ") { part ->
                    listOfNotNull(
                        part.str("type"),
                        part.str("text")?.let { "\"$it\"" },
                        part.str("toolName"),
                        // The arguments as the tree parses them: the text a stream spelt them in is the stream's own.
                        part["args"]?.let { "args $it" },
                        part["result"]?.let { "result $it" },
                        part.status(),
                    ).joinToString(" ")
                }
            "${message.str("role")} ${message.status()} [$parts]"
        }

    private fun user(
        uuid: String,
        content: String,
    ) = AgentEvent.User(
        uuid,
        SESSION,
        TIME,
        RawJson("""{"role":"user","content":${JsonString(content).let { quoted(it.value) }}}"""),
    )

    private fun quoted(text: String) = "\"" + text.replace("\\", "\\\\").replace("\"", "\\\"") + "\""

    private fun said(
        uuid: String,
        messageId: String,
        text: String,
    ) = AgentEvent.Assistant(
        uuid,
        SESSION,
        TIME,
        "req",
        RawJson("""{"id":"$messageId","role":"assistant","content":[{"type":"text","text":${quoted(text)}}]}"""),
    )

    private fun asked(
        uuid: String,
        messageId: String,
        toolUseId: String,
    ) = AgentEvent.Assistant(
        uuid,
        SESSION,
        TIME,
        "req",
        RawJson(
            """{"id":"$messageId","role":"assistant","content":[""" +
                """{"type":"tool_use","id":"$toolUseId","name":"Bash","input":{"command":"ls"}}]}""",
        ),
    )

    @Test
    fun `the record of capture 22, put back, says what the first CLI's stdout said`() {
        val record = CapturedTranscript.read()
        val back = thread(restored(record.events))
        val live = thread(firstCli())

        assertEquals(2, live.messages().size, "the user's words and the assistant's turn")
        assertEquals(shape(live), shape(back), "the same roles, statuses, words, tool and result")
        assertEquals(listOf("user", "assistant"), back.messages().map { it.str("role") })
        assertTrue(shape(back).last().contains("tool-call Bash"), shape(back).toString())
    }

    @Test
    fun `what was put back ends at a mark, and none of it is running`() {
        val back = thread(restored(CapturedTranscript.read().events))

        val keys = back.keysOf("messages")
        assertEquals(JsonString(keys.last()), back["restoredUntil"])
        assertEquals(JsonNumber.of(2), back["restoredCount"])
        assertNull(back["restoredPartly"], "the record was put back whole")
        assertEquals(JsonBool.FALSE, back["isRunning"], "a record is not a turn that goes on")
        assertEquals(listOf("complete/stop"), back.messages().mapNotNull { it.status() })
    }

    @Test
    fun `a record the host left the oldest lines of out says so`() {
        val back = thread(restored(CapturedTranscript.read().events, dropped = 12))

        assertEquals(JsonBool.TRUE, back["restoredPartly"])
        assertEquals(JsonNumber.of(2), back["restoredCount"], "the count is of messages put back, not of lines")
    }

    @Test
    fun `the new turn of the resumed session comes after the mark, and the mark stays where it was`() {
        val back = restored(CapturedTranscript.read().events)
        val until = thread(back)["restoredUntil"]
        val second =
            CaptureReplay
                .inputs("22-resume")
                .dropWhile { (it as? PresenterInput.Event)?.event !is AgentEvent.UnknownKind }
                .drop(1)

        val after = thread(fold(back, second))

        val keys = after.keysOf("messages")
        assertEquals(listOf("user", "assistant", "user", "assistant"), after.messages().map { it.str("role") })
        assertEquals(until, after["restoredUntil"], "what was put back is still what ends at the mark")
        assertEquals(JsonString(keys[1]), after["restoredUntil"], "the mark is the second message, before the new turn")
        assertEquals(JsonNumber.of(2), after["restoredCount"])
        assertEquals(JsonBool.FALSE, after["isRunning"], "the new turn ended with its result")
        assertEquals(
            "pong",
            after
                .messages()
                .last()
                .parts()
                .last()
                .str("text"),
        )
    }

    @Test
    fun `a call without a result before the mark is not running, and the message that holds it has ended`() {
        // The record of a session that was cut off in the middle of a tool call: the call has no result.
        val cut = restored(listOf(user("u1", "ls"), asked("a1", "msg_1", "toolu_1")))

        val back = thread(cut)

        assertEquals(JsonBool.FALSE, back["isRunning"])
        val call =
            back
                .messages()
                .last()
                .parts()
                .single()
        assertEquals("tool-call", call.str("type"))
        assertEquals("incomplete/cancelled", call.status(), "a call with no result is a call that was cut off")
        assertEquals("complete/stop", back.messages().last().status())
    }

    @Test
    fun `without the mark what the record left open is still running, which is what the mark ends`() {
        val open =
            fold(
                HostState(),
                listOf(user("u1", "ls"), asked("a1", "msg_1", "toolu_1")).map { PresenterInput.Restored(it) },
            )

        val before = thread(open)
        val after = thread(open.next(PresenterInput.HistoryRestored(0)))

        assertEquals(JsonBool.TRUE, before["isRunning"], "an assistant message with no end is a running one")
        assertEquals(JsonBool.FALSE, after["isRunning"])
    }

    @Test
    fun `what the assistant said after the user spoke again is a message of its own`() {
        val record =
            listOf(
                user("u1", "first"),
                said("a1", "msg_1", "one"),
                user("u2", "second"),
                said("a2", "msg_2", "two"),
                said("a3", "msg_3", "three"),
            )

        val back = thread(restored(record))

        assertEquals(
            listOf("user", "assistant", "user", "assistant"),
            back.messages().map { it.str("role") },
            "two turns are two assistant messages, not one",
        )
        assertEquals(listOf("one"), back.messages()[1].parts().map { it.str("text") })
        assertEquals(listOf("two", "three"), back.messages()[3].parts().map { it.str("text") })
        assertEquals(JsonNumber.of(4), back["restoredCount"])
    }

    @Test
    fun `the user's words are a message only when they come back from the record, never from stdout`() {
        val line = user("u1", "from stdout")

        val live = thread(fold(HostState(), listOf(PresenterInput.Event(line))))
        val back = thread(restored(listOf(line)))

        assertEquals(
            0,
            live.messages().size,
            "the CLI does not echo the user's words, so a line of them is not a message",
        )
        assertEquals(listOf("user"), back.messages().map { it.str("role") })
        assertEquals(
            listOf("from stdout"),
            back
                .messages()
                .single()
                .parts()
                .map { it.str("text") },
        )
    }

    @Test
    fun `a user message put back is found again by its key under the uuid the record gave it`() {
        val record = CapturedTranscript.read()
        val state = restored(record.events)
        val users = thread(state).messages().filter { it.str("role") == "user" }.map { it.str("id") }
        val uuids =
            record.events
                .filterIsInstance<AgentEvent.User>()
                .filter { it.parentToolUseId == null }
                .map { it.uuid }
                .filter { Keys.ofCliId(it) in users }
        assertTrue(users.isNotEmpty())
        assertEquals(users.size, uuids.size)
        for (uuid in uuids) {
            assertEquals(uuid, state.transcript.userUuids[Keys.ofCliId(uuid)])
        }
        // What stdout says of a user line is not a message, so it names no uuid.
        val live = fold(HostState(), listOf(PresenterInput.Event(user("u1", "from stdout"))))
        assertTrue(live.transcript.userUuids.isEmpty())
    }

    @Test
    fun `a sub-agent's prompt put back stays where a sub-agent's prompt is, not a message of the thread`() {
        val nested = user("u9", "dig").copy(parentToolUseId = "toolu_1")

        val back = thread(restored(listOf(asked("a1", "msg_1", "toolu_1"), nested)))

        assertEquals(listOf("assistant"), back.messages().map { it.str("role") })
    }

    @Test
    fun `an empty record puts nothing back and marks nothing`() {
        val back = thread(restored(emptyList()))

        assertEquals(0, back.messages().size)
        assertNull(back["restoredUntil"])
        assertNull(back["restoredCount"])
    }

    // ---- the list ----

    private fun summary(
        id: String,
        title: String,
        at: Long,
    ) = SavedSessionSummary(id, title, at, 10)

    @Test
    fun `the list of saved sessions is the thread's savedSessions, with the current one marked`() {
        val listed =
            PresenterInput.SessionsListed(
                listOf(summary("a", "Explain the build", 3_000), summary("b", "b", 2_000)),
                currentId = "b",
            )

        val saved = thread(HostState().next(listed))["savedSessions"] as JsonArray

        assertEquals(
            listOf(
                JsonObject.of(
                    "id" to JsonString("a"),
                    "title" to JsonString("Explain the build"),
                    "updatedAt" to JsonNumber.of(3_000),
                    "current" to JsonBool.FALSE,
                ),
                JsonObject.of(
                    "id" to JsonString("b"),
                    "title" to JsonString("b"),
                    "updatedAt" to JsonNumber.of(2_000),
                    "current" to JsonBool.TRUE,
                ),
            ),
            saved.items,
        )
    }

    @Test
    fun `a new list replaces the last, an empty one is a list, and none has no key`() {
        val none = thread(HostState())
        val first = HostState().next(PresenterInput.SessionsListed(listOf(summary("a", "x", 1)), "z"))
        val empty = first.next(PresenterInput.SessionsListed(emptyList(), "z"))

        assertNull(none["savedSessions"], "not listed yet")
        assertEquals(1, (thread(first)["savedSessions"] as JsonArray).items.size)
        assertEquals(JsonArray.EMPTY, thread(empty)["savedSessions"], "listed, and the project has none")
    }

    @Test
    fun `a list that could not be read leaves the last one and says so, and a list that can makes it say nothing`() {
        val first = HostState().next(PresenterInput.SessionsListed(listOf(summary("a", "x", 1)), "z"))
        val failed = first.next(PresenterInput.SessionsListed(emptyList(), "z", unreadable = true))
        val again = failed.next(PresenterInput.SessionsListed(listOf(summary("a", "x", 1)), "z"))

        assertEquals(JsonBool.TRUE, thread(failed)["savedSessionsUnreadable"])
        assertEquals(1, (thread(failed)["savedSessions"] as JsonArray).items.size, "the list the tree had stays")
        assertNull(thread(again)["savedSessionsUnreadable"])
        assertNull(
            thread(
                HostState().next(PresenterInput.SessionsListed(emptyList(), "z", unreadable = true)),
            )["savedSessions"],
        )
    }

    @Test
    fun `listing again with nothing new leaves the transcript as it was`() {
        val listed = PresenterInput.SessionsListed(listOf(summary("a", "x", 1)), "z")
        val once = HostState().next(listed)

        assertTrue(once.transcript === once.next(listed).transcript, "the same object: nothing above it looks changed")
    }

    // ---- what could not be read, and what was turned down ----

    @Test
    fun `a record that could not be read is the thread's first notice, ahead of the CLI's`() {
        val said = thread(HostState().next(PresenterInput.HistoryUnavailable))

        val notice = said.entries("notices").single()
        assertEquals("notice-1", notice.str("id"))
        assertEquals("error", notice.str("kind"))
        assertEquals(HISTORY_UNAVAILABLE_TEXT, notice.str("text"))
        assertNull(said["restoredUntil"])
    }

    @Test
    fun `a resume turned down while a turn runs is a refused switch of the resume kind`() {
        val refused = thread(HostState().next(PresenterInput.ResumeRefused("r1", SESSION)))

        val switch = (refused["switches"] as JsonArray).items.single() as JsonObject
        assertEquals(JsonString("resume"), switch["kind"])
        assertEquals(JsonString(SESSION), switch["value"])
        assertEquals(JsonString("rejected"), switch["outcome"])
        assertEquals(JsonString("A turn is running"), switch["detail"])
    }

    @Test
    fun `a resume turned down because another tab has it is a refused switch with that sentence`() {
        val refused =
            thread(HostState().next(PresenterInput.ResumeRefused("r1", SESSION, ResumeRefusal.ELSEWHERE)))

        val switch = (refused["switches"] as JsonArray).items.single() as JsonObject
        assertEquals(JsonString("resume"), switch["kind"])
        assertEquals(JsonString("rejected"), switch["outcome"])
        assertEquals(JsonString("It is open in another tab"), switch["detail"])
        assertEquals(RESUME_REFUSED_ELSEWHERE, "It is open in another tab")
    }

    private fun JsonValue?.items() = (this as JsonArray).items

    private companion object {
        const val SESSION = "336ed47b-2675-4317-b3f5-a3b48abb03a2"
        const val TIME = "2026-10-17T05:40:20.000Z"
    }
}
