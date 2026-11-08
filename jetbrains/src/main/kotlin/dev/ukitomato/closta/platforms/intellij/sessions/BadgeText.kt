package dev.ukitomato.closta.platforms.intellij.sessions

private const val MOST_SHOWN = 9

/** The count to show for [waiting] sessions: nothing for none, the number up to nine, "9+" beyond. */
fun waitingBadge(waiting: Int): String? =
    when {
        waiting <= 0 -> null
        waiting > MOST_SHOWN -> "$MOST_SHOWN+"
        else -> waiting.toString()
    }
