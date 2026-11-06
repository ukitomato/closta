package dev.ukitomato.closta.platforms.intellij.settings

import dev.ukitomato.closta.core.interfaces.Secret
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

class LongTermKeysTest {
    private val marker = "MARKER-long-term-7f3a"
    private val keyId = "AKIAMARKER0000000001"

    @Test
    fun `the keys print redacted`() {
        val keys = LongTermKeys(keyId, marker)
        val edit = KeyEdit(keyId, marker)
        listOf(keys.toString(), "$keys", "${listOf(keys)}", edit.toString(), "$edit").forEach {
            assertFalse(marker in it) { it }
            assertFalse(keyId in it) { it }
        }
        assertFalse(marker in keys.toSecret().toString())
    }

    @Test
    fun `the same pair is the same, and a different key ID or secret is not`() {
        val keys = LongTermKeys(keyId, marker)
        assertTrue(keys.sameAs(LongTermKeys(keyId, marker)))
        assertFalse(keys.sameAs(LongTermKeys("AKIAMARKER0000000002", marker)))
        assertFalse(keys.sameAs(LongTermKeys(keyId, "$marker-other")))
    }

    @Test
    fun `the pair goes into one secret and comes back out`() {
        val back = LongTermKeys.fromSecret(LongTermKeys(keyId, marker).toSecret())
        assertNotNull(back)
        assertEquals(keyId, back!!.accessKeyId)
        assertEquals(marker, back.revealSecretAccessKey())
    }

    @Test
    fun `a secret that is not a stored pair reads as null`() {
        listOf(
            "not json",
            "[1,2]",
            "{}",
            """{"accessKeyId":"$keyId"}""",
            """{"accessKeyId":"","secretAccessKey":"x"}""",
            """{"accessKeyId":"$keyId","secretAccessKey":""}""",
            """{"accessKeyId":{},"secretAccessKey":"x"}""",
        ).forEach { assertNull(LongTermKeys.fromSecret(Secret(it))) { it } }
    }

    @Test
    fun `blank keys are refused`() {
        assertThrows<IllegalArgumentException> { LongTermKeys(" ", marker) }
        assertThrows<IllegalArgumentException> { LongTermKeys(keyId, "") }
    }

    @Test
    fun `an edit replaces the keys only when both fields hold something and it is not clearing`() {
        assertNull(KeyEdit().replacement())
        assertNull(KeyEdit(accessKeyId = keyId).replacement())
        assertNull(KeyEdit(secretAccessKey = marker).replacement())
        assertNull(KeyEdit(keyId, marker, clear = true).replacement())
        val replacement = KeyEdit(" $keyId ", marker).replacement()
        assertEquals(keyId, replacement!!.accessKeyId)
        assertEquals(marker, replacement.revealSecretAccessKey())
    }

    @Test
    fun `a pasted secret loses its surrounding blanks and a blank one is not a secret`() {
        assertEquals(marker, KeyEdit(keyId, " $marker\n").replacement()!!.revealSecretAccessKey())
        assertFalse(KeyEdit(keyId, "   ").complete)
    }

    @Test
    fun `an edit changes something when it is typed into or clearing`() {
        assertFalse(KeyEdit().changes)
        assertTrue(KeyEdit(secretAccessKey = marker).changes)
        assertTrue(KeyEdit(clear = true).changes)
        assertTrue(KeyEdit(keyId, marker).complete)
        assertFalse(KeyEdit(keyId, "").complete)
    }
}
