package dev.ukitomato.closta.core.services

import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class CancelQueuedMessageTest {
    @Test
    fun `CancelQueuedMessage passes the message uuid and the caller's request id through the session`() =
        runBlocking {
            val session = RecordingAgentSession()

            CancelQueuedMessage(session)("msg-1", "req-9")

            assertEquals(listOf("msg-1" to "req-9"), session.queuedCancellations)
        }
}
