package dev.ukitomato.closta.presenter.view

import java.time.Duration
import java.time.Instant

// What the bottom sessions window decides: its rows, which session stays selected, when the detail may take an answer,
// and what the detail shows. The screens only show these.

/** A heading of the sessions tree; the tree shows the groups in this order. */
enum class WindowGroup { WAITING, RUNNING, FINISHED, WAS_RUNNING }

/** The heading a session of [group] sits under. */
fun windowGroupOf(group: SessionGroup): WindowGroup =
    when (group) {
        SessionGroup.WAITING -> WindowGroup.WAITING
        SessionGroup.RUNNING -> WindowGroup.RUNNING
        SessionGroup.UNREAD, SessionGroup.OTHER -> WindowGroup.FINISHED
    }

/** A row of the sessions tree: a heading with the number of items under it, or one item. */
sealed interface WindowRow<out T> {
    data class Header(
        val group: WindowGroup,
        val count: Int,
    ) : WindowRow<Nothing>

    data class Item<T>(
        val item: T,
    ) : WindowRow<T>
}

/**
 * Items under their headings; empty groups have no heading; inside FINISHED the [unread] ones come first, else order
 * kept.
 */
fun <T> windowRows(
    items: List<T>,
    groupOf: (T) -> WindowGroup,
    unread: (T) -> Boolean,
): List<WindowRow<T>> {
    val byGroup = items.groupBy(groupOf)
    return WindowGroup.entries.flatMap { group ->
        val members = byGroup[group].orEmpty()
        if (members.isEmpty()) {
            emptyList()
        } else {
            val ordered = if (group == WindowGroup.FINISHED) members.sortedBy { if (unread(it)) 0 else 1 } else members
            listOf<WindowRow<T>>(WindowRow.Header(group, members.size)) + ordered.map { WindowRow.Item(it) }
        }
    }
}

/** The selection after the list changed: [selected] if still in [ids], else null. Never another session. */
fun keptSelection(
    selected: String?,
    ids: List<String>,
): String? = selected?.takeIf { it in ids }

/**
 * The waiting session after [selected] in [waitingIds] (wrapping); the first when [selected] is not waiting; null when
 * none waits.
 */
fun nextWaiting(
    selected: String?,
    waitingIds: List<String>,
): String? {
    val at = waitingIds.indexOf(selected)
    return if (at < 0) waitingIds.firstOrNull() else waitingIds[(at + 1) % waitingIds.size]
}

/** How long an ask must have been shown before the detail takes an answer to it. */
const val ANSWER_DELAY_MS = 500L

/** What the detail shows for answering, and since when (the delay counts from [since]). */
data class ShownAsk(
    val sessionId: String,
    val requestId: String?,
    val since: Instant,
)

/** Keeps [before].since when session and request are the same, else starts again at [now]. */
fun shownAfter(
    before: ShownAsk?,
    sessionId: String,
    requestId: String?,
    now: Instant,
): ShownAsk =
    if (before != null && before.sessionId == sessionId && before.requestId == requestId) {
        before
    } else {
        ShownAsk(sessionId, requestId, now)
    }

/**
 * An answer to [requestId] is accepted: it is the shown one, it still waits, and ANSWER_DELAY_MS has passed since
 * [shown].since.
 */
fun acceptsAnswer(
    shown: ShownAsk?,
    requestId: String,
    stillWaiting: Set<String>,
    now: Instant,
): Boolean =
    shown != null &&
        shown.requestId == requestId &&
        requestId in stillWaiting &&
        Duration.between(shown.since, now).toMillis() >= ANSWER_DELAY_MS

/**
 * When a session came under its heading; [since] null when the IDE did not see it come (first seen, resumed). Kept per
 * heading, not per [SessionGroup]: reading a finished session (UNREAD to OTHER) keeps the time it finished.
 */
data class GroupSince(
    val group: WindowGroup,
    val since: Instant?,
)

/** Same heading → [before] unchanged; another heading → (heading, now); [before] null → (heading, null). */
fun groupSinceAfter(
    before: GroupSince?,
    group: SessionGroup,
    now: Instant,
): GroupSince {
    val heading = windowGroupOf(group)
    return when {
        before == null -> GroupSince(heading, null)
        before.group == heading -> before
        else -> GroupSince(heading, now)
    }
}
