package dev.ukitomato.closta.core.services

import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class RequestTaskOutputTest {
    @Test
    fun `the request goes through the session with the task and the caller's request id`() =
        runBlocking {
            val session = RecordingAgentSession()

            RequestTaskOutput(session)(taskId = "bt1", requestId = "req-7")

            assertEquals(listOf("bt1" to "req-7"), session.taskOutputRequests)
        }
}
