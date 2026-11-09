package dev.ukitomato.closta.core.interfaces

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

class SecretTest {
    private val canary = "canary-7f3e9a1c-secret-value"

    @Test
    fun `toString does not contain the value`() {
        val rendered = Secret(canary).toString()
        assertFalse(rendered.contains(canary)) { "value leaked through toString: $rendered" }
    }

    @Test
    fun `a string template does not contain the value`() {
        val secret = Secret(canary)
        val line = "resolved credentials: $secret"
        assertFalse(line.contains(canary)) { "value leaked through a template: $line" }
    }

    @Test
    fun `an exception message built from the secret does not contain the value`() {
        val secret = Secret(canary)
        val failure = IllegalStateException("could not store $secret")
        assertFalse(failure.message.orEmpty().contains(canary)) { "value leaked into a message: ${failure.message}" }
        assertFalse(failure.stackTraceToString().contains(canary)) { "value leaked into a stack trace" }
    }

    @Test
    fun `reveal hands back the value`() {
        assertEquals(canary, Secret(canary).reveal())
    }

    @Test
    fun `an empty value is rejected without echoing anything`() {
        val failure = assertThrows<IllegalArgumentException> { Secret("") }
        assertEquals("a secret must not be empty", failure.message)
    }

    @Test
    fun `two secrets with the same value are not equal`() {
        assertNotEquals(Secret(canary), Secret(canary))
    }

    @Test
    fun `the unavailable exception carries only its message`() {
        val failure = SecretStoreUnavailableException("the OS keychain denied access")
        assertEquals("the OS keychain denied access", failure.message)
        assertEquals(null, failure.cause)
    }
}
