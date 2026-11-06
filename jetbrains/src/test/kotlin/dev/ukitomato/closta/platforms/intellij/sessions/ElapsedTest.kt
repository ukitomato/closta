package dev.ukitomato.closta.platforms.intellij.sessions

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.time.Duration

class ElapsedTest {
    @Test
    fun underAMinuteIsNow() {
        assertEquals("now", elapsedText(Duration.ZERO))
        assertEquals("now", elapsedText(Duration.ofSeconds(59)))
        assertEquals("now", elapsedText(Duration.ofSeconds(-5)))
    }

    @Test
    fun underAnHourCountsWholeMinutes() {
        assertEquals("1 min", elapsedText(Duration.ofSeconds(60)))
        assertEquals("12 min", elapsedText(Duration.ofMinutes(12).plusSeconds(59)))
        assertEquals("59 min", elapsedText(Duration.ofMinutes(59).plusSeconds(59)))
    }

    @Test
    fun anHourOrMoreCountsWholeHours() {
        assertEquals("1 h", elapsedText(Duration.ofHours(1)))
        assertEquals("25 h", elapsedText(Duration.ofHours(25).plusMinutes(59)))
    }
}
