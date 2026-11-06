package dev.ukitomato.closta.platforms.intellij.sessions

import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import java.time.Duration

// How long a session has been in its group, in words. Free of `com.intellij`, so the fast tests run it.

/** "now" under a minute, "N min" under an hour, else "N h" (whole units, rounded down). */
fun elapsedText(elapsed: Duration): String =
    when {
        elapsed < Duration.ofMinutes(1) -> ClostaBundle.message("sessions.window.elapsed.now")
        elapsed < Duration.ofHours(1) -> ClostaBundle.message("sessions.window.elapsed.minutes", elapsed.toMinutes())
        else -> ClostaBundle.message("sessions.window.elapsed.hours", elapsed.toHours())
    }
