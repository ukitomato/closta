package dev.ukitomato.closta.core.services

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.core.models.ConversationState
import dev.ukitomato.closta.core.models.TurnPhase
import dev.ukitomato.closta.core.models.fold
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Assertions.assertAll
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * The write-side use cases (`SendMessage`/`SwitchModel`/`Interrupt`) issue their IO through
 * [dev.ukitomato.closta.core.interfaces.AgentSession] and hold no state; the state moves
 * only when the events the session emits are folded — never inside a use case.
 */
class ServicesIoTest {
    @Test
    fun `SendMessage sends the user message through the session`() =
        runBlocking {
            val session = RecordingAgentSession()

            SendMessage(session)("hi")

            assertEquals(listOf("hi"), session.sentMessages, "the message went through AgentSession")
        }

    @Test
    fun `SwitchModel sends the live model change through the session`() =
        runBlocking {
            val session = RecordingAgentSession()

            SwitchModel(session)("claude-opus-5-5", "req-1")

            assertEquals(listOf("claude-opus-5-5"), session.setModels, "the model change went through AgentSession")
            assertEquals(listOf("req-1"), session.setModelIds, "the caller's request id went with it")
        }

    @Test
    fun `SwitchPermissionMode and RequestContextUsage pass the caller's request id through the session`() =
        runBlocking {
            val session = RecordingAgentSession()

            SwitchPermissionMode(session)("plan", "req-2")
            RequestContextUsage(session)("req-3")

            assertEquals(listOf("plan" to "req-2"), session.setModes, "the mode change went through AgentSession")
            assertEquals(listOf("req-3"), session.contextRequests, "the usage request went through AgentSession")
        }

    @Test
    fun `the MCP use cases pass the caller's request id and the wanted value through the session`() =
        runBlocking {
            val session = RecordingAgentSession()

            RequestMcpStatus(session)("req-4")
            SetMcpServerEnabled(session)("fake-echo", false, "req-5")
            SetMcpServerEnabled(session)("fake-echo", true, "req-6")
            ReconnectMcpServer(session)("fake-echo", "req-7")

            assertEquals(listOf("req-4"), session.mcpStatusRequests)
            assertEquals(
                listOf(Triple("fake-echo", false, "req-5"), Triple("fake-echo", true, "req-6")),
                session.mcpToggles,
                "a wanted value, not a flip",
            )
            assertEquals(listOf("fake-echo" to "req-7"), session.mcpReconnects)
        }

    @Test
    fun `SendMessage passes the uuid on and RewindFiles asks for the rewind through the session`() =
        runBlocking {
            val session = RecordingAgentSession()

            SendMessage(session)("hi", uuid = "u-1")
            SendMessage(session)("again")
            RewindFiles(session)("u-1", true, "req-8")

            assertEquals(listOf<String?>("u-1", null), session.sentUuids)
            assertEquals(listOf(Triple("u-1", true, "req-8")), session.rewinds)
        }

    @Test
    fun `Interrupt sends the interrupt through the session`() =
        runBlocking {
            val session = RecordingAgentSession()

            Interrupt(session)()

            assertEquals(1, session.interruptCount, "the interrupt went through AgentSession")
        }

    @Test
    fun `the state advances by folding the events the session emits, not inside a use case`() =
        runBlocking {
            // A user-started turn opens on command_lifecycle{queued}. The session emits it; the read
            // side folds it. This is the path the use cases feed into — the transition is fold's.
            val opening =
                AgentEvent.CommandLifecycle(
                    uuid = "u1",
                    sessionId = "s1",
                    commandUuid = "c1",
                    state = "queued",
                )
            val session = RecordingAgentSession(emit = listOf(opening))

            val emitted = session.events.toList()
            val state = emitted.fold(ConversationState(), ::fold)

            assertAll(
                { assertEquals(1, state.turns.size, "folding the emitted event opened a turn") },
                { assertEquals("c1", state.turns.single().commandUuid, "turn correlated by command_uuid") },
                { assertEquals(TurnPhase.OPEN, state.turns.single().phase, "open until a correlated result") },
            )
            assertTrue(session.sentMessages.isEmpty(), "no send happened here — this is the read side")
        }
}
