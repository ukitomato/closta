package dev.ukitomato.closta.platforms.intellij.settings

import com.intellij.ide.passwordSafe.PasswordSafe
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.Logger
import dev.ukitomato.closta.core.interfaces.SecretStore
import dev.ukitomato.closta.core.interfaces.SettingsStore
import dev.ukitomato.closta.platforms.intellij.auth.BedrockSignInService
import dev.ukitomato.closta.platforms.intellij.auth.StoredSession
import dev.ukitomato.closta.platforms.intellij.store.AppSettingsStore
import dev.ukitomato.closta.platforms.intellij.store.PasswordSafeSecretStore
import dev.ukitomato.closta.platforms.intellij.store.ProviderId
import dev.ukitomato.closta.platforms.intellij.store.ProviderSecrets
import dev.ukitomato.closta.platforms.intellij.store.SecretSlot
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import java.util.concurrent.atomic.AtomicBoolean

/**
 * The providers as the IDE keeps them: records in the application settings ([AppSettingsStore]) and the
 * long-term keys in PasswordSafe ([PasswordSafeSecretStore]). The settings screen reads and writes through
 * this service, and the launch of the next claude process asks it for the active provider ([activeLaunch]).
 *
 * Logs carry provider ids and exception types only — never names, ARNs or values.
 * A light application service: registered by the annotation, not in plugin.xml.
 */
@Service(Service.Level.APP)
class ProviderSettings(
    private val scope: CoroutineScope,
) {
    private val warnedUnreadable = AtomicBoolean(false)

    /** The saved providers and the active one. Unreadable records are skipped, with one WARN per IDE run. */
    fun load(): ProviderRecords.Decoded {
        val decoded = ProviderRecords.load(settings())
        if (decoded.skipped > 0 && warnedUnreadable.compareAndSet(false, true)) {
            LOG.warn(
                "Closta providers: skipped ${decoded.skipped} unreadable provider record(s) in the settings; " +
                    "a save keeps them as they are",
            )
        }
        return decoded
    }

    /** Saves the providers and the active one; null restores the default Anthropic. Unreadable records stay. */
    fun save(
        records: List<ProviderRecord>,
        active: ProviderId?,
    ) = ProviderRecords.save(settings(), records, active)

    /** Writes, clears and forgets the secrets [plan] asks for. Suspends on PasswordSafe; never call it on the EDT. */
    suspend fun applySecrets(plan: ApplyPlan): SecretOutcome =
        SecretApplication.apply(plan, secrets()).also { outcome ->
            outcome.failures.forEach {
                LOG.warn(
                    "Closta providers: could not ${it.action.phrase} of ${it.providerId.value} (${it.errorType})",
                )
            }
        }

    /** Whether long-term keys are stored for [id]; null when the store cannot tell (a denied or locked keychain). */
    suspend fun hasLongTermKeys(id: ProviderId): Boolean? =
        try {
            secrets().get(ProviderSecrets.key(id, SecretSlot.BEDROCK_LONG_TERM)) != null
        } catch (cancel: CancellationException) {
            throw cancel
        } catch (
            @Suppress("TooGenericExceptionCaught") unavailable: Exception,
        ) {
            val type = unavailable.javaClass.simpleName
            LOG.warn("Closta providers: could not read the keys of ${id.value} ($type)")
            null
        }

    /**
     * Whether PasswordSafe keeps secrets in memory only, lost when the IDE exits. PasswordSafe settles on its store at
     * its first use and reports the configured one before that, so this reads a key no provider has first.
     * Suspends on PasswordSafe; never call it on the EDT.
     */
    suspend fun isMemoryOnly(): Boolean {
        try {
            secrets().get(ProviderSecrets.key(NO_PROVIDER, SecretSlot.BEDROCK_LONG_TERM))
        } catch (cancel: CancellationException) {
            throw cancel
        } catch (
            @Suppress("TooGenericExceptionCaught", "SwallowedException") unavailable: Exception,
        ) {
            // A store that cannot be read still reports what it is; the answer below is all this needs.
        }
        return PasswordSafe.instance.isMemoryOnly
    }

    /** What is stored for [id]'s temporary credentials. Suspends on PasswordSafe; never call it on the EDT. */
    suspend fun storedSession(id: ProviderId): StoredSession = service<BedrockSignInService>().storedSession(id)

    /** What the active provider means for the next claude process. */
    fun activeLaunch(): ProviderLaunch = launchFor(ProviderPick.Active)

    /** Runs [block] in this service's scope; the caller cancels the returned job when it no longer wants the result. */
    fun query(block: suspend () -> Unit): Job = scope.launch { block() }

    private fun settings(): SettingsStore = service<AppSettingsStore>()

    private fun secrets(): SecretStore = service<PasswordSafeSecretStore>()

    companion object {
        /** The default provider's name: the `claude` command's own sign-in (any Claude plan). */
        const val DEFAULT_NAME = "Anthropic"

        val LOG = Logger.getInstance(ProviderSettings::class.java)

        /** The nil UUID: a generated provider id (random, version 4) is never it. */
        val NO_PROVIDER = checkNotNull(ProviderId.parse("00000000-0000-0000-0000-000000000000"))
    }
}
