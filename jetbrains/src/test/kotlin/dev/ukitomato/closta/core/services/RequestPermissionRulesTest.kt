package dev.ukitomato.closta.core.services

import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class RequestPermissionRulesTest {
    @Test
    fun `the use case passes the caller's request id through the session`() =
        runBlocking {
            val session = RecordingAgentSession()

            RequestPermissionRules(session)("req-9")

            assertEquals(listOf("req-9"), session.permissionRuleRequests)
        }
}
