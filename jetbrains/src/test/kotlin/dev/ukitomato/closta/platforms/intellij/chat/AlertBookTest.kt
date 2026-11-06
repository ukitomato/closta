package dev.ukitomato.closta.platforms.intellij.chat

import dev.ukitomato.closta.core.models.ConversationState
import dev.ukitomato.closta.presenter.view.AlertKind
import dev.ukitomato.closta.presenter.view.CaptureReplay
import dev.ukitomato.closta.presenter.view.OpenOnlyAlert
import dev.ukitomato.closta.presenter.view.SessionAlert
import dev.ukitomato.closta.presenter.view.Transcript
import org.junit.jupiter.api.Assertions.assertEquals
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

    @Test
    fun aPermissionSeenInViewAlertsWhenTheScreenCloses() {
        assertEquals(emptyList<SessionAlert>(), book.changed("s", views[at - 1], inView = true).raised)
        assertEquals(emptyList<SessionAlert>(), book.changed("s", views[at], inView = true).raised)

        assertEquals(listOf(OpenOnlyAlert(id, id, AlertKind.EDIT)), book.hidden("s"))
        assertEquals(emptyList<SessionAlert>(), book.hidden("s"), "once")
    }

    @Test
    fun aPermissionRaisedOutOfViewIsNotRaisedAgain() {
        book.changed("s", views[at - 1], inView = false)
        assertEquals(listOf(OpenOnlyAlert(id, id, AlertKind.EDIT)), book.changed("s", views[at], inView = false).raised)
        assertEquals(emptyList<SessionAlert>(), book.changed("s", views[at], inView = false).raised)
        assertEquals(emptyList<SessionAlert>(), book.hidden("s"))
    }

    @Test
    fun anAnsweredPermissionExpiresAndIsNotRaisedOnHiding() {
        book.changed("s", views[at], inView = false)
        assertEquals(listOf(id), book.changed("s", answered, inView = true).expired)
        assertEquals(emptyList<SessionAlert>(), book.hidden("s"))
    }

    @Test
    fun aForgottenSessionStartsAfresh() {
        book.changed("s", views[at], inView = false)
        book.forget("s")
        assertEquals(emptyList<SessionAlert>(), book.hidden("s"))
    }
}
