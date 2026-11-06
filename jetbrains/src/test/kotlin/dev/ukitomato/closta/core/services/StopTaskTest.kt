package dev.ukitomato.closta.core.services

import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/**
 * `StopTask` is the same kind of use case as `Interrupt`: it issues the request through
 * [dev.ukitomato.closta.core.interfaces.AgentSession] and holds no state.
 */
class StopTaskTest {
    @Test
    fun `StopTask stops the one task through the session, by the id it was given`() =
        runBlocking {
            val session = RecordingAgentSession()

            StopTask(session)("bc4b0ae63")

            assertEquals(listOf("bc4b0ae63"), session.stoppedTasks, "the stop went through AgentSession")
            assertEquals(0, session.interruptCount, "a stop of one task is not an interrupt")
        }

    @Test
    fun `StopTask is stateless, so each call is its own request`() =
        runBlocking {
            val session = RecordingAgentSession()
            val stop = StopTask(session)

            stop("a")
            stop("b")
            stop("a")

            assertEquals(listOf("a", "b", "a"), session.stoppedTasks)
        }
}
