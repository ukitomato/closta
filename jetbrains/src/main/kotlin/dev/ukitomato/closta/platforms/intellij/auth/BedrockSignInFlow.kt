package dev.ukitomato.closta.platforms.intellij.auth

import dev.ukitomato.closta.core.interfaces.SecretStore
import dev.ukitomato.closta.core.interfaces.SecretStoreUnavailableException
import dev.ukitomato.closta.platforms.intellij.settings.LongTermKeys
import dev.ukitomato.closta.platforms.intellij.settings.SecretApplication
import dev.ukitomato.closta.platforms.intellij.store.ProviderId
import dev.ukitomato.closta.platforms.intellij.store.ProviderSecrets
import dev.ukitomato.closta.platforms.intellij.store.SecretSlot
import dev.ukitomato.closta.providers.claude.auth.SessionCredentials
import dev.ukitomato.closta.providers.claude.auth.SessionTokenException
import dev.ukitomato.closta.providers.claude.auth.SessionTokenRequest
import dev.ukitomato.closta.providers.claude.auth.SessionTokenResolver
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap
import kotlin.coroutines.cancellation.CancellationException

/** Who is signed in to Amazon Bedrock, and how: the non-secret settings of one provider. */
class SignInRequest(
    val providerId: ProviderId,
    val providerName: String,
    val mfaDevice: String,
    val region: String,
    val durationSeconds: Int,
) {
    override fun toString(): String = "SignInRequest(providerId=$providerId, region=$region)"
}

/** How a sign-in ended. */
sealed interface SignInOutcome {
    /** [credentials] are usable: saved ones with time left, or fresh ones. */
    class SignedIn(
        val credentials: SessionCredentials,
    ) : SignInOutcome {
        override fun toString(): String = "SignedIn(<redacted>)"
    }

    /** The person closed the prompt. */
    data object Cancelled : SignInOutcome

    /** No long-term keys are stored for the provider, so there was nothing to ask STS with. */
    data object NoLongTermKeys : SignInOutcome

    /** The password storage did not answer. [reason] is the store's own message, when it gave one. */
    data class StoreUnavailable(
        val reason: String?,
    ) : SignInOutcome

    /**
     * The provider's settings or long-term keys changed while the prompt was up (it waits for other modal dialogs,
     * such as the settings dialog), so the credentials were neither saved nor returned: they may belong to the old
     * keys. The caller plans again.
     */
    data object SettingsChanged : SignInOutcome
}

/** What one press of Sign In came to. */
sealed interface ExchangeResult {
    /** STS issued [credentials]; the prompt closes. */
    class SignedIn(
        val credentials: SessionCredentials,
    ) : ExchangeResult {
        override fun toString(): String = "SignedIn(<redacted>)"
    }

    /** The code was not sent; [message] says why. The prompt keeps what was typed. */
    data class NotSent(
        val message: String,
    ) : ExchangeResult

    /** STS refused, or was not reached; [message] says what to do. The prompt empties its field. */
    data class Refused(
        val message: String,
    ) : ExchangeResult
}

/** Asks a person for MFA codes: the Swing modal in the IDE (`MfaDialog`), a scripted fake in tests. */
fun interface MfaPrompt {
    /**
     * Asks for codes for [request] and hands each one to [exchange] until it signs in — then returns its credentials —
     * or the person gives up, which returns null. Cancelling the caller closes the prompt.
     *
     * Just before showing itself — after waiting for any other modal dialog, where the settings can change — it asks
     * [ready], off the EDT, and returns null without showing anything when [ready] says no.
     */
    suspend fun ask(
        request: SignInRequest,
        ready: suspend () -> Boolean,
        exchange: suspend (String) -> ExchangeResult,
    ): SessionCredentials?
}

/** Where the flow reports what happened. Values never reach it: ids, reasons, AWS error codes, times and types only. */
interface SignInLog {
    fun info(message: String)

    fun warn(message: String)
}

