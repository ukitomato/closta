package dev.ukitomato.closta.platforms.intellij.chat

import dev.ukitomato.closta.core.models.ConversationState
import dev.ukitomato.closta.presenter.view.AlertKind
import dev.ukitomato.closta.presenter.view.CaptureReplay
import dev.ukitomato.closta.presenter.view.OpenOnlyAlert
import dev.ukitomato.closta.presenter.view.Transcript
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** Which notifications a session's changes raise, given whether it was in view at each change and when it went out. */
class AlertBookTest {
    private val views: List<Pair<ConversationState, Transcript>> =
        CaptureReplay.replay("17-edit-approval").map { it.conversation to it.transcript }
    private val at = views.indexOfFirst { view -> view.first.pendingApprovals.any { it.requestId.isNotEmpty() } }
    private val id =
        views[at]
            .first.pendingApprovals
            .single()
            .requestId
    private val answered = views.drop(at).first { view -> view.first.pendingApprovals.none() }
    private val book = AlertBook()

    private val edit = OpenOnlyAlert(id, id, AlertKind.EDIT)

    @Test
    fun manyWaitingMakeOneNoticeOfTheOldest() {
        val first = OpenOnlyAlert("r1", "r1", AlertKind.EDIT)
        val second = OpenOnlyAlert("r2", "r2", AlertKind.PLAN)
        assertEquals(WaitingNotice(first, more = 1), waitingNotice(listOf(first, second)))
        assertNull(waitingNotice(emptyList()))
    }

    @Test
    fun aPermissionSeenInViewIsShownWhenTheScreenCloses() {
        assertFalse(book.changed("s", views[at - 1], inView = true).replace)
        assertFalse(book.changed("s", views[at], inView = true).replace)

        val shown = book.hidden("s")
        assertEquals(WaitingNotice(edit, 0), shown.waiting)
        assertTrue(shown.replace && shown.fresh)
        assertFalse(book.hidden("s").replace, "once")
    }

    @Test
    fun theSameViewAgainDoesNotShowTheNoticeAgain() {
        book.changed("s", views[at - 1], inView = false)
        val shown = book.changed("s", views[at], inView = false)
        assertEquals(WaitingNotice(edit, 0), shown.waiting)
        assertTrue(shown.replace && shown.fresh)
        assertFalse(book.changed("s", views[at], inView = false).replace)
        assertFalse(book.hidden("s").replace)
    }

    @Test
    fun answeringInViewTakesTheNoticeAway() {
        book.changed("s", views[at], inView = false)
        val gone = book.changed("s", answered, inView = true)
        assertTrue(gone.replace)
        assertNull(gone.waiting)
        assertFalse(gone.fresh)
        assertFalse(book.hidden("s").replace)
    }

    @Test
    fun aForgottenSessionStartsAfresh() {
        book.changed("s", views[at], inView = false)
        book.forget("s")
        assertFalse(book.hidden("s").replace)
    }

    @Test
    fun aNewWaitReplacesTheNoticeAndIsFresh() {
        val a = OpenOnlyAlert("a", "a", AlertKind.PLAN)
        val b = OpenOnlyAlert("b", "b", AlertKind.QUESTION)
        book.decide("s", listOf(a), inView = false)
        val change = book.decide("s", listOf(a, b), inView = false)
        assertEquals(WaitingNotice(a, more = 1), change.waiting)
        assertTrue(change.replace && change.fresh)
    }

    @Test
    fun theHeadAnsweredWithOthersLeftReplacesTheNoticeWithoutNews() {
        val a = OpenOnlyAlert("a", "a", AlertKind.PLAN)
        val b = OpenOnlyAlert("b", "b", AlertKind.QUESTION)
        book.decide("s", listOf(a, b), inView = false)
        val change = book.decide("s", listOf(b), inView = false)
        assertEquals(WaitingNotice(b, more = 0), change.waiting)
        assertTrue(change.replace)
        assertFalse(change.fresh)
    }

    @Test
    fun aCountThatOnlyWentDownLeavesTheNotice() {
        val a = OpenOnlyAlert("a", "a", AlertKind.PLAN)
        val b = OpenOnlyAlert("b", "b", AlertKind.QUESTION)
        book.decide("s", listOf(a, b), inView = false)
        val change = book.decide("s", listOf(a), inView = false)
        assertFalse(change.replace)
        assertFalse(change.fresh)
    }

    @Test
    fun noWaitLeftTakesTheNoticeAway() {
        val a = OpenOnlyAlert("a", "a", AlertKind.PLAN)
        book.decide("s", listOf(a), inView = false)
        val change = book.decide("s", emptyList(), inView = false)
        assertTrue(change.replace)
        assertNull(change.waiting)
        assertFalse(change.fresh)
    }
}
