package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.ConversationState
import dev.ukitomato.closta.core.models.Turn
import dev.ukitomato.closta.core.models.TurnPhase
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

/** The rule for refusing a rewind of the files, alone: what the bridge calls before it writes. */
class RewindRefusalTest {
    private fun transcript(
        rewind: RewindRecord? = null,
        sends: Int = 1,
        known: Map<String, String> = mapOf("send-1" to "uuid-1"),
    ) = Transcript(
        routing = Routing(sends = sends),
        operations = OperationRecords(rewind = rewind),
        userUuids = known,
    )

    private fun checked(
        sendsAt: Int = 1,
        turnsAt: Int = 0,
        dryRun: Boolean = true,
        outcome: RewindOutcome = RewindOutcome.DONE,
        messageId: String = "send-1",
    ) = RewindRecord("r", "c", messageId, dryRun, sendsAt, turnsAt, outcome)

    @Test
    fun `a message with no uuid is refused, whatever else is true`() {
        assertEquals(REWIND_UNKNOWN_MESSAGE, rewindRefusal(transcript(), 0, "send-7", true, midTurn = false))
        assertEquals(REWIND_UNKNOWN_MESSAGE, rewindRefusal(transcript(), 0, "send-7", true, midTurn = true))
    }

    @Test
    fun `a running turn refuses both the dry run and the real one`() {
        assertEquals(REWIND_TURN_RUNNING, rewindRefusal(transcript(checked()), 0, "send-1", true, midTurn = true))
        assertEquals(REWIND_TURN_RUNNING, rewindRefusal(transcript(checked()), 0, "send-1", false, midTurn = true))
    }

    @Test
    fun `a dry run is allowed with nothing before it`() {
        assertNull(rewindRefusal(transcript(), 0, "send-1", true, midTurn = false))
    }

    @Test
    fun `a real rewind is allowed only after a dry run of the same message that was done, with no send since`() {
        assertNull(rewindRefusal(transcript(checked()), 0, "send-1", false, midTurn = false))
        assertEquals(REWIND_CHECK_FIRST, rewindRefusal(transcript(), 0, "send-1", false, midTurn = false), "no dry run")
        assertEquals(
            REWIND_CHECK_FIRST,
            rewindRefusal(transcript(checked(outcome = RewindOutcome.PENDING)), 0, "send-1", false, midTurn = false),
        )
        assertEquals(
            REWIND_CHECK_FIRST,
            rewindRefusal(transcript(checked(outcome = RewindOutcome.REFUSED)), 0, "send-1", false, midTurn = false),
        )
        assertEquals(
            REWIND_CHECK_FIRST,
            rewindRefusal(transcript(checked(dryRun = false)), 0, "send-1", false, midTurn = false),
            "the last one was a real rewind",
        )
        assertEquals(
            REWIND_CHECK_FIRST,
            rewindRefusal(
                transcript(checked(messageId = "send-2"), known = mapOf("send-1" to "u1", "send-2" to "u2")),
                0,
                "send-1",
                false,
                midTurn = false,
            ),
            "a dry run of another message",
        )
    }

    @Test
    fun `a message sent after the dry run makes the real rewind refused, and the dry run again is allowed`() {
        val later = transcript(checked(sendsAt = 1), sends = 2)
        assertEquals(REWIND_CHECK_FIRST, rewindRefusal(later, 0, "send-1", false, midTurn = false))
        assertNull(rewindRefusal(later, 0, "send-1", true, midTurn = false))
    }

    @Test
    fun `a real rewind is allowed when the turns are the same as at the dry run, and refused when there are more`() {
        assertNull(rewindRefusal(transcript(checked(turnsAt = 3)), 3, "send-1", false, midTurn = false))
        assertEquals(
            REWIND_CHECK_FIRST,
            rewindRefusal(transcript(checked(turnsAt = 3)), 4, "send-1", false, midTurn = false),
            "a turn since, whoever began it",
        )
        val dryAgain = rewindRefusal(transcript(checked(turnsAt = 3)), 4, "send-1", true, midTurn = false)
        assertNull(dryAgain, "a dry run again")
    }

    @Test
    fun `turnsSoFar is the turns and the turns the CLI began on its own`() {
        val turn = Turn("u1", TurnPhase.CLOSED)
        assertEquals(0, turnsSoFar(ConversationState()))
        assertEquals(2, turnsSoFar(ConversationState(turns = listOf(turn, turn))))
        assertEquals(3, turnsSoFar(ConversationState(turns = listOf(turn, turn), spontaneousResumeCount = 1)))
        assertEquals(1, turnsSoFar(ConversationState(spontaneousResumeCount = 1)))
    }
}
