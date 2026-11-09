package dev.ukitomato.closta.providers.claude

import com.google.gson.JsonParser
import dev.ukitomato.closta.core.interfaces.AgentSession
import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.core.models.ApprovalDecision
import dev.ukitomato.closta.core.models.Attachment
import dev.ukitomato.closta.core.models.AttachmentKind
import dev.ukitomato.closta.providers.claude.fixtures.CaptureFixtures
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Assertions.assertAll
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Timeout
import java.util.IdentityHashMap

/**
 * Runs the shared [AgentSessionContract] against the production [ClaudeSession], driven by a
 * [FakeAgentProcess] that replays a recorded capture — no CLI. Only [sessionFor] is overridden;
 * the eight scenarios are inherited unchanged, which is the point of the one suite. The fake's stdout is
 * suspend/Flow and `ClaudeSession` reads it on the collecting coroutine, so the base's single-threaded
 * `runBlocking` + `yield` hand-off reaches the read pump.
 *
 * Adds three fake-specific checks the shared suite cannot make: the stdin serialisation / top-level
 * `request_id`, that a dropped stream is a non-cancellation exception, and that
 * cancelling the collection tears down the process (the lifetime is bound to the collecting
 * scope).
 */
class ClaudeSessionContractTest : AgentSessionContract() {
    // The process of each session the suite made, for reading what was written to its stdin.
    private val processes = IdentityHashMap<AgentSession, FakeAgentProcess>()

    override fun sessionFor(scenario: Scenario): AgentSession {
        val process = FakeAgentProcess(scriptFor(scenario))
        return ClaudeSession(process, SESSION_ID).also { processes[it] = process }
    }

    override fun afkPayload(): String = AFK_PAYLOAD

    override fun updatedPermissionsGiven(session: AgentSession): List<String?> =
        processes.getValue(session).writtenStdin.filter { it.contains("control_response") }.map { line ->
            JsonParser
                .parseString(line)
                .asJsonObject["response"]
                .asJsonObject["response"]
                .asJsonObject["updatedPermissions"]
                ?.toString()
        }

    override fun requestsGiven(session: AgentSession): List<RequestGiven> =
        processes.getValue(session).writtenStdin.map { JsonParser.parseString(it).asJsonObject }.mapNotNull { line ->
            val request = line["request"]?.asJsonObject ?: return@mapNotNull null
            val subtype = request["subtype"].asString
            val value =
                when (subtype) {
                    "set_model" -> request["model"].asString
                    "set_permission_mode" -> request["mode"].asString
                    "get_context_usage" -> request["detail"].asString
                    "mcp_status" -> null
                    "mcp_toggle" -> "${request["serverName"].asString}:${request["enabled"].asBoolean}"
                    "mcp_reconnect" -> request["serverName"].asString
                    "rewind_files" -> "${request["user_message_id"].asString}:${request["dry_run"].asBoolean}"
                    else -> return@mapNotNull null
                }
            RequestGiven(subtype, line["request_id"].asString, value)
        }

    override fun uuidsGiven(session: AgentSession): List<String?> =
        processes
            .getValue(session)
            .writtenStdin
            .map { JsonParser.parseString(it).asJsonObject }
            .filter { it["type"].asString == "user" }
            .map { it["uuid"].asString }

    override fun messagesGiven(session: AgentSession): List<MessageGiven> =
        processes
            .getValue(session)
            .writtenStdin
            .map { JsonParser.parseString(it).asJsonObject }
            .filter {
                it["type"].asString == "user"
            }.map { line ->
                val content = line["message"].asJsonObject["content"]
                if (content.isJsonArray) {
                    val blocks = content.asJsonArray.map { it.asJsonObject }
                    MessageGiven(blocks.last()["text"].asString, blocks.size - 1)
                } else {
                    MessageGiven(content.asString, 0)
                }
            }

    private fun scriptFor(scenario: Scenario): ProcessScript =
        when (scenario) {
            Scenario.SEND_TURN -> straightReplay(rawLines(BASELINE))
            Scenario.APPROVAL_ALLOW, Scenario.APPROVAL_DENY, Scenario.INTERRUPT, Scenario.UNANSWERED ->
                awaitingAfterControlRequest(rawLines(PERMISSION))
            Scenario.AFK_TIMEOUT -> awaitingAfterControlRequest(rawLines(ASK_AFK))
            Scenario.DROPPED_CONNECTION ->
                straightReplay(
                    rawLines(BASELINE),
                    ProcessTermination.Error(IllegalStateException("stdout closed mid-stream")),
                )
            Scenario.LAUNCH_FAILURE ->
                ProcessScript(
                    emptyList(),
                    ProcessTermination.LaunchFailure(IllegalStateException("claude not found (exit 127)")),
                )
        }

