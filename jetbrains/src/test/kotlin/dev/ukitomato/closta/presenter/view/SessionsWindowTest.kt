package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.ConversationState
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Duration
import java.time.Instant

/** The sessions window's rows, selection, answer delay and detail. */
class SessionsWindowTest {
    private data class Row(
        val id: String,
        val group: SessionGroup,
        val unread: Boolean = false,
    )

    private val t0 = Instant.parse("2026-11-05T00:00:00Z")

    private fun at(ms: Long): Instant = t0.plus(Duration.ofMillis(ms))

    private fun shown(
        session: String,
        request: String?,
    ) = ShownAsk(session, request, t0)

    @Test
    fun windowRowsGroupsAndPutsUnreadFirstInFinished() {
        val a = Row("a", SessionGroup.OTHER)
        val b = Row("b", SessionGroup.UNREAD, unread = true)
        val c = Row("c", SessionGroup.WAITING)
        val d = Row("d", SessionGroup.RUNNING)
        val e = Row("e", SessionGroup.OTHER)
        val rows = windowRows(listOf(a, b, c, d, e), { windowGroupOf(it.group) }, { it.unread })
        assertEquals(
            listOf(
                WindowRow.Header(WindowGroup.WAITING, 1),
                WindowRow.Item(c),
                WindowRow.Header(WindowGroup.RUNNING, 1),
                WindowRow.Item(d),
                WindowRow.Header(WindowGroup.FINISHED, 3),
                WindowRow.Item(b),
                WindowRow.Item(a),
                WindowRow.Item(e),
            ),
            rows,
        )
    }

    @Test
    fun emptyGroupsHaveNoHeading() {
        val rows = windowRows(listOf("x"), { WindowGroup.RUNNING }, { false })
        assertEquals(listOf(WindowRow.Header(WindowGroup.RUNNING, 1), WindowRow.Item("x")), rows)
        assertEquals(
            emptyList<WindowRow<String>>(),
            windowRows(emptyList<String>(), { WindowGroup.RUNNING }, { false }),
        )
    }

    @Test
    fun selectionStaysOnTheSessionWhenRowsReorder() {
        assertEquals("s1", keptSelection("s1", listOf("s2", "s1")))
    }

    @Test
    fun selectionClearsWhenTheSessionGoes() {
        assertNull(keptSelection("s1", listOf("s2", "s3")))
    }

    @Test
    fun nextWaitingWrapsAndStartsAtFirst() {
        assertEquals("a", nextWaiting("b", listOf("a", "b")))
        assertEquals("b", nextWaiting("a", listOf("a", "b")))
        assertEquals("a", nextWaiting("x", listOf("a", "b")))
        assertNull(nextWaiting(null, emptyList()))
    }

    @Test
    fun answerWaitsForTheDelay() {
        val ask = shown("s1", "r1")
        assertFalse(acceptsAnswer(ask, "r1", setOf("r1"), at(ANSWER_DELAY_MS - 1)))
        assertTrue(acceptsAnswer(ask, "r1", setOf("r1"), at(ANSWER_DELAY_MS)))
    }

    @Test
    fun anotherRequestRestartsTheDelay() {
        val next = shownAfter(shown("s1", "r1"), "s1", "r2", at(600))
        assertEquals(at(600), next.since)
        assertFalse(acceptsAnswer(next, "r2", setOf("r2"), at(700)))
    }

    @Test
    fun anotherSessionRestartsTheDelay() {
        val next = shownAfter(shown("s1", "r1"), "s2", "r1", at(600))
        assertEquals(at(600), next.since)
        assertFalse(acceptsAnswer(next, "r1", setOf("r1"), at(700)))
    }

    @Test
    fun sameAskKeepsTheTime() {
        assertEquals(t0, shownAfter(shown("s1", "r1"), "s1", "r1", at(600)).since)
    }

    @Test
    fun onlyTheShownRequestIsAnswered() {
        assertFalse(acceptsAnswer(shown("s1", "r1"), "r2", setOf("r1", "r2"), at(1000)))
    }

    @Test
    fun aRequestNoLongerWaitingIsNotAnswered() {
        assertFalse(acceptsAnswer(shown("s1", "r1"), "r1", emptySet(), at(1000)))
    }

