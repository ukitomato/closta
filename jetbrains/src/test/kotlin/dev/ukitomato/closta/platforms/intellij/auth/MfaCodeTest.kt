package dev.ukitomato.closta.platforms.intellij.auth

import dev.ukitomato.closta.providers.claude.auth.SessionTokenException
import dev.ukitomato.closta.providers.claude.auth.StsFailureReason
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import javax.swing.JTextField
import javax.swing.text.AbstractDocument
import javax.swing.text.SimpleAttributeSet
import javax.swing.text.StyleConstants

class MfaCodeTest {
    private fun failure(
        reason: StsFailureReason,
        code: String? = null,
    ) = SessionTokenException("StsException", reason, code)

    @Test
    fun `only six digits are sent, without the spaces around them`() {
        val codes = MfaCodes()
        listOf("12345", "1234567", "12a456", "", "12 456").forEach {
            assertEquals(CodeCheck.Refused(MfaCodes.NOT_SIX_DIGITS), codes.accept(it)) { "accepted '$it'" }
        }
        assertEquals("123456", (codes.accept("  123456 ") as CodeCheck.Send).code)
    }

    @Test
    fun `the code field takes up to six digits, and a paste without the spaces around it`() {
        assertEquals("123456", MfaCodes.typed("", 0, 0, "123456"))
        assertEquals("123456", MfaCodes.typed("", 0, 0, " 123456\n"))
        assertEquals("123412", MfaCodes.typed("1234", 4, 0, "12"))
        assertEquals("1294", MfaCodes.typed("1234", 2, 1, "9"))
        assertEquals("12", MfaCodes.typed("1234", 2, 2, ""))
        // An input method left on full width types full-width digits; they are the same digits.
        assertEquals("123456", MfaCodes.typed("", 0, 0, "１２３４５６"))
        listOf("12345a", "1234567", "12 456", "１２３４５６７").forEach {
            assertEquals(null, MfaCodes.typed("", 0, 0, it)) { "took '$it'" }
        }
        assertEquals(null, MfaCodes.typed("123456", 6, 0, "1"))
        assertEquals("12", MfaCodes.typed("12", 2, 0, " "))
    }

    @Test
    fun `the code field lets an input method compose, and keeps only digits once it commits`() {
        val field = JTextField().apply { (document as AbstractDocument).documentFilter = SixDigitsFilter }
        field.document.insertString(0, "12345", null)
        val composing = SimpleAttributeSet().apply { addAttribute(StyleConstants.ComposedTextAttribute, "x") }
        field.document.insertString(5, "６７", composing)
        assertEquals("12345６７", field.text)
        field.document.remove(5, 2)
        field.document.insertString(5, "６７", null)
        assertEquals("12345", field.text)
        field.document.insertString(5, "６", null)
        assertEquals("123456", field.text)
    }

    @Test
    fun `a code STS answered for is not sent again`() {
        val codes = MfaCodes()
        codes.remember("914273", failure(StsFailureReason.MFA_CODE_REJECTED, "AccessDenied"))
        assertEquals(CodeCheck.Refused(MfaCodes.ALREADY_TRIED), codes.accept("914273"))
        assertTrue(codes.accept("914274") is CodeCheck.Send)
    }

    @Test
    fun `a code that never reached AWS may be sent again`() {
        val codes = MfaCodes()
        codes.remember("914273", failure(StsFailureReason.UNREACHABLE))
        codes.remember("914275", failure(StsFailureReason.OTHER))
        assertTrue(codes.accept("914273") is CodeCheck.Send)
        assertTrue(codes.accept("914275") is CodeCheck.Send)
    }

    @Test
    fun `any answer from AWS counts as having seen the code`() {
        listOf(
            failure(StsFailureReason.MFA_CODE_REJECTED, "AccessDenied"),
            failure(StsFailureReason.LONG_TERM_KEY_REJECTED, "InvalidClientTokenId"),
            failure(StsFailureReason.REGION_DISABLED, "RegionDisabledException"),
            failure(StsFailureReason.CLOCK_SKEW, "SignatureDoesNotMatch"),
            failure(StsFailureReason.OTHER, "Throttling"),
        ).forEach { assertTrue(MfaCodes.answeredByAws(it)) { "${it.reason}" } }
    }

    @Test
    fun `the codes are not printed`() {
        val codes = MfaCodes()
        codes.remember("914273", failure(StsFailureReason.MFA_CODE_REJECTED, "AccessDenied"))
        assertFalse(codes.toString().contains("914273"))
        assertFalse(codes.accept("914276").toString().contains("914276"))
    }

    @Test
    fun `each reason has its own words, and other carries the code`() {
        val messages =
            listOf(
                failure(StsFailureReason.MFA_CODE_REJECTED, "AccessDenied"),
                failure(StsFailureReason.LONG_TERM_KEY_REJECTED, "SignatureDoesNotMatch"),
                failure(StsFailureReason.REGION_DISABLED, "RegionDisabledException"),
                failure(StsFailureReason.UNREACHABLE),
                failure(StsFailureReason.OTHER, "Throttling"),
                failure(StsFailureReason.OTHER),
                failure(StsFailureReason.CLOCK_SKEW, "SignatureDoesNotMatch"),
            ).map(SignInMessages::forFailure)
        assertEquals(messages.size, messages.toSet().size)
        messages.forEach { assertTrue(it.isNotBlank()) }
        assertTrue(messages[0].contains("MFA code"))
        assertTrue(messages[1].contains("access key"))
        assertTrue(messages[3].contains("network"))
        assertTrue(messages[4].contains("(Throttling)"))
        assertTrue(messages[6].contains("clock"))
        // STS needs no VPN (the user, 2026-10-01): naming one would send people looking in the wrong place.
        messages.forEach { assertFalse(it.contains("VPN")) { it } }
    }
}
