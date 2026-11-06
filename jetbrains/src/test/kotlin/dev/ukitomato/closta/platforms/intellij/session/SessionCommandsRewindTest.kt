package dev.ukitomato.closta.platforms.intellij.session

import dev.ukitomato.closta.core.interfaces.AgentSession
import dev.ukitomato.closta.core.models.ConversationState
import dev.ukitomato.closta.core.models.Turn
import dev.ukitomato.closta.core.models.TurnPhase
import dev.ukitomato.closta.core.services.FixedClock
import dev.ukitomato.closta.core.services.RecordingAgentSession
import dev.ukitomato.closta.presenter.view.REWIND_SEND_FAILED
import dev.ukitomato.closta.presenter.view.REWIND_UNKNOWN_MESSAGE
import dev.ukitomato.closta.presenter.view.RewindOutcome
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.time.Instant

/**
 * The uuid a message goes to the CLI with, and the rewind of the files that names it: the session is
 * given the uuid the view keeps under the message's key, and a rewind is in the view as pending before it is written.
 */
class SessionCommandsRewindTest {
    private val store = ConversationStore()
    private val session = RecordingAgentSession()

    private fun commands(on: AgentSession = session) = SessionCommands(on, FixedClock(Instant.EPOCH), store)

    @Test
    fun `the uuid the CLI is given is the one the view keeps under the message's key`() =
        runBlocking {
            val commands = commands()
            commands.sendMessage("send-1", "one")
            commands.sendMessage("send-2", "two")
            val given = session.sentUuids
            assertEquals(2, given.size)
            assertTrue(given.all { it != null && it.isNotEmpty() })
            assertTrue(given[0] != given[1], "a uuid for each message")
            val kept = store.view.value.transcript.userUuids
            assertEquals(mapOf("send-1" to given[0], "send-2" to given[1]), kept)
        }

    @Test
    fun `a rewind names the uuid of its message, and stands in the view as pending before it is written`() =
        runBlocking {
            var seen: RewindOutcome? = null
            val watching =
                object : AgentSession by session {
                    override suspend fun rewindFiles(
                        userMessageId: String,
                        dryRun: Boolean,
                        requestId: String,
                    ) {
                        seen =
                            store.view.value.transcript.operations.rewind
                                ?.outcome
                        session.rewindFiles(userMessageId, dryRun, requestId)
                    }
                }
            val commands = commands(watching)
            commands.sendMessage("send-1", "one")
            commands.rewindFiles("c1", "send-1", true)
            assertEquals(RewindOutcome.PENDING, seen)
            val written = session.rewinds.single()
            assertEquals(session.sentUuids.single(), written.first)
            assertEquals(true, written.second)
            val record = store.view.value.transcript.operations.rewind
            assertNotNull(record)
            assertEquals(written.third, record!!.requestId)
            assertEquals("c1", record.commandId)
            assertEquals("send-1", record.messageId)
            assertEquals(1, record.sendsAt, "how many messages had been sent when it was asked")
        }

    @Test
    fun `a message the view has no uuid for is refused and nothing is written`() =
        runBlocking {
            commands().rewindFiles("c1", "send-9", false)
            assertTrue(session.rewinds.isEmpty())
            val record = store.view.value.transcript.operations.rewind!!
            assertEquals(RewindOutcome.FAILED, record.outcome)
            assertEquals(REWIND_UNKNOWN_MESSAGE, record.detail)
        }

    @Test
    fun `a write that throws is a failed record, and is thrown again`() =
        runBlocking {
            val broken =
                object : AgentSession by session {
                    override suspend fun rewindFiles(
                        userMessageId: String,
                        dryRun: Boolean,
                        requestId: String,
                    ): Unit = error("closed")
                }
            val commands = commands(broken)
            commands.sendMessage("send-1", "one")
            assertThrows<IllegalStateException> { commands.rewindFiles("c1", "send-1", true) }
            val record = store.view.value.transcript.operations.rewind!!
            assertEquals(RewindOutcome.FAILED, record.outcome)
            assertEquals(REWIND_SEND_FAILED, record.detail)
        }

    @Test
    fun `a refusal by the host is written on the view as a failed answer with its sentence`() =
        runBlocking {
            commands().rewindNotSent("c2", "send-1", false, "A turn is running.")
            val record = store.view.value.transcript.operations.rewind!!
            assertEquals(RewindOutcome.FAILED, record.outcome)
            assertEquals("A turn is running.", record.detail)
            assertEquals("c2", record.commandId)
        }

    @Test
    fun `a record keeps how many turns there had been, the CLI's own included, and a refused one keeps none`() =
        runBlocking {
            val commands = commands()
            commands.sendMessage("send-1", "one")
            store.transition {
                val closed = Turn("u1", TurnPhase.CLOSED)
                it.copy(conversation = ConversationState(turns = listOf(closed, closed), spontaneousResumeCount = 1))
            }
            commands.rewindFiles("c1", "send-1", true)
            assertEquals(
                3,
                store.view.value.transcript.operations.rewind!!
                    .turnsAt,
            )
            commands.rewindFiles("c2", "send-9", true)
            assertEquals(
                0,
                store.view.value.transcript.operations.rewind!!
                    .turnsAt,
            )
        }
}
