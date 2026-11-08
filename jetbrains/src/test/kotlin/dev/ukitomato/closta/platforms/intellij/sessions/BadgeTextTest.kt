package dev.ukitomato.closta.platforms.intellij.sessions

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class BadgeTextTest {
    @Test fun noBadgeWhileNothingWaits() = assertNull(waitingBadge(0))

    @Test fun negativeIsNoBadge() = assertNull(waitingBadge(-1))

    @Test fun theCountUpToNine() = assertEquals("3", waitingBadge(3))

    @Test fun nineIsNine() = assertEquals("9", waitingBadge(9))

    @Test fun moreThanNineIsNinePlus() = assertEquals("9+", waitingBadge(12))
}
