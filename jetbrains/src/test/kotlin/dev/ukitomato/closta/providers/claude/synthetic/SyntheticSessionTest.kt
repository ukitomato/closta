package dev.ukitomato.closta.providers.claude.synthetic

import dev.ukitomato.closta.platforms.intellij.session.SessionView
import dev.ukitomato.closta.presenter.view.MessageRecord
import dev.ukitomato.closta.presenter.view.PresenterInput
import dev.ukitomato.closta.presenter.view.Role
import dev.ukitomato.closta.presenter.view.TextRecord
import dev.ukitomato.closta.presenter.view.ToolCallRecord
import dev.ukitomato.closta.providers.claude.protocol.StreamJsonCodec
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class SyntheticSessionTest {
    private val shape = SyntheticSession.LARGEST

    private fun folded(turns: List<SyntheticTurn>): SessionView =
        turns.foldIndexed(SessionView()) { index, view, turn ->
            turn.lines.fold(view.sent(PresenterInput.UserSent("u$index", turn.prompt))) { next, line ->
                next.event(PresenterInput.Event(StreamJsonCodec.decode(line)))
            }
        }

    private fun calls(messages: List<MessageRecord>): List<ToolCallRecord> =
        messages.flatMap { message ->
            message.parts.values().filterIsInstance<ToolCallRecord>().flatMap {
                listOf(
                    it,
                ) + calls(it.messages.values())
            }
        }

    private fun texts(messages: List<MessageRecord>): List<TextRecord> =
        messages.flatMap { message ->
            message.parts.values().filterIsInstance<TextRecord>() +
                message.parts
                    .values()
                    .filterIsInstance<ToolCallRecord>()
                    .flatMap { texts(it.messages.values()) }
        }

    @Test
    fun `the largest recorded session is reproduced in shape`() {
        val messages = folded(SyntheticSession.turns()).transcript.messages.values()
        assertEquals(shape.turns, messages.count { it.role == Role.USER })
        val calls = calls(messages)
        assertEquals(shape.tools, calls.size, "every tool call, nested ones included")
        assertEquals(shape.subagents, calls.count { it.toolName == "Task" })
        assertTrue(
            calls.filter { it.toolName == "Task" }.all { it.messages.size > 0 },
            "each sub-agent has its conversation",
        )
        assertEquals(shape.skills, calls.count { it.toolName == "Skill" })
        assertEquals(shape.mcp, calls.count { it.toolName.startsWith("mcp__") })
        assertTrue(calls.all { it.result != null }, "every call has its result")
        val replies = texts(messages.filter { it.role == Role.ASSISTANT }).map { it.text.length }
        assertTrue(replies.sum() in shape.totalText - SLACK..shape.totalText + SLACK, "total ${replies.sum()}")
        assertTrue(replies.max() >= shape.longestText, "longest ${replies.max()}")
    }

    @Test
    fun `the same seed gives the same session`() {
        assertEquals(SyntheticSession.turns(seed = 7), SyntheticSession.turns(seed = 7))
    }

    private companion object {
        const val SLACK = 10_000
    }
}
