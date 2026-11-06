package dev.ukitomato.closta.core.interfaces

/**
 * Where core reads and writes non-secret settings — the default model, the permission mode, and the
 * like. Keyed by an opaque string; secrets never travel here (they belong to [SecretStore]).
 *
 * Forward-declared: none of the core use cases consumes it. `SwitchModel` changes the model *live* only
 * and does not persist a default — persistence is a downstream settings concern, so the store is out of
 * scope for `SwitchModel`. It is defined in core because its second implementation is nameable and
 * readying the contract face lets the platform side use it without changing core.
 *
 * Second implementation (not a test fake): an IntelliJ `@State PersistentStateComponent` (`platforms`).
 * Test fake: an in-memory map.
 */
interface SettingsStore {
    /** The setting stored under [key], or null if none. */
    fun get(key: String): String?

    /** Stores [value] under [key], replacing any existing setting. */
    fun set(
        key: String,
        value: String,
    )

    /** Removes the setting under [key], if any — restoring the default. Symmetric with [SecretStore.clear]. */
    fun clear(key: String)
}
