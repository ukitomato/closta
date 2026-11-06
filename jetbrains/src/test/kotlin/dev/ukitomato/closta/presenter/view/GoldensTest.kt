package dev.ukitomato.closta.presenter.view

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.opentest4j.AssertionFailedError

class GoldensTest {
    private val written = mutableMapOf<String, String>()

    private fun goldens(
        update: Boolean,
        stored: String?,
    ) = Goldens(update, { stored }, { name, text -> written[name] = text })

    @Test
    fun `a rewrite fails after writing, and an unchanged golden is left alone`() {
        val failure = assertThrows<AssertionFailedError> { goldens(update = true, stored = "old").check("01", "new") }
        assertEquals(mapOf("01" to "new"), written)
        assertTrue("rewrote" in failure.message!!, failure.message)
        written.clear()
        goldens(update = true, stored = "same").check("01", "same")
        assertEquals(emptyMap<String, String>(), written)
    }

    @Test
    fun `a drift and a missing golden say how to regenerate`() {
        val drift = assertThrows<AssertionFailedError> { goldens(update = false, stored = "old").check("01", "new") }
        assertTrue(Goldens.ENV in drift.message!!, drift.message)
        val missing = assertThrows<AssertionFailedError> { goldens(update = false, stored = null).check("01", "new") }
        assertTrue(Goldens.ENV in missing.message!!, missing.message)
        goldens(update = false, stored = "same").check("01", "same")
        assertEquals(emptyMap<String, String>(), written)
    }
}
