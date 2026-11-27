package dev.ukitomato.closta.platforms.intellij.thread

import dev.ukitomato.closta.presenter.view.ApprovalOutcome
import dev.ukitomato.closta.presenter.view.ElicitationCard
import dev.ukitomato.closta.presenter.view.ElicitationStage
import dev.ukitomato.closta.presenter.view.ElicitationValue
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** What a form keeps of what was typed, through redraws, a pane made again, and the end of the request. */
class ElicitationDraftsTest {
    private val typed = mapOf("name" to ElicitationValue.Text("Ada"))
    private val waiting =
        ElicitationCard(
            requestId = "e1",
            heading = "files",
            message = "Name",
            description = null,
            urlHost = null,
            url = null,
            fields = emptyList(),
            isUrl = false,
            stage = ElicitationStage.WAITING,
            sentAction = null,
            sentContent = null,
            failure = null,
            answerable = true,
            answered = null,
        )

    @Test
    fun rebuildsElicitationCard() {
        val drafts = ElicitationDrafts()
        // The stream goes on: only the words changed, the fields are left alone and nothing is taken or dropped.
        assertFalse(drafts.redraw(waiting, waiting.copy(message = "More words"), { error("not read") }))
        // The answer failed: the card is made again, and what was typed is kept for the new one.
        val failed = waiting.copy(failure = "could not send")
        assertTrue(drafts.redraw(waiting, failed) { typed })
        assertEquals(typed, drafts.draftFor(failed))
    }

    @Test
    fun `a row made again for a request that waits gets what was typed`() {
        val drafts = ElicitationDrafts()
        drafts.keep("e1", typed)
        assertEquals(typed, drafts.draftFor(waiting))
        assertEquals(emptyMap<String, ElicitationValue>(), drafts.draftFor(waiting.copy(requestId = "e2")))
    }

    @Test
    fun `an answered or withdrawn request drops its draft`() {
        listOf(
            waiting.copy(stage = ElicitationStage.SENT, answerable = false, answered = ApprovalOutcome.APPROVED),
            waiting.copy(stage = ElicitationStage.WITHDRAWN, answerable = false, answered = ApprovalOutcome.WITHDRAWN),
            waiting.copy(stage = ElicitationStage.IN_BROWSER, answerable = false),
        ).forEach { ended ->
            val drafts = ElicitationDrafts()
            drafts.keep("e1", typed)
            assertEquals(emptyMap<String, ElicitationValue>(), drafts.draftFor(ended))
            assertEquals(0, drafts.size())
            // Showing the end on a view that was on screen drops it too.
            drafts.keep("e1", typed)
            drafts.redraw(waiting, ended) { typed }
            assertEquals(0, drafts.size())
        }
    }

    @Test
    fun `the pane made again is given the draft the pane kept, and nothing else`() {
        assertEquals(typed, draftOf(typed))
        assertNull(draftOf(null))
        assertNull(draftOf("a sentence of a permission pane"))
    }
}
