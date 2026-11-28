package dev.ukitomato.closta.platforms.intellij.thread

/** What the bar over a plan's tab shows: nothing, its buttons greyed out, or its buttons ready. */
enum class PlanBar { HIDDEN, DISABLED, READY }

/** Whether the plan's request can still be answered: not answered, still held by the CLI, in a running session. */
fun planStillOpen(
    answered: Boolean,
    pending: Boolean,
    sessionRunning: Boolean,
): Boolean = !answered && pending && sessionRunning

/**
 * The bar's state. Nothing shows when the card has no plan, the plan was answered somewhere, the CLI no longer waits
 * for it ([pending]) or the session is gone; the buttons wait for an edit ([changed]) before they work.
 */
fun planBar(
    planPresent: Boolean,
    answered: Boolean,
    pending: Boolean,
    sessionRunning: Boolean,
    changed: Boolean,
): PlanBar =
    when {
        !planPresent || !planStillOpen(answered, pending, sessionRunning) -> PlanBar.HIDDEN
        !changed -> PlanBar.DISABLED
        else -> PlanBar.READY
    }
