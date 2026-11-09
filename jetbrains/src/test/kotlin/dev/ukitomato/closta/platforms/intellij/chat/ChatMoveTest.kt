package dev.ukitomato.closta.platforms.intellij.chat

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ChatMoveTest {
    private val leases = ViewLeases()
    private val later = mutableListOf<() -> Unit>()

    @Test
    fun theBridgeNeverCountsAsInView() {
        val old = leases.lease("s1").also { it.visible(true) }
        moveChat(leases, "s1", openNew = { true }, closeOld = { old.release() }, later = { later.add(it) })
        assertFalse(leases.isVisible("s1"), "the new tab has not shown yet, and the bridge shows nothing")
        val newPlace = leases.lease("s1").also { it.visible(true) }
        later.forEach { it() }
        assertTrue(leases.isVisible("s1"))
        newPlace.release()
        assertFalse(leases.isVisible("s1"))
    }

    @Test
    fun aPlaceThatDoesNotOpenKeepsTheOldOne() {
        leases.lease("s1").visible(true)
        var closed = false
        assertFalse(moveChat(leases, "s1", openNew = { false }, closeOld = { closed = true }, later = { it() }))
        assertFalse(closed)
        assertTrue(leases.isVisible("s1"))
    }

    @Test
    fun aMoveThatOpensClosesTheOldPlace() {
        val old = leases.lease("s1")
        var closed = false
        assertTrue(
            moveChat(leases, "s1", openNew = {
                leases.lease("s1")
                true
            }, closeOld = {
                closed = true
                old.release()
            }, later = { it() }),
        )
        assertEquals(true, closed)
    }
}
