package dev.ukitomato.closta.platforms.intellij.auth

import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/** When saved temporary credentials are reused instead of asking for an MFA code. */
object SessionReuse {
    /**
     * Fifteen minutes, the shortest session STS issues (900 seconds): a session started on saved credentials keeps at
     * least as long as one started on fresh credentials of the shortest kind.
     */
    const val MARGIN_MS = 900_000L

    /** Whether credentials that expire at [expirationEpochMillis] are reused at [nowMs]. */
    fun reusable(
        expirationEpochMillis: Long,
        nowMs: Long,
    ): Boolean = nowMs < expirationEpochMillis - MARGIN_MS
}

/** What the store holds for a provider's temporary credentials, as far as the settings screen needs to know. */
sealed interface StoredSession {
    /** Nothing usable is stored. */
    data object None : StoredSession

    /** The store did not answer (a denied or locked keychain). */
    data object Unknown : StoredSession

    /** Credentials are stored and stop working at [epochMillis]. */
    data class Expires(
        val epochMillis: Long,
    ) : StoredSession
}

/** The settings screen's line about a provider's temporary credentials. No value, only the time they stop working. */
object CredentialsStatus {
    private val TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")

    // Each line is short enough for one line in the settings page's right column, which is sized when the dialog opens.
    fun describe(
        stored: StoredSession,
        nowMs: Long,
        zone: ZoneId,
    ): String =
        when (stored) {
            StoredSession.None -> ClostaBundle.message("auth.credentials.none")
            StoredSession.Unknown -> ClostaBundle.message("auth.credentials.unknown")
            is StoredSession.Expires -> {
                val time = TIME.format(Instant.ofEpochMilli(stored.epochMillis).atZone(zone))
                when {
                    SessionReuse.reusable(stored.epochMillis, nowMs) ->
                        ClostaBundle.message("auth.credentials.validUntil", time)
                    nowMs < stored.epochMillis -> ClostaBundle.message("auth.credentials.expiresAt", time)
                    else -> ClostaBundle.message("auth.credentials.expiredAt", time)
                }
            }
        }
}
