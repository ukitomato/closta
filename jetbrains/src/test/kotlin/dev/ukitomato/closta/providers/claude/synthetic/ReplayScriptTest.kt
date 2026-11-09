package dev.ukitomato.closta.providers.claude.synthetic

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.platforms.intellij.session.SessionView
import dev.ukitomato.closta.presenter.view.PresenterInput
import dev.ukitomato.closta.presenter.view.Role
import dev.ukitomato.closta.presenter.view.TextRecord
import dev.ukitomato.closta.presenter.view.ToolCallRecord
import dev.ukitomato.closta.providers.claude.protocol.StreamJsonCodec
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ReplayScriptTest {
    private val reply = "# 見出し\n\n段落の`code`です。\n\n```kotlin\nval a = 1 /* */\n```\n"

    private fun folded(lines: List<String>) =
        lines.fold(SessionView()) { view, line -> view.event(PresenterInput.Event(StreamJsonCodec.decode(line))) }

    @Test
    fun `every line decodes to a known event`() {
        ReplayScript.lines(reply).forEach { line ->
            val event = StreamJsonCodec.decode(line)
            assertFalse(event is AgentEvent.BrokenLine || event is AgentEvent.UnknownKind, line.take(LINE_PREVIEW))
        }
    }

    @Test
    fun `the folded transcript holds the reply verbatim and one finished Edit call`() {
        val view = folded(ReplayScript.lines(reply))
        val parts =
            view.transcript.messages
                .values()
                .filter { it.role == Role.ASSISTANT }
                .flatMap { it.parts.values() }
        assertEquals(
            reply,
            parts.filterIsInstance<TextRecord>().filterNot { it.reasoning }.joinToString("") { it.text },
        )
        val edit = parts.filterIsInstance<ToolCallRecord>().single()
        assertEquals("Edit", edit.toolName)
        assertTrue(edit.result != null, "the Edit has its result")
        assertTrue(parts.filterIsInstance<TextRecord>().none { it.streaming }, "nothing is left streaming")
    }

    @Test
    fun `text arrives in chunks of the given size`() {
        val deltas = ReplayScript.lines(reply, chunkChars = CHUNK).count { "\"text_delta\"" in it }
        assertEquals((reply.length + CHUNK - 1) / CHUNK, deltas)
    }

    private companion object {
        const val CHUNK = 8
        const val LINE_PREVIEW = 80
    }
}
