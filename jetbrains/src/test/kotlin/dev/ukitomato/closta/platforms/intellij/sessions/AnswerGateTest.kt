package dev.ukitomato.closta.platforms.intellij.sessions

import dev.ukitomato.closta.core.interfaces.Clock
import dev.ukitomato.closta.core.models.ApprovalDecision
import dev.ukitomato.closta.platforms.intellij.thread.CardAnswer
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.time.Instant
import javax.swing.JButton

class AnswerGateTest {
    private val clock = MovingClock()
    private val gate = AnswerGate(clock)
    private val sent = mutableListOf<CardAnswer>()
    private var waiting = setOf("r1")

    @AfterEach
    fun stop() = gate.dispose()

    private fun ask(requestId: String) = gate.ask(requestId, { waiting }) { answer, _ -> sent += answer }

    private fun allow(requestId: String) = CardAnswer(requestId, ApprovalDecision.Allow(requestId), "{}")

    @Test
    fun aPressInsideTheDelayIsRefusedAndOneAfterItSends() {
        gate.shown("s1", "r1")
        val ask = ask("r1")
        clock.pass(499)
        assertFalse(ask.send { allow("r1") })
        clock.pass(1)
        assertTrue(ask.send { allow("r1") })
        assertEquals(listOf(allow("r1")), sent)
    }

    @Test
    fun anAskSendsOnce() {
        gate.shown("s1", "r1")
        val ask = ask("r1")
        clock.pass(600)
        assertTrue(ask.send { allow("r1") })
        assertFalse(ask.send { allow("r1") })
        assertEquals(1, sent.size)
    }

    @Test
    fun aNewRequestInTheSameSessionStopsTheOldViewAndStartsTheDelayAgain() {
        gate.shown("s1", "r1")
        val old = ask("r1")
        clock.pass(600)
        waiting = setOf("r1", "r2")
        gate.shown("s1", "r2")
        assertFalse(old.send { allow("r1") })
        val next = ask("r2")
        assertFalse(next.send { allow("r2") })
        clock.pass(500)
        assertTrue(next.send { allow("r2") })
        assertEquals(listOf(allow("r2")), sent)
    }

    @Test
    fun aRequestThatNoLongerWaitsIsNotAnswered() {
        gate.shown("s1", "r1")
        val ask = ask("r1")
        clock.pass(600)
        waiting = emptySet()
        assertFalse(ask.send { allow("r1") })
        assertTrue(sent.isEmpty())
    }

    @Test
    fun anotherSessionShownStopsTheOldViewEvenForTheSameRequestId() {
        gate.shown("s1", "r1")
        val old = ask("r1")
        clock.pass(600)
        gate.reset()
        gate.shown("s2", "r1")
        assertFalse(old.send { allow("r1") })
        val other = ask("r1")
        assertFalse(other.send { allow("r1") })
        clock.pass(500)
        assertTrue(other.send { allow("r1") })
    }

    @Test
    fun redrawingTheSameRequestKeepsTheDelayItStarted() {
        gate.shown("s1", "r1")
        val ask = ask("r1")
        clock.pass(300)
        gate.shown("s1", "r1")
        clock.pass(200)
        assertTrue(ask.send { allow("r1") })
    }

    @Test
    fun aViewMadeAgainForTheSameRequestWaitsAgain() {
        gate.shown("s1", "r1")
        val first = ask("r1")
        clock.pass(600)
        gate.shown("s1", "r1")
        val again = ask("r1")
        assertFalse(first.send { allow("r1") })
        assertFalse(again.send { allow("r1") })
        clock.pass(499)
        assertFalse(again.send { allow("r1") })
        clock.pass(1)
        assertTrue(again.send { allow("r1") })
        assertEquals(listOf(allow("r1")), sent)
    }

    @Test
    fun comingBackIntoViewStartsTheDelayAgain() {
        gate.shown("s1", "r1")
        val ask = ask("r1")
        clock.pass(600)
        gate.seenAgain()
        assertFalse(ask.send { allow("r1") })
        clock.pass(500)
        assertTrue(ask.send { allow("r1") })
    }

    @Test
    fun guardedButtonsAreDisabledWhileThePressWouldBeRefused() {
        gate.shown("s1", "r1")
        val ask = ask("r1")
        var ready = false
        val button = JButton()
        val plain = JButton()
        ask.guard(button) { ready }
        ask.guard(plain)
        assertFalse(button.isEnabled)
        assertFalse(plain.isEnabled)
        clock.pass(500)
        ask.refresh()
        assertFalse(button.isEnabled)
        assertTrue(plain.isEnabled)
        ready = true
        ask.refresh()
        assertTrue(button.isEnabled)
        ask.send { allow("r1") }
        assertFalse(button.isEnabled)
        assertFalse(plain.isEnabled)
    }

    @Test
    fun nothingIsSentWhenTheAnswerCannotBeBuilt() {
        gate.shown("s1", "r1")
        val ask = ask("r1")
        clock.pass(500)
        assertFalse(ask.send { null })
        assertTrue(ask.send { allow("r1") })
    }

    @Test
    fun anAskForARequestNotShownIsAMistake() {
        gate.shown("s1", null)
        assertThrows<IllegalStateException> { ask("r1") }
    }

    @Test
    fun aFailedAnswerIsToldToTheView() {
        gate.shown("s1", "r1")
        var told = false
        val ask = gate.ask("r1", { waiting }) { _, failed -> failed() }
        ask.onFailed = { told = true }
        clock.pass(500)
        ask.send { allow("r1") }
        assertTrue(told)
    }

    private class MovingClock : Clock {
        private var now: Instant = Instant.parse("2026-11-05T00:00:00Z")

        override fun now(): Instant = now

        fun pass(ms: Long) {
            now = now.plusMillis(ms)
        }
    }
}
