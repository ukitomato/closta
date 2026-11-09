package dev.ukitomato.closta.core.services

import dev.ukitomato.closta.core.interfaces.AgentSession
import dev.ukitomato.closta.core.models.ApprovalDecision
import dev.ukitomato.closta.core.models.ApprovalKind
import dev.ukitomato.closta.core.models.ConversationState
import dev.ukitomato.closta.core.models.PendingApproval
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Assertions.assertAll
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestFactory
import java.io.IOException
import java.time.Instant

/**
 * `RespondToApproval` takes the single [ApprovalDecision] mouth (four variants, not four methods),
 * sends the response through the session, and moves the state only via the pure `resolveApproval` — the
 * target pending is removed and the others are untouched.
 * The elapsed figure is read from the injected [FixedClock], never a real clock.
 */
class RespondToApprovalTest {
    private val now = Instant.parse("2026-09-28T00:00:05Z")
    private val requestedAt = now.minusMillis(5_000) // a 5s-old pending

    private fun twoPending(): ConversationState =
        ConversationState(
            pendingApprovals =
                listOf(
                    PendingApproval(requestId = "A", kind = ApprovalKind.APPROVAL),
                    PendingApproval(requestId = "B", kind = ApprovalKind.ASK),
                ),
        )

    @TestFactory
    fun `every decision variant removes its target pending and leaves the others`(): List<DynamicTest> {
        val variants: List<ApprovalDecision> =
            listOf(
                ApprovalDecision.Allow("A"),
                ApprovalDecision.Deny("A"),
                ApprovalDecision.Answered("A"),
                ApprovalDecision.AfkTimeout("A"),
            )
        return variants.map { decision ->
            DynamicTest.dynamicTest(decision::class.simpleName) {
                runBlocking {
                    val session = RecordingAgentSession()
                    val usecase = RespondToApproval(session, FixedClock(now))

                    val next = usecase(twoPending(), decision, requestedAt)

                    assertAll(
                        {
                            assertEquals(
                                listOf<String>("B"),
                                next.pendingApprovals.map { it.requestId },
                                "only the target pending A is removed; B stays",
                            )
                        },
                        {
                            assertEquals(
                                listOf(decision to null),
                                session.approvalResponses,
                                "the decision was sent through AgentSession",
                            )
                        },
                    )
                }
            }
        }
    }

    @Test
    fun `a send that throws reaches the caller and the pending approval stays`() {
        val before = twoPending()
        val failing =
            object : AgentSession by RecordingAgentSession() {
                override suspend fun respondToApproval(
                    decision: ApprovalDecision,
                    payload: String?,
                    updatedPermissions: String?,
                ): Unit = throw IOException("stdin is closed")
            }
        val usecase = RespondToApproval(failing, FixedClock(now))

        val thrown =
            assertThrows(IOException::class.java) {
                runBlocking { usecase(before, ApprovalDecision.Allow("A"), requestedAt) }
            }

        assertAll(
            { assertEquals("stdin is closed", thrown.message, "the exception is the session's own, not wrapped") },
            {
                assertEquals(
                    listOf("A", "B"),
                    before.pendingApprovals.map { it.requestId },
                    "no new state came back, so the caller still holds both pending approvals",
                )
            },
        )
    }

    @Test
    fun `an Answered decision passes the raw payload through opaquely`() =
        runBlocking {
            val session = RecordingAgentSession()
            val usecase = RespondToApproval(session, FixedClock(now))

            usecase(twoPending(), ApprovalDecision.Answered("A"), requestedAt, payload = "{\"answers\":[]}")

            assertEquals(
                listOf<Pair<ApprovalDecision, String?>>(ApprovalDecision.Answered("A") to "{\"answers\":[]}"),
                session.approvalResponses,
                "the host's raw response body rides through unread by core",
            )
        }

    @Test
    fun `accepted permission suggestions ride through to the session and default to null`() =
        runBlocking {
            val session = RecordingAgentSession()
            val usecase = RespondToApproval(session, FixedClock(now))
            val suggestions = """[{"type":"setMode","mode":"acceptEdits","destination":"session"}]"""

            usecase(twoPending(), ApprovalDecision.Allow("A"), requestedAt, updatedPermissions = suggestions)
            usecase(twoPending(), ApprovalDecision.Allow("B"), requestedAt)

            assertEquals(
                listOf<String?>(suggestions, null),
                session.acceptedPermissions,
                "the host's accepted suggestions reach the session unread; none stays null",
            )
        }

    @Test
    fun `a decision for a request that is not pending is a no-op on state`() =
        runBlocking {
            val session = RecordingAgentSession()
            val usecase = RespondToApproval(session, FixedClock(now))

            val next = usecase(twoPending(), ApprovalDecision.Allow("nonexistent"), requestedAt)

            assertEquals(
                listOf("A", "B"),
                next.pendingApprovals.map { it.requestId },
                "resolving an unknown request leaves the pending list untouched (resolveApproval no-op)",
            )
        }

    @Test
    fun `the use case consumes the injected clock, not a real one`() =
        runBlocking {
            // The use case reads time through the injected Clock, never a real one. A
            // counting clock proves consumption; a fixed clock could not, since resolveApproval discards
            // the elapsed figure and nothing about it reaches the returned state.
            val session = RecordingAgentSession()
            val clock = CountingClock(now)

            val next =
                RespondToApproval(session, clock)(
                    twoPending(),
                    ApprovalDecision.AfkTimeout("A"),
                    requestedAt,
                )

            assertAll(
                { assertTrue(clock.nowCalls >= 1, "RespondToApproval read the injected clock") },
                { assertEquals(listOf("B"), next.pendingApprovals.map { it.requestId }, "target pending removed") },
            )
        }
}
