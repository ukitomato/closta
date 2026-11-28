package dev.ukitomato.closta.platforms.intellij.thread

import dev.ukitomato.closta.presenter.view.ApprovalOutcome
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class PlanBarTest {
    private fun bar(
        planPresent: Boolean = true,
        answered: Boolean = false,
        pending: Boolean = true,
        sessionRunning: Boolean = true,
        changed: Boolean = true,
    ) = planBar(planPresent, answered, pending, sessionRunning, changed)

    @Test
    fun noPlanHidesTheBar() = assertEquals(PlanBar.HIDDEN, bar(planPresent = false))

    @Test
    fun aPlanAnsweredElsewhereHidesTheBar() = assertEquals(PlanBar.HIDDEN, bar(answered = true))

    @Test
    fun aRequestTheCliDoesNotHoldHidesTheBar() = assertEquals(PlanBar.HIDDEN, bar(pending = false))

    @Test
    fun noSessionHidesTheBar() = assertEquals(PlanBar.HIDDEN, bar(sessionRunning = false))

    @Test
    fun anUnchangedPlanShowsTheBarDisabled() = assertEquals(PlanBar.DISABLED, bar(changed = false))

    @Test
    fun aChangedPlanWaitingForAnAnswerIsReady() = assertEquals(PlanBar.READY, bar())

    @Test
    fun aRequestIsOpenWhileItWaitsInARunningSession() = assertEquals(true, planStillOpen(false, true, true))

    @Test
    fun aRequestIsNotOpenOnceAnsweredWithdrawnOrItsSessionGone() {
        assertEquals(false, planStillOpen(answered = true, pending = true, sessionRunning = true))
        assertEquals(false, planStillOpen(answered = false, pending = false, sessionRunning = true))
        assertEquals(false, planStillOpen(answered = false, pending = true, sessionRunning = false))
    }

    @Test
    fun aRequestHeldByARunningCliIsOpen() = assertTrue(planRequestOpen(null, listOf("a", "r"), "r", running = true))

    @Test
    fun aRequestWhoseCliEndedIsClosedEvenIfStillHeld() =
        assertFalse(planRequestOpen(null, listOf("r"), "r", running = false))

    @Test
    fun aRequestOutOfTheHeldOnesOrWithAnOutcomeIsClosed() {
        assertFalse(planRequestOpen(null, listOf("a"), "r", running = true))
        assertFalse(planRequestOpen(ApprovalOutcome.CANCELLED, listOf("r"), "r", running = true))
    }
}
