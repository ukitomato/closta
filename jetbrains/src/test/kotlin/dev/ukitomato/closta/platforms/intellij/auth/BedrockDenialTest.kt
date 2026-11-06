package dev.ukitomato.closta.platforms.intellij.auth

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class BedrockDenialTest {
    private fun kind(
        text: String,
        expiresAt: Long? = LATER,
        status: String? = "403",
    ) = BedrockDenials.classify(status, text, expiresAt, NOW)?.kind

    @Test
    fun `AWS's expired-token wording is the expiry`() {
        // The wording claude printed in anthropics/claude-code issue 2280, and Bedrock's Common Errors wording.
        assertEquals(
            BedrockDenialKind.CREDENTIALS_EXPIRED,
            kind("API Error: 403 The security token included in the request is expired"),
        )
        assertEquals(
            BedrockDenialKind.CREDENTIALS_EXPIRED,
            kind("ExpiredTokenException: The security token included in the request has expired"),
        )
    }

    @Test
    fun `an explicit deny is the policy`() {
        val text =
            "AccessDeniedException: User: arn:aws:iam::123456789012:user/someone is not authorized to perform: " +
                "bedrock:InvokeModel on resource: arn:aws:bedrock:us-east-1::foundation-model/x with an explicit " +
                "deny in an identity-based policy"
        assertEquals(BedrockDenialKind.DENIED_BY_POLICY, kind(text))
    }

    @Test
    fun `past the credentials' expiry any 403 is the expiry`() {
        assertEquals(BedrockDenialKind.CREDENTIALS_EXPIRED, kind("with an explicit deny in a policy", NOW))
        assertEquals(BedrockDenialKind.CREDENTIALS_EXPIRED, kind("Forbidden", NOW - 1))
    }

    @Test
    fun `another 403 is other`() {
        assertEquals(
            BedrockDenialKind.OTHER_FORBIDDEN,
            kind("User is not authorized to perform: bedrock:InvokeModel because no identity-based policy allows"),
        )
        assertEquals(BedrockDenialKind.OTHER_FORBIDDEN, kind("Forbidden", expiresAt = null))
    }

    @Test
    fun `what is not a 403 is not classified`() {
        assertNull(kind("The security token included in the request is expired", status = "401"))
        assertNull(kind("explicit deny", status = "500"))
        assertNull(kind("explicit deny", status = null))
    }

    @Test
    fun `the three kinds have different words`() {
        val words = BedrockDenialKind.entries.map { BedrockDenials.describe(it) }
        assertEquals(words.size, words.map { it.cause }.toSet().size)
        assertEquals(words.size, words.map { it.remedy }.toSet().size)
        assertEquals(true, BedrockDenials.describe(BedrockDenialKind.DENIED_BY_POLICY).remedy.contains("VPN"))
        assertEquals(
            true,
            BedrockDenials.describe(BedrockDenialKind.CREDENTIALS_EXPIRED).remedy.contains("Restart Session"),
        )
    }

    private companion object {
        const val NOW = 1_900_000_000_000L
        const val LATER = NOW + 3_600_000L
    }
}
