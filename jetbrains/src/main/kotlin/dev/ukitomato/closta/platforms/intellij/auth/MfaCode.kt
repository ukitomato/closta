package dev.ukitomato.closta.platforms.intellij.auth

import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.providers.claude.auth.SessionTokenException
import dev.ukitomato.closta.providers.claude.auth.StsFailureReason
import javax.swing.text.AttributeSet
import javax.swing.text.DocumentFilter
import javax.swing.text.StyleConstants

/** What [MfaCodes.accept] made of what the user typed. */
sealed interface CodeCheck {
    /** Send [code] to STS. */
    class Send(
        val code: String,
    ) : CodeCheck {
        override fun toString(): String = "Send(<redacted>)"
    }

    /** Do not send; tell the user [message]. */
    data class Refused(
        val message: String,
    ) : CodeCheck
}

/**
 * The MFA codes of one sign-in prompt. A code STS has answered for is never sent again: an MFA code works once (STS
 * rejects it the second time), so sending it would only cost the user another round trip. A code that never reached
 * AWS has not been used and may be sent again. One instance lives as long as one prompt; the next prompt remembers
 * nothing. The codes are kept in memory only and are never printed.
 */
class MfaCodes {
    private val answered = mutableSetOf<String>()

    /** Whether [typed] may be sent: six digits (STS's TokenCode), and not a code STS already answered for. */
    fun accept(typed: String): CodeCheck {
        val code = typed.trim()
        return when {
            !SIX_DIGITS.matches(code) -> CodeCheck.Refused(NOT_SIX_DIGITS)
            code in answered -> CodeCheck.Refused(ALREADY_TRIED)
            else -> CodeCheck.Send(code)
        }
    }

    /** Remembers [code] when STS answered for it (see [answeredByAws]). */
    fun remember(
        code: String,
        failure: SessionTokenException,
    ) {
        if (answeredByAws(failure)) answered += code
    }

    override fun toString(): String = "MfaCodes(answered=${answered.size})"

    companion object {
        private val SIX_DIGITS = Regex("\\d{6}")
        private val UP_TO_SIX_DIGITS = Regex("[0-9]{0,6}")
        private const val FULL_WIDTH_ZERO = '\uFF10'
        private const val FULL_WIDTH_NINE = '\uFF19'

        /**
         * What the code field holds once [inserted] replaces [length] characters of [current] at [offset], or null
         * when it would not be up to six digits. A paste loses the spaces around it; full-width digits are digits.
         */
        fun typed(
            current: String,
            offset: Int,
            length: Int,
            inserted: String,
        ): String? {
            val digits =
                inserted.trim().map { if (it in FULL_WIDTH_ZERO..FULL_WIDTH_NINE) '0' + (it - FULL_WIDTH_ZERO) else it }
            val result = current.replaceRange(offset, offset + length, digits.joinToString(""))
            return result.takeIf { UP_TO_SIX_DIGITS.matches(it) }
        }

        val NOT_SIX_DIGITS: String get() = ClostaBundle.message("auth.mfa.notSixDigits")
        val ALREADY_TRIED: String get() = ClostaBundle.message("auth.mfa.alreadyTried")

        /**
         * Whether AWS answered the request — then it has seen the code — rather than never being reached. A clock
         * error counts as answered: setting the clock right takes longer than a code lives.
         */
        fun answeredByAws(failure: SessionTokenException): Boolean =
            when (failure.reason) {
                StsFailureReason.UNREACHABLE -> false
                StsFailureReason.OTHER -> failure.errorCode != null
                else -> true
            }
    }
}

/**
 * The MFA code field's filter: up to six digits as they are typed or pasted (see [MfaCodes.typed]). Text an input
 * method is still composing passes as it is — the input method counts on it being there — and is checked when it is
 * committed.
 */
object SixDigitsFilter : DocumentFilter() {
    override fun insertString(
        fb: FilterBypass,
        offset: Int,
        string: String?,
        attr: AttributeSet?,
    ) = replace(fb, offset, 0, string, attr)

    override fun replace(
        fb: FilterBypass,
        offset: Int,
        length: Int,
        text: String?,
        attrs: AttributeSet?,
    ) {
        if (attrs?.isDefined(StyleConstants.ComposedTextAttribute) ==
            true
        ) {
            return fb.replace(offset, length, text, attrs)
        }
        val current = fb.document.getText(0, fb.document.length)
        val result = MfaCodes.typed(current, offset, length, text.orEmpty()) ?: return
        val insertedLength = result.length - (current.length - length)
        fb.replace(offset, length, result.substring(offset, offset + insertedLength), attrs)
    }
}

/** What the sign-in prompt says when STS refused, by [StsFailureReason]. */
object SignInMessages {
    fun forFailure(failure: SessionTokenException): String {
        val settings = ClostaBundle.message("auth.settingsPath")
        return when (failure.reason) {
            StsFailureReason.MFA_CODE_REJECTED -> ClostaBundle.message("auth.signIn.mfaCodeRejected", settings)
            StsFailureReason.LONG_TERM_KEY_REJECTED -> ClostaBundle.message("auth.signIn.longTermKeyRejected", settings)
            StsFailureReason.REGION_DISABLED -> ClostaBundle.message("auth.signIn.regionDisabled", settings)
            StsFailureReason.UNREACHABLE -> ClostaBundle.message("auth.signIn.unreachable")
            StsFailureReason.CLOCK_SKEW -> ClostaBundle.message("auth.signIn.clockSkew")
            StsFailureReason.OTHER ->
                failure.errorCode?.let { ClostaBundle.message("auth.signIn.otherWithCode", it) }
                    ?: ClostaBundle.message("auth.signIn.other")
        }
    }
}
