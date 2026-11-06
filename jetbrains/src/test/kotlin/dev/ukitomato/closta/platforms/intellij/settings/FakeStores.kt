package dev.ukitomato.closta.platforms.intellij.settings

import dev.ukitomato.closta.core.interfaces.Secret
import dev.ukitomato.closta.core.interfaces.SecretStore
import dev.ukitomato.closta.core.interfaces.SecretStoreUnavailableException
import dev.ukitomato.closta.core.interfaces.SettingsStore

/** A [SecretStore] in memory that throws for the keys in [failSet] and [failClear], as a denied keychain would. */
class FakeSecretStore : SecretStore {
    val entries = mutableMapOf<String, Secret>()
    val failSet = mutableSetOf<String>()
    val failClear = mutableSetOf<String>()
    val cleared = mutableListOf<String>()

    override suspend fun get(key: String): Secret? = entries[key]

    override suspend fun set(
        key: String,
        value: Secret,
    ) {
        if (key in failSet) throw SecretStoreUnavailableException("set refused for $key")
        entries[key] = value
    }

    override suspend fun clear(key: String) {
        cleared += key
        if (key in failClear) throw SecretStoreUnavailableException("clear refused for $key")
        entries.remove(key)
    }
}

/** A [SettingsStore] in memory. */
class FakeSettingsStore : SettingsStore {
    val entries = mutableMapOf<String, String>()

    override fun get(key: String): String? = entries[key]

    override fun set(
        key: String,
        value: String,
    ) {
        entries[key] = value
    }

    override fun clear(key: String) {
        entries.remove(key)
    }
}
