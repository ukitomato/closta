package dev.ukitomato.closta.platforms.intellij.chat

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ViewLeasesTest {
    private val changed = mutableListOf<String>()
    private val unheld = mutableListOf<String>()
    private val leases = ViewLeases(onChange = { changed += it }, onUnheld = { unheld += it })

    @Test
    fun returningTheLastLeaseTellsItOnce() {
        val a = leases.lease("s1")
        val b = leases.lease("s1")
        a.release()
        assertEquals(emptyList<String>(), unheld, "another screen still shows it")
        b.release()
        b.release()
        assertEquals(listOf("s1"), unheld)
    }

    @Test
    fun aMoveIsNeverTold() {
        val old = leases.lease("s1")
        moveChat(leases, "s1", openNew = {
            leases.lease("s1")
            true
        }, closeOld = old::release, later = { it() })
        assertEquals(emptyList<String>(), unheld, "the bridge and the new place hold it")
    }

    @Test
    fun closingTheLastViewKeepsTheSession() {
        leases.lease("s1").release()
        assertEquals(emptyList<String>(), changed, "nothing is told: the session goes on without a screen")
        assertFalse(leases.isVisible("s1"))
    }

    @Test
    fun visibleWhileAnyViewShows() {
        val a = leases.lease("s1")
        val b = leases.lease("s1")
        a.visible(true)
        b.visible(false)
        assertTrue(leases.isVisible("s1"))
        a.release()
        assertFalse(leases.isVisible("s1"))
        assertEquals(listOf("s1", "s1"), changed, "told when it came into view and when it went out")
    }

    @Test
    fun aReturnedLeaseShowsNothing() {
        val a = leases.lease("s1")
        a.release()
        a.visible(true)
        assertFalse(leases.isVisible("s1"))
        assertEquals(emptyList<String>(), changed)
    }

    @Test
    fun showingTwiceCountsOnce() {
        val a = leases.lease("s1")
        val b = leases.lease("s1")
        a.visible(true)
        a.visible(true)
        b.visible(true)
        a.visible(false)
        assertTrue(leases.isVisible("s1"))
        b.release()
        b.release()
        assertFalse(leases.isVisible("s1"))
        assertEquals(listOf("s1", "s1"), changed)
    }

    @Test
    fun sessionsAreCountedApart() {
        leases.lease("s1").visible(true)
        assertTrue(leases.isVisible("s1"))
        assertFalse(leases.isVisible("s2"))
    }
}

class ScreenInViewTest {
    @Test
    fun aScreenIsInViewOnlyInTheActiveWindow() {
        assertTrue(screenInView(showing = true, windowActive = true))
        assertFalse(screenInView(showing = true, windowActive = false))
        assertFalse(screenInView(showing = false, windowActive = true))
    }
}