    @Test
    fun groupSinceStartsUnknownAndMovesOnChange() {
        val first = groupSinceAfter(null, SessionGroup.RUNNING, t0)
        assertEquals(GroupSince(WindowGroup.RUNNING, null), first)
        assertEquals(first, groupSinceAfter(first, SessionGroup.RUNNING, at(1000)))
        assertEquals(GroupSince(WindowGroup.WAITING, at(1000)), groupSinceAfter(first, SessionGroup.WAITING, at(1000)))
    }

    @Test
    fun finishingMovesTheTimeAndReadingKeepsIt() {
        val running = GroupSince(WindowGroup.RUNNING, t0)
        val finished = groupSinceAfter(running, SessionGroup.UNREAD, at(1000))
        assertEquals(GroupSince(WindowGroup.FINISHED, at(1000)), finished)
        assertEquals(finished, groupSinceAfter(finished, SessionGroup.OTHER, at(5000)))
    }

    @Test
    fun detailOfAWaitingSessionIsItsFirstCard() {
        val view =
            CaptureReplay.replay("05-permission-can-use-tool").first {
                it.conversation.pendingApprovals.any { p ->
                    p.requestId.isNotEmpty()
                }
            }
        val id =
            view.conversation.pendingApprovals
                .first { it.requestId.isNotEmpty() }
                .requestId
        val detail = sessionDetail(view.conversation, view.transcript) as SessionDetail.Waiting
        assertEquals(id, detail.card.requestId)
        assertEquals(0, detail.more)
    }

    @Test
    fun detailOfAFinishedSessionHasTheLastReply() {
        val last = CaptureReplay.replay("01-baseline-text").last()
        val detail = sessionDetail(last.conversation, last.transcript) as SessionDetail.Finished
        assertNotNull(detail.lastReply)
        assertEquals(lastReplyText(last.transcript), detail.lastReply)
        assertNotNull(detail.askKey)
    }

    @Test
    fun detailOfARunningToolNamesTheTool() {
        val detail = runningWithTool()
        assertNotNull(detail.tool)
    }

    @Test
    fun replyHeadIsTheFirstThreeNonBlankLines() {
        assertEquals("a\nb\nc…", replyHead("a\n\nb\n  \nc\nd"))
        assertEquals("a\nb", replyHead("a\n\nb"))
        assertNull(replyHead(null))
    }

    @Test
    fun streamingPastTheHeadKeepsTheRunningDetail() {
        val view = runningToolStep()
        val longer = sessionDetail(view.conversation, withReply(view.transcript, "one\ntwo\nthree\nfour"))
        val longest = sessionDetail(view.conversation, withReply(view.transcript, "one\ntwo\nthree\nfour\nfive six"))
        assertEquals(longer, longest)
        assertEquals("one\ntwo\nthree…", (longest as SessionDetail.Running).replyHead)
    }

    private fun runningToolStep(): CaptureReplay.Step =
        CaptureReplay.replay("02-tool-bash-autorun").first {
            (sessionDetail(it.conversation, it.transcript) as? SessionDetail.Running)?.tool != null
        }

    private fun runningWithTool(): SessionDetail.Running =
        runningToolStep().let { sessionDetail(it.conversation, it.transcript) as SessionDetail.Running }

    // The last assistant message with [text] as its only reply text (as if more of it had streamed).
    private fun withReply(
        transcript: Transcript,
        text: String,
    ): Transcript {
        val key = transcript.messages.order.last { transcript.messages[it]?.role == Role.ASSISTANT }
        return transcript.copy(
            messages =
                transcript.messages.update(key) { message ->
                    val others =
                        message.parts.order.fold(Keyed.empty<PartRecord>()) { parts, at ->
                            val part = message.parts[at]
                            if (part == null || part is TextRecord) parts else parts.put(at, part)
                        }
                    message.copy(parts = others.put("test-reply", TextRecord(reasoning = false, text = text)))
                },
        )
    }

    @Test
    fun detailBeforeAnyRequestIsFresh() {
        assertEquals(SessionDetail.Fresh, sessionDetail(ConversationState(), Transcript()))
    }
}
