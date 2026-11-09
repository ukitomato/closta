package dev.ukitomato.closta.platforms.intellij.store

import com.intellij.openapi.components.RoamingType
import com.intellij.openapi.components.SerializablePersistentStateComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import dev.ukitomato.closta.core.interfaces.SettingsStore

/**
 * [SettingsStore] as one application-level settings file. Non-secret values only — secrets belong to
 * [PasswordSafeSecretStore].
 *
 * Application level because providers and their credentials belong to the user's machine, and PasswordSafe is
 * application level too. [RoamingType.LOCAL] keeps the file off settings sync — the secrets it refers to do not
 * travel to another machine — while still letting an IDE upgrade carry it over; `DISABLED` would drop it on
 * upgrade and leave the keychain entries behind.
 *
 * The state is an immutable map replaced through `updateState`, so writes from several threads do not tear it.
 * A light application service: registered by the annotation, not in plugin.xml.
 */
@Service(Service.Level.APP)
@State(name = "ClostaSettings", storages = [Storage(value = "closta.xml", roamingType = RoamingType.LOCAL)])
class AppSettingsStore :
    SerializablePersistentStateComponent<AppSettingsStore.Entries>(Entries()),
    SettingsStore {
    /** The persisted state: one map of setting key to value. */
    data class Entries(
        @JvmField val entries: Map<String, String> = emptyMap(),
    )

    override fun get(key: String): String? = state.entries[key]

    override fun set(
        key: String,
        value: String,
    ) {
        requireKey(key)
        updateState { it.copy(entries = it.entries + (key to value)) }
    }

    override fun clear(key: String) {
        requireKey(key)
        updateState { it.copy(entries = it.entries - key) }
    }

    private fun requireKey(key: String) = require(key.isNotBlank()) { "a setting key must not be blank" }
}