    private fun rawLines(capture: String): List<String> = CaptureFixtures.nonBlankLines(CaptureFixtures.textOf(capture))

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `an approval reply is written to stdin keyed to the top-level request_id`() =
        runBlocking {
            val process = FakeAgentProcess(awaitingAfterControlRequest(rawLines(PERMISSION)))
            val session = ClaudeSession(process, SESSION_ID)
            val received = mutableListOf<AgentEvent>()
            val collector = launch { session.events.collect { received += it } }
            val request = awaitControlRequest(received)
            session.respondToApproval(ApprovalDecision.Allow(request.requestId))
            collector.join()
            val reply = process.writtenStdin.single { it.contains("control_response") }
            assertTrue(reply.contains("\"request_id\":\"${request.requestId}\"")) {
                "the allow reply is keyed to the top-level request_id"
            }
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `an allow carries updatedPermissions as the given array, and leaves the key out when null`() =
        runBlocking {
            val suggestions = """[{"type":"setMode","mode":"acceptEdits","destination":"session"}]"""
            val written =
                listOf<String?>(suggestions, null).map { accepted ->
                    val process = FakeAgentProcess(awaitingAfterControlRequest(rawLines(PERMISSION)))
                    val session = ClaudeSession(process, SESSION_ID)
                    val received = mutableListOf<AgentEvent>()
                    val collector = launch { session.events.collect { received += it } }
                    val request = awaitControlRequest(received)
                    session.respondToApproval(ApprovalDecision.Allow(request.requestId), "{}", accepted)
                    collector.join()
                    JsonParser
                        .parseString(process.writtenStdin.single { it.contains("control_response") })
                        .asJsonObject["response"]
                        .asJsonObject["response"]
                        .asJsonObject
                }
            assertAll(
                {
                    assertEquals(
                        JsonParser.parseString(suggestions),
                        written[0]["updatedPermissions"],
                        "the accepted array is written as JSON equal to what was passed",
                    )
                },
                { assertFalse(written[1].has("updatedPermissions")) { "no suggestions: the key is absent" } },
            )
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `stopTask writes one stop_task control_request with the task id to stdin`() =
        runBlocking {
            val process = FakeAgentProcess(awaitingAfterControlRequest(rawLines(PERMISSION)))
            val session = ClaudeSession(process, SESSION_ID)
            val received = mutableListOf<AgentEvent>()
            val collector = launch { session.events.collect { received += it } }
            awaitControlRequest(received)
            session.stopTask("bc4b0ae63")
            collector.join() // the fake releases its wait on any stdin write, so the stream ends after the line
            val line = process.writtenStdin.single()
            val json = JsonParser.parseString(line).asJsonObject
            assertEquals("control_request", json["type"].asString)
            assertTrue(json["request_id"].asString.isNotEmpty()) { "a control request has an id of its own" }
            assertEquals("stop_task", json["request"].asJsonObject["subtype"].asString)
            assertEquals("bc4b0ae63", json["request"].asJsonObject["task_id"].asString)
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `a text attachment that is not UTF-8 fails without its name or its bytes in the message`() =
        runBlocking {
            val session = ClaudeSession(FakeAgentProcess(straightReplay(rawLines(BASELINE))), SESSION_ID)
            val bad =
                Attachment(AttachmentKind.TEXT, "text/plain", "private-notes.txt", byteArrayOf(0x68, 0xC3.toByte()))

            val failure =
                try {
                    session.sendUserMessage("question", listOf(bad))
                    null
                } catch (
                    @Suppress("TooGenericExceptionCaught") thrown: Exception,
                ) {
                    thrown
                }

            assertNotNull(failure) { "a text that is not UTF-8 is refused, not sent damaged" }
            assertFalse(failure!!.message.orEmpty().contains("private-notes")) { "the name is not in the message" }
            assertFalse(failure.toString().contains("private-notes")) { "nor in the failure as a whole" }
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `a dropped connection surfaces a non-cancellation exception`() =
        runBlocking {
            val session =
                ClaudeSession(
                    FakeAgentProcess(
                        straightReplay(rawLines(BASELINE), ProcessTermination.Error(IllegalStateException("dropped"))),
                    ),
                    SESSION_ID,
                )
            var thrown: Throwable? = null
            try {
                session.events.collect { }
            } catch (
                @Suppress("TooGenericExceptionCaught") failure: Throwable,
            ) {
                thrown = failure
            }
            assertNotNull(thrown) { "a dropped connection surfaces as an exception" }
            assertTrue(
                thrown !is CancellationException,
            ) { "DROPPED must be a provider exception, not cancellation" }
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `cancelling the events collection destroys the process`() =
        runBlocking {
            // A capture that blocks after its control_request keeps the collection live so we can cancel it
            // mid-stream; the lifetime is bound to this collecting scope.
            val process = FakeAgentProcess(awaitingAfterControlRequest(rawLines(PERMISSION)))
            val session = ClaudeSession(process, SESSION_ID)
            val received = mutableListOf<AgentEvent>()
            val collector = launch { session.events.collect { received += it } }
            awaitControlRequest(received) // the read pump is live and the stream is open (blocked on stdin)
            assertFalse(process.isDestroyed) { "the process must not be destroyed while the collection is live" }
            collector.cancelAndJoin()
            assertTrue(process.isDestroyed) {
                // removing process.destroy() from the finally fails this (anti-false-green)
                "cancelling the collection must tear the process down"
            }
        }

    private companion object {
        const val SESSION_ID = "test-session"
        const val BASELINE = "01-baseline-text.ndjson"
        const val PERMISSION = "05-permission-can-use-tool.ndjson"
        const val ASK_AFK = "15-ask-afktimeout-updatedinput.ndjson"
        const val AFK_PAYLOAD = """{"afkTimeoutMs":5000}"""
        const val TIMEOUT_SECONDS = 30L
    }
}
