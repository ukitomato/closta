package dev.ukitomato.closta.platforms.intellij.auth

import dev.ukitomato.closta.core.interfaces.Secret
import dev.ukitomato.closta.providers.claude.auth.SessionCredentials
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class BedrockSessionSecretTest {
    private val credentials = SessionCredentials(KEY_ID, SECRET, TOKEN, EXPIRY)

    @Test
    fun `credentials go into one secret and come back the same`() {
        val back = checkNotNull(BedrockSessionSecret.fromSecret(BedrockSessionSecret.toSecret(credentials)))
        assertEquals(KEY_ID, back.accessKeyId)
        assertEquals(SECRET, back.secretAccessKey)
        assertEquals(TOKEN, back.sessionToken)
        assertEquals(EXPIRY, back.expirationEpochMillis)
    }

    @Test
    fun `the packed secret prints none of the values`() {
        val printed = BedrockSessionSecret.toSecret(credentials).toString()
        listOf(KEY_ID, SECRET, TOKEN).forEach { assertFalse(printed.contains(it)) { "leaked: $printed" } }
    }

    @Test
    fun `anything else in the entry is no credentials`() {
        listOf(
            "not json",
            "[]",
            """{"accessKeyId":"$KEY_ID","secretAccessKey":"$SECRET","sessionToken":"$TOKEN"}""",
            """{"accessKeyId":"$KEY_ID","secretAccessKey":"$SECRET","sessionToken":"$TOKEN",""" +
                """"expirationEpochMillis":"x"}""",
            """{"accessKeyId":"$KEY_ID","secretAccessKey":"$SECRET","sessionToken":"","expirationEpochMillis":1}""",
            """{"accessKeyId":7,"secretAccessKey":"$SECRET","sessionToken":"$TOKEN","expirationEpochMillis":1}""",
            """{"accessKeyId":"AKIA","secretAccessKey":"S"}""",
        ).forEach { assertNull(BedrockSessionSecret.fromSecret(Secret(it))) { "accepted: $it" } }
    }

    private companion object {
        const val KEY_ID = "ASIA-session-marker-id"
        const val SECRET = "session-marker-secret"
        const val TOKEN = "session-marker-token"
        const val EXPIRY = 1_900_000_000_000L
    }
}
