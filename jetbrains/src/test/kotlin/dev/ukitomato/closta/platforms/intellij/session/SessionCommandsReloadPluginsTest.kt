package dev.ukitomato.closta.platforms.intellij.session

import dev.ukitomato.closta.core.interfaces.AgentSession
import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.core.services.FixedClock
import dev.ukitomato.closta.core.services.RecordingAgentSession
import dev.ukitomato.closta.presenter.view.PresenterInput
import dev.ukitomato.closta.providers.claude.fixtures.CaptureFixtures
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.time.Instant

/** A reload asks to be refused when busy only if the view says the CLI honors it; a failed write is not waited for. */
class SessionCommandsReloadPluginsTest {
    private val store = ConversationStore()
    private val session = RecordingAgentSession()

    private fun commands(on: AgentSession = session) = SessionCommands(on, FixedClock(Instant.EPOCH), store)

    private fun operations() = store.view.value.transcript.operations

    @Test
    fun `a CLI that did not say it refuses a busy reload is asked without the field, and the request is waited for`() =
        runBlocking {
            commands().reloadPlugins()
            val (refuse, id) = session.pluginReloads.single()
            assertEquals(false, refuse)
            assertEquals(listOf(id), operations().reloadWaiting)
        }

    @Test
    fun `a CLI that says it refuses a busy reload is asked to`() =
        runBlocking {
            val init =
                CaptureFixtures
                    .readCapture("43-usage-and-rules.ndjson")
                    .filterIsInstance<AgentEvent.SystemInit>()
                    .first()
            store.transition { it.event(PresenterInput.Event(init)) }
            assertTrue(operations().refuseIfBusy)
            commands().reloadPlugins()
            assertEquals(true, session.pluginReloads.single().first)
        }

    @Test
    fun `a reload that could not be written is not waited for`() =
        runBlocking {
            val failing =
                object : AgentSession by session {
                    override suspend fun reloadPlugins(
                        refuseIfBusy: Boolean,
                        requestId: String,
                    ): Unit = error("closed")
                }
            assertThrows<IllegalStateException> { commands(failing).reloadPlugins() }
            assertTrue(operations().reloadWaiting.isEmpty())
        }
}
