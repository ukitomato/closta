package dev.ukitomato.closta.core.interfaces

/**
 * Where core asks for and stores secrets — API keys, tokens, AWS credentials (secrets live only in
 * PasswordSafe, never in plain-text settings). Keyed by an opaque string so the contract carries no notion of
 * *which* secrets exist; that is the caller's vocabulary.
 *
 * Every operation suspends because the real store sits on the OS keychain and can block: the IDE's
 * PasswordSafe reports a call made on the EDT or inside a read action as a prohibited slow operation. Values
 * travel as [Secret], never as a bare `String`, so a result cannot be printed by accident.
 *
 * A failure is reported as [SecretStoreUnavailableException] only where the store itself can see it. A store that
 * writes in the background — the IDE's PasswordSafe does so for the OS keychain — records a failed write in its own
 * log instead, and a read it cannot complete may come back as null.
 *
 * Second implementation (not a test fake): an IntelliJ PasswordSafe-backed store (`platforms`). Test fake: an
 * in-memory map.
 */
interface SecretStore {
    /**
     * The secret stored under [key], or null if none is stored.
     *
     * @throws SecretStoreUnavailableException when the store reports that it cannot be read at all (a denied or
     *   locked keychain) — which is not the same as "not stored".
     */
    suspend fun get(key: String): Secret?

    /**
     * Stores [value] under [key], replacing any existing secret.
     *
     * @throws SecretStoreUnavailableException when the store reports that it cannot be written.
     */
    suspend fun set(
        key: String,
        value: Secret,
    )

    /**
     * Removes the secret under [key], if any.
     *
     * @throws SecretStoreUnavailableException when the store reports that it cannot be written.
     */
    suspend fun clear(key: String)
}

/**
 * One secret value. Deliberately not a `data class` and without value-based `equals`: a generated `toString`
 * would print the value into any log line, exception, or string template. The value leaves only
 * through [reveal], whose name marks each place a secret is handed on.
 */
class Secret(
    private val value: String,
) {
    init {
        require(value.isNotEmpty()) { "a secret must not be empty" }
    }

    /** The secret itself. Call it only where the value is handed to its consumer (the store, the child env). */
    fun reveal(): String = value

    override fun toString(): String = "Secret(<redacted>)"
}

/**
 * The secret store could not be used — the keychain denied access, could not be unlocked, or failed. The
 * message says what happened and never carries a secret; an underlying failure is named, not chained, because
 * this contract cannot vouch for what a platform exception's message contains.
 */
class SecretStoreUnavailableException(
    message: String,
) : RuntimeException(message)
