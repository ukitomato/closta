package dev.ukitomato.closta.platforms.intellij.chat

import dev.ukitomato.closta.presenter.view.SessionGroup
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class SessionRowsTest {
    @Test
    fun theSecondLineJoinsWhatIsKnown() {
        assertEquals(
            "closta · main · Allow Bash: ls",
            secondLine(otherProject = null, head = GitHead("closta", "main"), reason = "Allow Bash: ls"),
        )
        assertEquals("other-app · closta · main", secondLine("other-app", GitHead("closta", "main"), null))
        assertEquals("", secondLine(null, null, null))
    }

    @Test
    fun onlyALiveConversationIsConfirmed() {
        assertEquals(
            listOf(true, true, false, false),
            SessionGroup.entries.map(::asksBeforeStopping),
        )
    }
}
