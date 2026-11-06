package dev.ukitomato.closta.platforms.intellij.chat

/**
 * Whether a session is unread after a change of its view: a turn that ended ([wasRunning], not [running]) while the
 * session was out of view makes it unread; being in view makes it read. Free of `com.intellij`.
 */
fun unreadAfter(
    wasRunning: Boolean,
    running: Boolean,
    inView: Boolean,
    unread: Boolean,
): Boolean =
    when {
        inView -> false
        wasRunning && !running -> true
        else -> unread
    }
