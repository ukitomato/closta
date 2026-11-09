package dev.ukitomato.closta.platforms.intellij.chat

import dev.ukitomato.closta.platforms.intellij.session.SessionOpening
import dev.ukitomato.closta.presenter.view.ForkFrom
import dev.ukitomato.closta.presenter.view.RewindOutcome
import dev.ukitomato.closta.presenter.view.RewindRecord
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class RewindStepsTest {
    private fun record(
        outcome: RewindOutcome,
        detail: String? = null,
    ) = RewindRecord("r", "c", "m", dryRun = false, sendsAt = 1, turnsAt = 1, outcome = outcome, detail = detail)

    @Test
    fun aRewindOpensTheCopyCutBeforeTheAsk() {
        assertEquals(SessionOpening.Fork("s", "u2"), rewindOpening("s", "u2"))
    }

    @Test
    fun aRewindThatKeepsNothingIsANewConversation() {
        assertEquals(SessionOpening.New, rewindOpening("s", null))
    }

    @Test
    fun aForkCopiesUpToTheNextAskOrAll() {
        assertEquals(SessionOpening.Fork("s", "u3"), forkOpening("s", ForkFrom("u3")))
        assertEquals(SessionOpening.Fork("s", null), forkOpening("s", ForkFrom(null)))
    }

    @Test
    fun theConversationGoesBackOnlyAfterTheFilesDid() {
        assertNull(filesRewindRefusal(record(RewindOutcome.DONE)))
    }

    @Test
    fun aRefusalOfTheFilesKeepsTheConversation() {
        assertEquals(
            "Could not rewind the files (No file checkpoint found for this message.). The conversation is unchanged.",
            filesRewindRefusal(record(RewindOutcome.REFUSED, "No file checkpoint found for this message.")),
        )
        assertEquals(
            "Could not rewind the files. The conversation is unchanged.",
            filesRewindRefusal(record(RewindOutcome.FAILED)),
        )
    }

    @Test
    fun noAnswerKeepsTheConversation() {
        assertEquals(FILES_REWIND_NO_ANSWER, filesRewindRefusal(null))
        assertEquals(FILES_REWIND_NO_ANSWER, filesRewindRefusal(record(RewindOutcome.PENDING)))
    }
}
