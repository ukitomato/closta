package dev.ukitomato.closta.core.services

import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class ReloadPluginsTest {
    @Test
    fun `the reload goes through the session with the caller's request id and busy choice`() =
        runBlocking {
            val session = RecordingAgentSession()

            ReloadPlugins(session)(refuseIfBusy = true, requestId = "req-7")

            assertEquals(listOf(true to "req-7"), session.pluginReloads)
        }
}
