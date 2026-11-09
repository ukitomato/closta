package dev.ukitomato.closta.platforms.intellij.session

import dev.ukitomato.closta.core.interfaces.AgentSession
import dev.ukitomato.closta.core.models.Attachment
import dev.ukitomato.closta.core.services.FixedClock
import dev.ukitomato.closta.core.services.RecordingAgentSession
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.IOException
import java.time.Instant

/** The step before a message is written to the CLI: its order, and a failing step not holding it back. */
class SessionCommandsBeforeSendTest {
    private val order = mutableListOf<String>()
    private val logged = mutableListOf<String>()

    private val session =
        object : AgentSession by RecordingAgentSession() {
            override suspend fun sendUserMessage(
                text: String,
                attachments: List<Attachment>,
                uuid: String?,
            ) {
                order += "send $text"
            }
        }

    private fun commands(beforeSend: suspend () -> Unit) =
        SessionCommands(session, FixedClock(Instant.EPOCH), ConversationStore(), beforeSend, logged::add)

    @Test
    fun `the step is called once, then the message is sent`() =
        runBlocking {
            commands { order += "before" }.sendMessage("m1", "hello")
            assertEquals(listOf("before", "send hello"), order)
        }

    @Test
    fun `a step that throws is logged as its type only, and the message is sent once`() =
        runBlocking {
            commands { throw IOException("SECRET-CANARY /home/someone") }.sendMessage("m1", "hello")
            assertEquals(listOf("send hello"), order)
            assertEquals(1, logged.size)
            assertTrue("java.io.IOException" in logged.single())
            assertTrue("SECRET-CANARY" !in logged.single())
        }

    @Test
    fun `a cancellation in the step is not turned into a send`() {
        assertThrows(CancellationException::class.java) {
            runBlocking { commands { throw CancellationException("cancelled") }.sendMessage("m1", "hello") }
        }
        assertEquals(emptyList<String>(), order)
    }

    @Test
    fun `without a step the message is sent as before`() =
        runBlocking {
            SessionCommands(session, FixedClock(Instant.EPOCH), ConversationStore()).sendMessage("m1", "hello")
            assertEquals(listOf("send hello"), order)
            assertEquals(emptyList<String>(), logged)
        }

    @Test
    fun `the message is in the transcript before the step runs`() =
        runBlocking {
            val store = ConversationStore()
            var seen: List<String> = emptyList()
            SessionCommands(
                session,
                FixedClock(Instant.EPOCH),
                store,
                { seen = store.view.value.transcript.messages.order },
                logged::add,
            ).sendMessage("m1", "hello")
            assertEquals(listOf("m1"), seen)
        }
}
