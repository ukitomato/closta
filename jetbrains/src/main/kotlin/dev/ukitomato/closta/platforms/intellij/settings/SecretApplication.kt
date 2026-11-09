package dev.ukitomato.closta.platforms.intellij.settings

import dev.ukitomato.closta.core.interfaces.SecretStore
import dev.ukitomato.closta.core.interfaces.SecretStoreUnavailableException
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.platforms.intellij.store.ProviderId
import dev.ukitomato.closta.platforms.intellij.store.ProviderSecrets
import dev.ukitomato.closta.platforms.intellij.store.SecretSlot
import kotlinx.coroutines.CancellationException

/** The secret operations Apply carries out; [phrase] is how a log line names one. */
enum class SecretAction(
    val phrase: String,
    internal val key: String,
) {
    STORE_KEYS("store the long-term keys", "storeKeys"),
    CLEAR_KEYS("remove the stored keys", "clearKeys"),
    FORGET("forget the secrets", "forget"),
}

/**
 * A secret operation that failed: which provider, what was being done, and the failure's type (for the log). [reason]
 * is the message of a [SecretStoreUnavailableException] only — the one failure whose message the store promises holds
 * no secret — without the class name the store may append to it.
 */
data class SecretFailure(
    val providerId: ProviderId,
    val action: SecretAction,
    val errorType: String,
    val reason: String? = null,
)

/** What applying the secret side of a plan came to. [failedForget]: providers whose secrets were not forgotten. */
class SecretOutcome(
    val failedForget: Set<ProviderId>,
    val failures: List<SecretFailure>,
)

/**
 * Carries out the secret side of an [ApplyPlan] against a [SecretStore]: writes the new long-term keys, clears the
 * ones asked for — each after forgetting the provider's temporary credentials — and forgets removed providers
 * and providers no longer on Bedrock ([ProviderSecrets.forget], every slot). A failure is recorded and the
 * rest still runs — skipping a provider whose entry could not be cleared would leave it for good.
 */
object SecretApplication {
    suspend fun apply(
        plan: ApplyPlan,
        store: SecretStore,
    ): SecretOutcome {
        val failures = mutableListOf<SecretFailure>()
        val failedForget = mutableSetOf<ProviderId>()
        // The temporary credentials go first: they were issued for the keys being replaced or removed, maybe
        // of another IAM user, and a failure to forget them leaves the keys as they were rather than pairing new keys
        // with old credentials.
        plan.keysToWrite.forEach { (id, keys) ->
            attempt(id, SecretAction.STORE_KEYS, failures) {
                store.clear(sessionKey(id))
                store.set(longTermKey(id), keys.toSecret())
            }
        }
        plan.keysToClear.forEach { id ->
            attempt(id, SecretAction.CLEAR_KEYS, failures) {
                store.clear(sessionKey(id))
                store.clear(longTermKey(id))
            }
        }
        plan.providersToForget.forEach { id ->
            if (!attempt(id, SecretAction.FORGET, failures) { ProviderSecrets.forget(store, id) }) failedForget += id
        }
        return SecretOutcome(failedForget, failures)
    }

    /**
     * What Apply tells the user when secrets could not be applied: for each failure, whose and what, the reason when
     * the store gave one, and what to do next — Apply has already saved the rest, so the input it lost must be entered
     * again. No value and no class name appear in it.
     */
    fun failureReport(
        plan: ApplyPlan,
        outcome: SecretOutcome,
    ): List<String> {
        val names = (plan.records + plan.removed).associate { it.id to it.name }
        val removed = plan.removed.mapTo(mutableSetOf()) { it.id }
        val lines =
            outcome.failures.map {
                val name = names[it.providerId] ?: ClostaBundle.message("settings.secrets.aProvider")
                val reason = it.reason?.let { why -> ClostaBundle.message("settings.secrets.reason", why) }.orEmpty()
                ClostaBundle.message(
                    "settings.secrets.failed.${it.action.key}",
                    name,
                    reason,
                    nextStep(it, it.providerId in removed),
                )
            }
        return lines + ClostaBundle.message("settings.secrets.checkStorage")
    }

    private fun nextStep(
        failure: SecretFailure,
        wasRemoved: Boolean,
    ): String =
        when (failure.action) {
            SecretAction.STORE_KEYS -> ClostaBundle.message("settings.secrets.next.storeKeys")
            SecretAction.CLEAR_KEYS -> ClostaBundle.message("settings.secrets.next.clearKeys")
            SecretAction.FORGET ->
                if (wasRemoved) {
                    ClostaBundle.message("settings.secrets.next.forgetRemoved")
                } else {
                    ClostaBundle.message("settings.secrets.next.forgetKind")
                }
        }

    /** A reason fit for the user: the class name the store appends in parentheses is dropped. */
    fun userReason(message: String): String = message.replace(TRAILING_CLASS_NAME, "").trim()

    private fun longTermKey(id: ProviderId): String = ProviderSecrets.key(id, SecretSlot.BEDROCK_LONG_TERM)

    private fun sessionKey(id: ProviderId): String = ProviderSecrets.key(id, SecretSlot.BEDROCK_SESSION)

    // A store failure is reported by its type; only SecretStoreUnavailableException's message, which the store promises
    // holds no secret, is passed on. Any other message is not ours to vouch for.
    private suspend fun attempt(
        id: ProviderId,
        action: SecretAction,
        failures: MutableList<SecretFailure>,
        block: suspend () -> Unit,
    ): Boolean =
        try {
            block()
            true
        } catch (cancel: CancellationException) {
            throw cancel
        } catch (
            @Suppress("TooGenericExceptionCaught") failure: Exception,
        ) {
            val reason = (failure as? SecretStoreUnavailableException)?.message?.let(::userReason)
            failures += SecretFailure(id, action, failure.javaClass.simpleName, reason)
            false
        }

    private val TRAILING_CLASS_NAME = Regex("""\s*\((?:[A-Za-z_$][\w$]*\.)+[A-Za-z_$][\w$]*\)\s*$""")
}