/**
 * The Amazon Bedrock sign-in of one provider: reuse the saved temporary credentials while they have
 * [SessionReuse.MARGIN_MS] left, else read the long-term keys and ask for an MFA code until STS issues new credentials,
 * then save them. One sign-in per provider at a time across the IDE; a launch that waited looks at the saved
 * credentials again, so two projects opening at once ask once.
 *
 * STS runs in [background] and is only awaited, so cancelling — the person pressing Cancel, the session closing —
 * returns at once while a request already sent finishes there (the STS client's 30-second limit) and is dropped.
 *
 * The prompt may wait for the settings dialog, where the provider can change, and a launch may wait for another one's
 * sign-in. So right after taking the lock, just before the prompt shows itself, and again before saving, the flow asks
 * the caller whether the provider's settings are still the ones it was asked with — the last two also read the
 * long-term keys again. If anything changed, nothing is shown, sent or kept, and it says so.
 *
 * Pure (no `com.intellij`): the store, STS, the prompt, the clock and the log are passed in.
 */
class BedrockSignInFlow(
    private val store: SecretStore,
    private val resolver: SessionTokenResolver,
    private val background: CoroutineScope,
    private val clock: () -> Long,
    private val log: SignInLog,
    private val io: CoroutineDispatcher = Dispatchers.IO,
) {
    // One lock per provider for the life of the flow: a few small locks at most.
    private val locks = ConcurrentHashMap<ProviderId, Mutex>()

    suspend fun signIn(
        request: SignInRequest,
        prompt: MfaPrompt,
        stillCurrent: suspend () -> Boolean,
    ): SignInOutcome =
        locks.computeIfAbsent(request.providerId) { Mutex() }.withLock {
            val id = request.providerId.value
            if (!current(request.providerId, stillCurrent)) {
                log.info("$PREFIX$id: the provider's settings changed while waiting for another sign-in")
                return@withLock SignInOutcome.SettingsChanged
            }
            saved(request.providerId)?.let {
                log.info("$PREFIX$id: saved credentials until ${until(it)}")
                return@withLock SignInOutcome.SignedIn(it)
            }
            val keys =
                when (val read = longTermKeys(request.providerId)) {
                    is KeysRead.Found -> read.keys
                    KeysRead.Missing -> {
                        log.info("$PREFIX$id: no long-term keys")
                        return@withLock SignInOutcome.NoLongTermKeys
                    }
                    is KeysRead.Unavailable -> return@withLock SignInOutcome.StoreUnavailable(read.reason)
                }
            val codes = MfaCodes()
            var changedBeforeShowing = false
            val credentials =
                prompt.ask(
                    request,
                    ready = {
                        unchanged(request.providerId, keys, stillCurrent).also { changedBeforeShowing = !it }
                    },
                ) { typed -> exchange(request, keys, codes, typed) }
            if (changedBeforeShowing) {
                log.info("$PREFIX$id: the provider's settings changed while waiting to ask; nothing was shown")
                return@withLock SignInOutcome.SettingsChanged
            }
            if (credentials == null) {
                log.info("$PREFIX$id: cancelled")
                return@withLock SignInOutcome.Cancelled
            }
            if (!unchanged(request.providerId, keys, stillCurrent)) {
                log.info("$PREFIX$id: the provider's settings changed while signing in; nothing was saved")
                return@withLock SignInOutcome.SettingsChanged
            }
            save(request.providerId, credentials)
            SignInOutcome.SignedIn(credentials)
        }

    /** Whether the caller still sees the settings the sign-in was asked with. A check that fails is a change. */
    private suspend fun current(
        id: ProviderId,
        stillCurrent: suspend () -> Boolean,
    ): Boolean =
        try {
            stillCurrent()
        } catch (cancel: CancellationException) {
            throw cancel
        } catch (
            @Suppress("TooGenericExceptionCaught") unreadable: Exception,
        ) {
            log.warn("$PREFIX${id.value}: could not read the settings again (${unreadable.javaClass.simpleName})")
            false
        }

    /** Whether the settings are still current and the stored long-term keys are still [used]. Any doubt is a change. */
    private suspend fun unchanged(
        id: ProviderId,
        used: LongTermKeys,
        stillCurrent: suspend () -> Boolean,
    ): Boolean {
        val now = if (current(id, stillCurrent)) (longTermKeys(id) as? KeysRead.Found)?.keys else null
        return now != null && now.sameAs(used)
    }

    private suspend fun saved(id: ProviderId): SessionCredentials? =
        try {
            store
                .get(ProviderSecrets.key(id, SecretSlot.BEDROCK_SESSION))
                ?.let(BedrockSessionSecret::fromSecret)
                ?.takeIf { SessionReuse.reusable(it.expirationEpochMillis, clock()) }
        } catch (cancel: CancellationException) {
            throw cancel
        } catch (
            @Suppress("TooGenericExceptionCaught") unreadable: Exception,
        ) {
            // Saved credentials that cannot be read are as good as none: the long-term keys come next.
            log.warn("$PREFIX${id.value}: could not read the saved credentials (${unreadable.javaClass.simpleName})")
            null
        }

    private suspend fun longTermKeys(id: ProviderId): KeysRead =
        try {
            store
                .get(ProviderSecrets.key(id, SecretSlot.BEDROCK_LONG_TERM))
                ?.let(LongTermKeys::fromSecret)
                ?.let { KeysRead.Found(it) } ?: KeysRead.Missing
        } catch (cancel: CancellationException) {
            throw cancel
        } catch (
            @Suppress("TooGenericExceptionCaught") unreadable: Exception,
        ) {
            log.warn("$PREFIX${id.value}: could not read the long-term keys (${unreadable.javaClass.simpleName})")
            // Only the store's own exception promises a message without secrets; anything else is reported by type.
            KeysRead.Unavailable(
                (unreadable as? SecretStoreUnavailableException)?.message?.let(SecretApplication::userReason),
            )
        }

    private suspend fun exchange(
        request: SignInRequest,
        keys: LongTermKeys,
        codes: MfaCodes,
        typed: String,
    ): ExchangeResult {
        val code =
            when (val check = codes.accept(typed)) {
                is CodeCheck.Send -> check.code
                is CodeCheck.Refused -> return ExchangeResult.NotSent(check.message)
            }
        val sts =
            SessionTokenRequest(
                tokenCode = code,
                deviceArn = request.mfaDevice,
                region = request.region,
                durationSeconds = request.durationSeconds,
                longTermAccessKeyId = keys.accessKeyId,
                longTermSecretAccessKey = keys.revealSecretAccessKey(),
            )
        val id = request.providerId.value
        return background.async(io) { resolver.resolve(sts) }.await().fold(
            onSuccess = {
                log.info("$PREFIX$id: signed in until ${until(it)}")
                ExchangeResult.SignedIn(it)
            },
            onFailure = { thrown ->
                val failure = thrown as? SessionTokenException ?: SessionTokenException(thrown.javaClass.simpleName)
                codes.remember(code, failure)
                val awsCode = failure.errorCode ?: "no code"
                log.info("$PREFIX$id: refused (${failure.reason}, $awsCode, ${failure.causeType})")
                ExchangeResult.Refused(SignInMessages.forFailure(failure))
            },
        )
    }

    private suspend fun save(
        id: ProviderId,
        credentials: SessionCredentials,
    ) {
        try {
            store.set(ProviderSecrets.key(id, SecretSlot.BEDROCK_SESSION), BedrockSessionSecret.toSecret(credentials))
        } catch (cancel: CancellationException) {
            throw cancel
        } catch (
            @Suppress("TooGenericExceptionCaught") unwritable: Exception,
        ) {
            // The credentials still serve this launch; the next one asks again.
            log.warn("$PREFIX${id.value}: could not save the credentials (${unwritable.javaClass.simpleName})")
        }
    }

    private fun until(credentials: SessionCredentials): String =
        Instant.ofEpochMilli(credentials.expirationEpochMillis).toString()

    private sealed interface KeysRead {
        class Found(
            val keys: LongTermKeys,
        ) : KeysRead

        data object Missing : KeysRead

        data class Unavailable(
            val reason: String?,
        ) : KeysRead
    }

    private companion object {
        const val PREFIX = "Bedrock sign-in for "
    }
}
