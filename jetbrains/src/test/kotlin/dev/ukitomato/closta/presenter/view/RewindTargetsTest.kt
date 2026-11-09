package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.providers.claude.history.CutCapture
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class RewindTargetsTest {
    private val steps = CaptureReplay.replay("27-resume-session-at", uuids = true)
    private val transcript = steps.last().transcript

    /** The uuids the three messages went to the CLI with, in order (the capture's `command_uuid`s). */
    private val sentUuids: List<String> =
        CaptureReplay
            .inputs("27-resume-session-at")
            .asSequence()
            .mapNotNull { (it as? PresenterInput.Event)?.event as? AgentEvent.CommandLifecycle }
            .filter { it.state == "queued" }
            .map { it.commandUuid }
            .distinct()
            .toList()

    private fun none(
        actions: AskActions,
        refusal: RewindRefusal,
    ) {
        assertNull(actions.rewind)
        assertNull(actions.rewindFiles)
        assertNull(actions.fork)
        assertEquals(refusal, actions.refusal)
    }

    @Test
    fun theCaptureSentThreeAsksUnderTheRecordsUuids() {
        assertEquals(3, sentUuids.size)
        // The record keeps the uuid a message was sent under as its user line's: what the cut point is read by.
        assertEquals(CutCapture.firstUserUuid, sentUuids[0])
        assertEquals(CutCapture.secondUserUuid, sentUuids[1])
        assertEquals(sentUuids, listOf("send-1", "send-2", "send-3").map { transcript.userUuids[it] })
    }

    @Test
    fun rewindTargetsTheAsksOwnUuid() {
        val actions = askActions(transcript, running = false, askKey = "send-2")
        assertEquals(RewindConversation(CutCapture.secondUserUuid), actions.rewind)
        assertNull(actions.refusal)
    }

    @Test
    fun theFirstAskRewindsToNothingKept() {
        assertEquals(RewindConversation(null), askActions(transcript, false, "send-1").rewind)
        assertEquals(RewindFilesThenConversation("send-1", null), askActions(transcript, false, "send-1").rewindFiles)
    }

    @Test
    fun aPartlyRestoredFirstAskHasAnEarlierLine() {
        val partly = transcript.copy(restored = RestoredRecord(until = "x", count = 3, partly = true))
        assertEquals(RewindConversation(sentUuids[0]), askActions(partly, false, "send-1").rewind)
    }

    @Test
    fun forkFromTheLastAsk() {
        assertEquals(ForkFrom(null), askActions(transcript, false, "send-3").fork)
    }

    @Test
    fun forkFromAMiddleAsk() {
        assertEquals(ForkFrom(sentUuids[2]), askActions(transcript, false, "send-2").fork)
        assertEquals(ForkFrom(sentUuids[1]), askActions(transcript, false, "send-1").fork)
    }

    @Test
    fun rewindRefusedWhileRunning() {
        none(askActions(transcript, running = true, askKey = "send-2"), RewindRefusal.RUNNING)
        none(turnEndActions(transcript, running = true, askKey = "send-1"), RewindRefusal.RUNNING)
    }

    @Test
    fun theCaptureIsRunningUntilItsTurnCloses() {
        // Mid-way through the second turn the thread runs, so the host passes running = true.
        val mid = steps.first { it.transcript.userUuids.size == 2 }
        assertEquals(true, threadIsRunning(mid.conversation, mid.transcript))
        assertEquals(false, threadIsRunning(steps.last().conversation, transcript))
    }

    @Test
    fun unknownAskHasNoActions() {
        none(askActions(transcript, false, "no-such-ask"), RewindRefusal.UNKNOWN)
        val unsent = CaptureReplay.replay("27-resume-session-at").last().transcript
        none(askActions(unsent, false, "send-2"), RewindRefusal.UNKNOWN)
    }

    @Test
    fun filesFirstThenConversation() {
        val files = askActions(transcript, false, "send-2").rewindFiles
        assertEquals(RewindFilesThenConversation(messageId = "send-2", rewindBefore = CutCapture.secondUserUuid), files)
    }

    @Test
    fun aLaterAskWithoutAUuidIsSkipped() {
        val withLost =
            HostState()
                .let { state ->
                    CaptureReplay.inputs("27-resume-session-at", uuids = true).fold(state) { s, i -> s.next(i) }
                }.next(PresenterInput.UserSent("lost", "never reached the CLI"))
                .transcript
        assertEquals(ForkFrom(null), askActions(withLost, false, "send-3").fork)
    }

    @Test
    fun turnEndRewindsToAfterItsTurn() {
        val actions = turnEndActions(transcript, false, "send-2")
        assertEquals(RewindConversation(sentUuids[2]), actions.rewind)
        assertEquals(RewindFilesThenConversation("send-3", sentUuids[2]), actions.rewindFiles)
        assertNull(actions.fork)
        assertNull(actions.refusal)
    }

    @Test
    fun theLastTurnEndHasNothingAfterIt() {
        none(turnEndActions(transcript, false, "send-3"), RewindRefusal.NOTHING_AFTER)
        none(turnEndActions(transcript, false, "no-such-ask"), RewindRefusal.UNKNOWN)
    }
}
