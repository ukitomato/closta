package dev.ukitomato.closta.platforms.intellij.store

import dev.ukitomato.closta.core.interfaces.SecretStore
import kotlinx.coroutines.CancellationException

/**
 * How a provider's secrets are keyed in a [SecretStore]: from the provider's immutable [ProviderId] and a
 * [SecretSlot], and from nothing else — there is deliberately no way to derive a key from a display name, so
 * renaming a provider leaves its secrets where they are.
 *
 * Pure (no `com.intellij`), so it is measured by unit tests.
 */
object ProviderSecrets {
    /** The PasswordSafe subsystem this plugin's entries live under. Distinct from the old PoC's. */
    const val NAMESPACE = "Closta"

    /** The store key of [slot] for [provider]. */
    fun key(
        provider: ProviderId,
        slot: SecretSlot,
    ): String = "provider/${provider.value}/${slot.wire}"

    /**
     * Removes every secret [provider] may have, and nothing of any other provider. Called when it is deleted.
     *
     * Every slot is tried even when one fails, and the first failure is rethrown afterwards: PasswordSafe cannot
     * list its entries, so a slot skipped here could never be found again. A caller that sees the exception keeps
     * the provider record, so the id survives and `forget` can be retried. A store that writes in the background
     * (the OS keychain) does not report a failed removal here; the IDE logs it.
     */
    suspend fun forget(
        store: SecretStore,
        provider: ProviderId,
    ) {
        var first: Exception? = null
        SecretSlot.entries.forEach {
            try {
                store.clear(key(provider, it))
            } catch (cancel: CancellationException) {
                throw cancel
            } catch (
                @Suppress("TooGenericExceptionCaught") failure: Exception,
            ) {
                if (first == null) first = failure
            }
        }
        first?.let { throw it }
    }
}
