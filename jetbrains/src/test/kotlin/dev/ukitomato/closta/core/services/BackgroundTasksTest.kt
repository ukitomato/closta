package dev.ukitomato.closta.core.services

import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class BackgroundTasksTest {
    @Test
    fun `the request goes through the session with the tool use and the caller's request id`() =
        runBlocking {
            val session = RecordingAgentSession()

            BackgroundTasks(session)(toolUseId = "toolu_1", requestId = "req-3")
            BackgroundTasks(session)(toolUseId = null, requestId = "req-4")

            assertEquals(
                listOf<Pair<String?, String>>("toolu_1" to "req-3", null to "req-4"),
                session.backgroundRequests,
            )
        }
}
