package dev.ukitomato.closta.platforms.intellij.chat

import dev.ukitomato.closta.presenter.view.AlertKind
import dev.ukitomato.closta.presenter.view.FinishedAlert
import dev.ukitomato.closta.presenter.view.OpenOnlyAlert
import dev.ukitomato.closta.presenter.view.PermissionAlert
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class AlertTextTest {
    @Test
    fun aPermissionSaysTheToolAndItsSubject() {
        val alert = PermissionAlert("r1", "r1", "Bash", "./gradlew test", answerable = true)
        assertEquals(
            AlertText("直して: Permission for Bash", "./gradlew test", answerable = true),
            alertText("直して", alert),
        )
    }

    @Test
    fun whatMustBeReadOnlyOpens() {
        assertEquals(
            listOf("t: Plan approval", "t: Question", "t: Edit permission"),
            AlertKind.entries.map { alertText("t", OpenOnlyAlert("r", "r", it)).title },
        )
        assertEquals(false, alertText("t", OpenOnlyAlert("r", "r", AlertKind.EDIT)).answerable)
    }

    @Test
    fun aFinishedTurnSaysSo() {
        assertEquals(
            AlertText("t: Reply finished", "", answerable = false),
            alertText("t", FinishedAlert("finished:1")),
        )
    }

    @Test
    fun theTitleAndTheBodyAreEscaped() {
        val text = alertText("a & b \"x\"", PermissionAlert("r1", "r1", "Bash", "cat a > b <file", answerable = true))

        assertEquals("a &amp; b &quot;x&quot;: Permission for Bash", text.htmlTitle)
        assertEquals("cat a &gt; b &lt;file", text.htmlBody)
        assertEquals("cat a > b <file", text.body)
        assertEquals("it&#39;s", escapeHtml("it's"))
    }

    @Test
    fun onlyWaitingGoesToTheOs() {
        assertTrue(wantsOsNotice(PermissionAlert("r1", "r1", "Bash", "ls", answerable = true)))
        assertTrue(AlertKind.entries.all { wantsOsNotice(OpenOnlyAlert("r", "r", it)) })
        assertFalse(wantsOsNotice(FinishedAlert("finished:1")))
    }
}
