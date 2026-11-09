package dev.ukitomato.closta.platforms.intellij.store

import java.util.UUID

/**
 * The immutable identity of a provider — the part of a provider record that secrets are keyed by. A provider's
 * display name is editable, so it can never be a storage key: a rename would orphan everything stored under the
 * old name. The id is a generated UUID in canonical form (lowercase hex, 36 characters), and only that form is
 * accepted, so a display name cannot be passed in its place by mistake.
 *
 * Pure (no `com.intellij`), so it is measured by unit tests.
 */
class ProviderId private constructor(
    val value: String,
) {
    override fun equals(other: Any?): Boolean = other is ProviderId && other.value == value

    override fun hashCode(): Int = value.hashCode()

    override fun toString(): String = "ProviderId($value)"

    companion object {
        private val CANONICAL = Regex("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")

        /** A fresh id for a newly created provider. */
        fun generate(): ProviderId = ProviderId(UUID.randomUUID().toString())

        /** The id stored in a provider record, or null when [text] is not a canonical UUID. */
        fun parse(text: String): ProviderId? = if (CANONICAL.matches(text)) ProviderId(text) else null
    }
}
