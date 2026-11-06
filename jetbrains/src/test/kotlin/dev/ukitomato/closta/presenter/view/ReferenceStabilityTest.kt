package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.core.models.ApprovalDecision
import dev.ukitomato.closta.presenter.at
import dev.ukitomato.closta.presenter.keysOf
import dev.ukitomato.closta.presenter.message
import dev.ukitomato.closta.presenter.part
import dev.ukitomato.closta.presenter.tree.JsonObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotSame
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestFactory

/**
 * An input that touches one message leaves every other node as the same object: that is what lets the differ
 * skip an untouched branch by identity, and the webview's converter keep a message it already converted.
 */
class ReferenceStabilityTest {
    private fun JsonObject.thread() = at("threads", "byId", CaptureReplay.THREAD)

    private val emptyDelta = Regex("\"(text|thinking|partial_json)\":\"\"")

    private fun addsNothing(frame: String): Boolean =
        frame.contains("\"signature_delta\"") ||
            frame.contains("\"message_delta\"") ||
            (frame.contains("\"content_block_delta\"") && emptyDelta.containsMatchIn(frame))

    private fun isTextDelta(input: PresenterInput): Boolean {
        val event = (input as? PresenterInput.Event)?.event as? AgentEvent.StreamEvent ?: return false
        return event.event.text.contains("\"text_delta\"") && !event.event.text.contains("\"text\":\"\"")
    }

    @TestFactory
    fun `a streamed text delta rebuilds only the path down to its part`(): List<DynamicTest> =
        CaptureReplay
            .scenarios()
            .filter { scenario ->
                CaptureReplay.inputs(scenario).any(::isTextDelta)
            }.map { scenario ->
                DynamicTest.dynamicTest(scenario) {
                    val steps = CaptureReplay.replay(scenario)
                    var deltas = 0
                    for (index in 1 until steps.size) {
                        if (!isTextDelta(steps[index].input)) continue
                        deltas++
                        val before = steps[index - 1].tree.thread()
                        val after = steps[index].tree.thread()
                        assertSame(
                            before.at("messages")["order"],
                            after.at("messages")["order"],
                            "$scenario #$index: messages order",
                        )
                        val touched = before.keysOf("messages").filter { before.message(it) !== after.message(it) }
                        assertEquals(1, touched.size, "$scenario #$index: one message rebuilt, got $touched")
                        val message = touched.single()
                        val parts = before.message(message).keysOf("parts")
                        assertSame(
                            before.message(message).at("parts")["order"],
                            after.message(message).at("parts")["order"],
                        )
                        val rebuilt =
                            parts.filter {
                                before.message(message).part(it) !==
                                    after.message(message).part(it)
                            }
                        assertEquals(1, rebuilt.size, "$scenario #$index: one part rebuilt, got $rebuilt")
                    }
                    assertTrue(deltas > 0)
                }
            }

    @TestFactory
    fun `an input that shows nothing new leaves the whole tree the same object`(): List<DynamicTest> =
        CaptureReplay.scenarios().map { scenario ->
            DynamicTest.dynamicTest(scenario) {
                val steps = CaptureReplay.replay(scenario)
                var quiet = 0
                for (index in 1 until steps.size) {
                    val event = (steps[index].input as? PresenterInput.Event)?.event
                    // An init or a status shows nothing new unless it changed the session, which the tree shows,
                    // or whether the CLI is compacting, which it shows too.
                    val sameSession = steps[index].conversation.session == steps[index - 1].conversation.session
                    val sameCompacting =
                        steps[index].transcript.operations.compacting ==
                            steps[index - 1].transcript.operations.compacting
                    val quietEvent =
                        event is AgentEvent.RateLimitEvent ||
                            (
                                sameSession &&
                                    sameCompacting &&
                                    (event is AgentEvent.SystemStatus || event is AgentEvent.SystemInit)
                            )
                    if (quietEvent) {
                        quiet++
                        assertSame(
                            steps[index - 1].tree,
                            steps[index].tree,
                            "$scenario #$index: ${event?.let { it::class.simpleName }}",
                        )
                    }
                }
                // 06, 24 and 28 are control requests only: none has an init, a status or a rate limit to be quiet
                // about.
                if (scenario !in setOf("06-context-usage", "24-mcp-management", "28-effort-live")) assertTrue(quiet > 0)
            }
        }

    @TestFactory
    fun `a frame that adds nothing leaves the transcript and the tree the same objects`(): List<DynamicTest> =
        CaptureReplay.scenarios().map { scenario ->
            DynamicTest.dynamicTest(scenario) {
                val steps = CaptureReplay.replay(scenario)
                var empty = 0
                for (index in 1 until steps.size) {
                    val text =
                        ((steps[index].input as? PresenterInput.Event)?.event as? AgentEvent.StreamEvent)
                            ?.event
                            ?.text
                    if (text == null || !addsNothing(text)) continue
                    empty++
                    assertSame(steps[index - 1].transcript, steps[index].transcript, "$scenario #$index: $text")
                    assertSame(steps[index - 1].tree, steps[index].tree, "$scenario #$index")
                }
                // 06, 07, 24 and 28 are control requests only: they have no streamed text.
                val controlOnly =
                    setOf("06-context-usage", "07-set-model-and-mode", "24-mcp-management", "28-effort-live")
                if (scenario !in controlOnly) {
                    assertTrue(empty > 0)
                }
            }
        }

    @Test
    fun `an answer to an approval rebuilds the message holding it and nothing else`() {
        val steps = CaptureReplay.replay("05-permission-can-use-tool")
        val answer = steps.indexOfFirst { it.input is PresenterInput.Decided }
        val before = steps[answer - 1].tree.thread()
        val after = steps[answer].tree.thread()
        val touched = before.keysOf("messages").filter { before.message(it) !== after.message(it) }
        assertEquals(listOf("846b6e3f-1ec3-4fb1-ab89-af04c9749651"), touched)
        assertSame(before.message("send-1"), after.message("send-1"))
        assertEquals(
            "fd37592b-7c5a-4653-bb77-f4b22769cdd5",
            ((steps[answer].input as PresenterInput.Decided).decision as ApprovalDecision.Allow).requestId,
        )
    }

    @Test
    fun `a fresh projector builds an equal tree, not the same objects`() {
        val once = CaptureReplay.finalTree("09-parallel-subagents")
        val again = CaptureReplay.finalTree("09-parallel-subagents")
        assertEquals(once, again)
        assertNotSame(once, again)
        assertNotSame(once.thread().message("send-1"), again.thread().message("send-1"))
    }

    @Test
    fun `touching one thread leaves the other thread node the same object`() {
        val projector = TreeProjector()
        val quiet = HostState().source("quiet")
        var busy = HostState()
        val first = projector.project(listOf(quiet, busy.source("busy")))
        busy = busy.next(PresenterInput.UserSent("u1", "hello"))
        val second = projector.project(listOf(quiet, busy.source("busy")))
        assertSame(first.at("threads", "byId", "quiet"), second.at("threads", "byId", "quiet"))
        assertNotSame(first.at("threads", "byId", "busy"), second.at("threads", "byId", "busy"))
        assertSame(first.at("threads")["order"], second.at("threads")["order"])
    }
}
