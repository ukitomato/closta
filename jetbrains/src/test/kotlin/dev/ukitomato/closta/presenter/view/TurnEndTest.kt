package dev.ukitomato.closta.presenter.view

import com.google.gson.JsonParser
import dev.ukitomato.closta.platforms.intellij.session.SessionView
import dev.ukitomato.closta.providers.claude.protocol.StreamJsonCodec
import dev.ukitomato.closta.providers.claude.synthetic.StreamScript
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotSame
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class TurnEndTest {
    private fun SessionView.lines(script: StreamScript): SessionView =
        script.lines.fold(this) { view, line -> view.event(PresenterInput.Event(StreamJsonCodec.decode(line))) }

    /** A user message and its turn, opened; the reply is one text block. */
    private fun opened(
        ask: String,
        from: SessionView = SessionView(),
    ): SessionView {
        val command = "c-$ask"
        return from.sent(PresenterInput.UserSent(ask, "do $ask", uuid = command)).lines(
            StreamScript().apply {
                lifecycle(command, "queued")
                lifecycle(command, "started")
                streamText("m-$ask", "done $ask", chunk = 4)
            },
        )
    }

    /** The `result` that closes [ask]'s turn, [ms] long. */
    private fun closed(
        view: SessionView,
        ask: String,
        ms: Long = 1_200,
    ): SessionView {
        val line = JsonParser.parseString(StreamScript().apply { result("done") }.lines.single()).asJsonObject
        line.addProperty("user_message_uuid", "c-$ask")
        line.addProperty("duration_ms", ms)
        return view.event(PresenterInput.Event(StreamJsonCodec.decode(line.toString())))
    }

    private fun turn(
        ask: String,
        from: SessionView = SessionView(),
    ) = closed(opened(ask, from), ask)

    private fun changes(
        view: SessionView,
        ask: String,
        files: List<ChangedFile>,
    ) = view.requested(PresenterInput.TurnChangesFound(ask, files))

    @Test
    fun turnEndFollowsEachFinishedTurn() {
        val steps = CaptureReplay.replay("01-baseline-text")
        val rows = ThreadRows().of(steps.last().transcript)
        val end = rows.last() as TurnEndRow
        val result = steps.map { it.input }.filterIsInstance<PresenterInput.Event>().map { it.event }
        val duration =
            result.filterIsInstance<dev.ukitomato.closta.core.models.AgentEvent.Result>().single().durationMs
        assertEquals(duration, end.durationMs)
        assertEquals("send-1", end.askKey)
        assertNull(end.changes)
    }

    @Test
    fun turnEndWaitsForChanges() {
        val view = turn("a")
        assertNull(
            ThreadRows()
                .of(view.transcript)
                .filterIsInstance<TurnEndRow>()
                .single()
                .changes,
        )
        val file = ChangedFile("src/A.kt", added = 2, removed = 1, created = false, deleted = false)
        val found = changes(view, "a", listOf(file))
        val end = ThreadRows().of(found.transcript).filterIsInstance<TurnEndRow>().single()
        assertEquals(1, end.changes?.files?.size)
    }

    @Test
    fun turnEndForInterruptedTurn() {
        val transcript = CaptureReplay.replay("19-interrupt-background").last().transcript
        val ends = ThreadRows().of(transcript).filterIsInstance<TurnEndRow>()
        assertEquals(1, ends.size)
        assertEquals("send-1", ends.single().askKey)
    }

    @Test
    fun runningTurnHasNoEnd() {
        val first = turn("a")
        val running = opened("b", first)
        val ends = ThreadRows().of(running.transcript).filterIsInstance<TurnEndRow>()
        assertEquals(listOf("a"), ends.map { it.askKey })
        val rows = ThreadRows().of(running.transcript)
        assertTrue(rows.last() !is TurnEndRow)
    }

    @Test
    fun changedFilesAreWhatTheHostSaw() {
        val files =
            listOf(
                ChangedFile("z/Last.kt", added = 0, removed = 4, created = false, deleted = true),
                ChangedFile("a/First.kt", added = 9, removed = 0, created = true, deleted = false),
                ChangedFile("README.md", added = 1, removed = 1, created = false, deleted = false),
            )
        val view = changes(turn("a"), "a", files)
        val end = ThreadRows().of(view.transcript).filterIsInstance<TurnEndRow>().single()
        assertEquals(files, end.changes?.files)
    }

    @Test
    fun eachTurnEndsAfterItsOwnReply() {
        val view = turn("b", turn("a"))
        val rows = ThreadRows().of(view.transcript)
        val kinds = rows.map { it::class.simpleName }
        assertEquals(listOf("AskRow", "TextRow", "TurnEndRow", "AskRow", "TextRow", "TurnEndRow"), kinds)
        assertEquals(listOf("a", "b"), rows.filterIsInstance<TurnEndRow>().map { it.askKey })
    }

    @Test
    fun turnEndRowKeepsIdentity() {
        val rows = ThreadRows()
        val next = opened("b", turn("a"))
        val first = rows.of(next.transcript).filterIsInstance<TurnEndRow>().single()
        assertSame(first, rows.of(closed(next, "b").transcript).filterIsInstance<TurnEndRow>().first())
        val found = changes(next, "a", emptyList())
        assertNotSame(first, rows.of(found.transcript).filterIsInstance<TurnEndRow>().first())
    }

    @Test
    fun onlyATurnFollowedByAnotherAskOffersRewind() {
        val rows = ThreadRows()
        val alone = turn("a")
        val last = rows.of(alone.transcript).filterIsInstance<TurnEndRow>().single()
        assertFalse(last.followed)

        val next = turn("b", alone)
        val ends = rows.of(next.transcript).filterIsInstance<TurnEndRow>()
        assertEquals(listOf(true, false), ends.map { it.followed })
        assertNotSame(last, ends.first())
    }
}
