package dev.ukitomato.closta.platforms.intellij.thread

import org.junit.jupiter.api.Assertions.assertEquals
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
}
