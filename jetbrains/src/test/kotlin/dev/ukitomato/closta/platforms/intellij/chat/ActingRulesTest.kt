package dev.ukitomato.closta.platforms.intellij.chat

import dev.ukitomato.closta.core.services.FixedClock
import dev.ukitomato.closta.core.services.RecordingAgentSession
import dev.ukitomato.closta.platforms.intellij.session.ConversationStore
import dev.ukitomato.closta.platforms.intellij.session.SessionCommands
import dev.ukitomato.closta.platforms.intellij.session.SessionFailure
import dev.ukitomato.closta.platforms.intellij.session.SessionStatus
import dev.ukitomato.closta.presenter.view.AskActions
import dev.ukitomato.closta.presenter.view.ForkFrom
import dev.ukitomato.closta.presenter.view.RewindConversation
import dev.ukitomato.closta.presenter.view.RewindFilesThenConversation
import dev.ukitomato.closta.presenter.view.RewindRefusal
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Instant

class ActingRulesTest {
    private val running =
        SessionStatus.Running(
            "2.1.282",
            SessionCommands(RecordingAgentSession(), FixedClock(Instant.EPOCH), ConversationStore()),
        )

    @Test
    fun originalStaysUntilTheCopyRuns() {
        assertEquals(CopyStep.Wait, copyStep(SessionStatus.Starting))
        assertEquals(CopyStep.Swap, copyStep(running))
    }

    @Test
    fun aCopyThatFailsKeepsTheOriginal() {
        val step = copyStep(SessionStatus.Failed(SessionFailure.CommandNotFound)) as CopyStep.Abandon
        assertTrue(step.reason.endsWith("The original conversation is unchanged."), step.reason)
        listOf(SessionStatus.Ended, SessionStatus.Closed).forEach {
            assertEquals(CopyStep.Abandon(COPY_NOT_OPENED), copyStep(it))
        }
    }

    // A copy of a copy cuts at a uuid of the forked record, which no capture has shown yet: when the line or its parent
    // is not there, the session fails before it starts, and the original stays.
    @Test
    fun aMissingCutPointKeepsTheOriginal() {
        val step = copyStep(SessionStatus.Failed(SessionFailure.RewindPointMissing)) as CopyStep.Abandon
        assertEquals(
            "Could not open the copy (${SessionFailure.RewindPointMissing.cause}). " +
                "The original conversation is unchanged.",
            step.reason,
        )
    }

    @Test
    fun aCopyThatNeverRunsKeepsTheOriginal() {
        assertEquals(CopyStep.Abandon(COPY_NO_START), copyTimedOut())
    }

    @Test
    fun actingRechecksAtClick() {
        val rewind = RewindConversation("u2")
        val files = RewindFilesThenConversation("send-2", "u2")
        val fork = ForkFrom("u3")
        val offered = AskActions(rewind, files, fork, null)
        listOf(rewind, files, fork).forEach { assertNull(clickRefusal(it, offered)) }
        // A turn started since the hover: nothing is offered any more.
        val now = AskActions(null, null, null, RewindRefusal.RUNNING)
        assertEquals("Cannot rewind while a reply is running", clickRefusal(rewind, now))
        // The conversation moved on: the fork's target is another one now.
        assertEquals(ACTION_OUT_OF_DATE, clickRefusal(fork, offered.copy(fork = ForkFrom("u4"))))
    }

    @Test
    fun oneActionAtATime() {
        val gate = ActingGate()
        assertTrue(gate.tryStart("s"))
        assertFalse(gate.tryStart("s"))
        assertTrue(gate.tryStart("other"))
        gate.done("s")
        assertTrue(gate.tryStart("s"))
    }

    @Test
    fun theFilesAnswerIsRecheckedForARunningTurn() {
        assertNull(afterFilesRefusal(null, running = false))
        assertEquals("Cannot rewind while a reply is running", afterFilesRefusal(null, running = true))
        assertEquals("x", afterFilesRefusal("x", running = true))
    }

    @Test
    fun aStoppedWorktreeConversationIsMarked() {
        assertTrue(marksOnStop("/repo/.claude/worktrees/w", "/repo", messages = 2))
        assertFalse(marksOnStop("/repo", "/repo", messages = 2), "the saved list shows the project's own")
        assertFalse(marksOnStop(null, "/repo", messages = 2))
        assertFalse(marksOnStop("/repo/.claude/worktrees/w", "/repo", messages = 0), "nothing saved to resume")
    }
}
