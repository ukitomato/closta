package dev.ukitomato.closta.platforms.intellij.chat

import dev.ukitomato.closta.presenter.view.SANDBOX_NOT_APPLIED
import dev.ukitomato.closta.presenter.view.SANDBOX_NOT_CONFIRMED
import dev.ukitomato.closta.presenter.view.SANDBOX_NOT_OFF
import dev.ukitomato.closta.presenter.view.SANDBOX_NOT_STARTED
import dev.ukitomato.closta.presenter.view.SANDBOX_REFUSED_TURN
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class PresenterTextsTest {
    @Test
    fun thePresentersSandboxReasonsHaveWords() {
        assertEquals(
            listOf(
                "composer.sandbox.reason.turn",
                "composer.sandbox.reason.notApplied",
                "composer.sandbox.reason.notOff",
                "composer.sandbox.reason.notConfirmed",
                "composer.sandbox.reason.notStarted",
            ),
            listOf(
                SANDBOX_REFUSED_TURN,
                SANDBOX_NOT_APPLIED,
                SANDBOX_NOT_OFF,
                SANDBOX_NOT_CONFIRMED,
                SANDBOX_NOT_STARTED,
            ).map(::sandboxReasonKey),
        )
    }

    @Test
    fun theClisOwnSentenceIsShownAsItIs() {
        assertNull(sandboxReasonKey("sandbox-exec is not available on this machine"))
    }
}
