package dev.ukitomato.closta.platforms.intellij.session

import dev.ukitomato.closta.core.interfaces.Clock
import java.time.Instant

/** The use cases' [Clock] on the system clock — the real one the composition root supplies to the use cases. */
class SystemClock(
    private val clock: java.time.Clock = java.time.Clock.systemUTC(),
) : Clock {
    override fun now(): Instant = clock.instant()
}
