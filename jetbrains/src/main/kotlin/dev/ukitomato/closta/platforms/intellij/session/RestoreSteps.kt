package dev.ukitomato.closta.platforms.intellij.session

import dev.ukitomato.closta.core.models.AgentEvent

/** How many of the newest lines a resumed session shows first. */
const val RESTORE_TAIL_LINES = 400

/**
 * The steps a resumed session puts its record back in, each a set of lines and how many older ones it leaves out: the
 * newest [tail] lines first (the rest counted with [dropped]), then every line. A record no longer than [tail] is one
 * step. Each step is meant for the view from before the restore, so the second replaces the first.
 */
fun restoreSteps(
    events: List<AgentEvent>,
    dropped: Int,
    tail: Int = RESTORE_TAIL_LINES,
): List<Pair<List<AgentEvent>, Int>> =
    if (events.size <= tail) {
        listOf(events to dropped)
    } else {
        listOf(events.takeLast(tail) to events.size - tail + dropped, events to dropped)
    }
