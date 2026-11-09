package dev.ukitomato.closta.platforms.intellij.store

import com.intellij.credentialStore.ACCESS_TO_KEY_CHAIN_DENIED
import com.intellij.credentialStore.CANNOT_UNLOCK_KEYCHAIN
import com.intellij.credentialStore.CredentialAttributes
import com.intellij.credentialStore.Credentials
import com.intellij.credentialStore.generateServiceName
import com.intellij.ide.passwordSafe.PasswordSafe
import com.intellij.openapi.components.Service
import dev.ukitomato.closta.core.interfaces.Secret
import dev.ukitomato.closta.core.interfaces.SecretStore
import dev.ukitomato.closta.core.interfaces.SecretStoreUnavailableException
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * [SecretStore] on the IDE's PasswordSafe — the OS keychain or the IDE's encrypted store, never a plain settings
 * file.
 *
 * PasswordSafe reads and writes go down to the keychain and can block; the IDE reports such a call on the EDT or
 * inside a read action as a prohibited slow operation. Every call is therefore made on [Dispatchers.IO], which
 * holds neither. PasswordSafe is reached inline inside each `withContext` so that is visible where it is called.
 *
 * Only the password field carries the value: the IDE's `Credentials.toString` prints the user name. A denied or
 * locked keychain comes back as one of the IDE's marker credentials, which is a failure, not "not stored".
 *
 * What reaches this class depends on where PasswordSafe keeps its entries. KeePass and the memory store work in
 * the caller's thread, so their failures surface here. For the OS keychain, PasswordSafe keeps the value in memory,
 * queues the write, and logs a failed write itself; it also answers a failed read with null. Such failures never
 * reach this class.
 *
 * A light application service: registered by the annotation, not in plugin.xml.
 */
@Service(Service.Level.APP)
class PasswordSafeSecretStore : SecretStore {
    override suspend fun get(key: String): Secret? {
        val attributes = attributes(key)
        val credentials =
            withContext(Dispatchers.IO) { guarded("read") { PasswordSafe.instance.get(attributes) } } ?: return null
        if (credentials === ACCESS_TO_KEY_CHAIN_DENIED) {
            throw SecretStoreUnavailableException(ClostaBundle.message("settings.store.keychainDenied"))
        }
        if (credentials === CANNOT_UNLOCK_KEYCHAIN) {
            throw SecretStoreUnavailableException(ClostaBundle.message("settings.store.keychainLocked"))
        }
        val value = credentials.getPasswordAsString()
        return if (value.isNullOrEmpty()) null else Secret(value)
    }

    override suspend fun set(
        key: String,
        value: Secret,
    ) {
        val attributes = attributes(key)
        withContext(Dispatchers.IO) {
            guarded("write") { PasswordSafe.instance.set(attributes, Credentials(null, value.reveal())) }
        }
    }

    override suspend fun clear(key: String) {
        val attributes = attributes(key)
        withContext(Dispatchers.IO) { guarded("clear") { PasswordSafe.instance.set(attributes, null) } }
    }

    private fun attributes(key: String): CredentialAttributes {
        require(key.isNotBlank()) { "a secret key must not be blank" }
        return CredentialAttributes(generateServiceName(ProviderSecrets.NAMESPACE, key))
    }

    // A platform failure is reported by its type only and not chained: its message is not ours to vouch for, and a
    // chained cause would carry it into every log line that prints the stack.
    private inline fun <T> guarded(
        operation: String,
        block: () -> T,
    ): T =
        try {
            block()
        } catch (cancel: CancellationException) {
            throw cancel
        } catch (
            @Suppress("TooGenericExceptionCaught", "SwallowedException") failure: Exception,
        ) {
            throw SecretStoreUnavailableException(
                ClostaBundle.message("settings.store.failed.$operation", failure.javaClass.name),
            )
        }
}
