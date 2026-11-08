package dev.ukitomato.closta.platforms.intellij.thread

/** What the jump to the end of the conversation says: the latest, or that a card waits for an answer down there. */
enum class JumpLabel { LATEST, WAITING }

/** The jump's label: [JumpLabel.WAITING] when a card that waits for an answer is below the view. */
fun jumpLabel(waitingBelow: Boolean): JumpLabel = if (waitingBelow) JumpLabel.WAITING else JumpLabel.LATEST

/** Whether a waiting card starts below the view: one of [cardTops] (in the column) is past [viewBottom]. */
fun waitingBelow(
    cardTops: List<Int>,
    viewBottom: Int,
): Boolean = cardTops.any { it >= viewBottom }

/**
 * How many of the cards occupying [spans] (top to bottom, in the column) are outside the view: entirely above
 * [viewTop] or entirely past [viewBottom]. A card with any part in sight is on screen, though its top is not.
 */
fun waitingOffScreen(
    spans: List<IntRange>,
    viewTop: Int,
    viewBottom: Int,
): Int = spans.count { it.last <= viewTop || it.first >= viewBottom }
