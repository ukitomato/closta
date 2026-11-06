package dev.ukitomato.closta.presenter.view

import kotlinx.collections.immutable.PersistentList
import kotlinx.collections.immutable.PersistentMap
import kotlinx.collections.immutable.persistentListOf
import kotlinx.collections.immutable.persistentMapOf

/**
 * An ordered collection addressed by key, never by position — the transcript's form of the tree's
 * `{order, byId}`, since a sub-agent's tool call lands between others and a position would shift.
 *
 * It is immutable. Replacing an entry keeps [order] as the same list, so the projection can tell an order that
 * did not change by identity; a change that leaves the entry as it was returns this same collection, so an
 * input that changes nothing changes no object above it either.
 *
 * Both halves are persistent collections, so a put costs the same however many entries there are.
 */
class Keyed<T : Any> private constructor(
    private val keys: PersistentList<String>,
    private val byKey: PersistentMap<String, T>,
) {
    val order: List<String> get() = keys

    val size: Int get() = keys.size

    operator fun get(key: String): T? = byKey[key]

    operator fun contains(key: String): Boolean = key in byKey

    fun values(): List<T> = keys.map(byKey::getValue)

    /** Appends [value] under a new [key], or replaces the entry in place when the key is there. */
    fun put(
        key: String,
        value: T,
    ): Keyed<T> =
        when {
            byKey[key] === value -> this
            key in byKey -> Keyed(keys, byKey.put(key, value))
            else -> Keyed(keys.add(key), byKey.put(key, value))
        }

    /** Replaces the entry under [key] with [change] of it; a missing key or an unchanged entry changes nothing. */
    fun update(
        key: String,
        change: (T) -> T,
    ): Keyed<T> {
        val old = byKey[key] ?: return this
        val new = change(old)
        return if (new === old) this else Keyed(keys, byKey.put(key, new))
    }

    /**
     * [wanted] when no entry has it, else the first of `wanted~2`, `wanted~3`… that none has. Two sources pick
     * keys for the same collection — the host for its user messages, the CLI for its turns and messages — and
     * nothing stops them picking the same string; a collection with one key twice is a tree the webview
     * rejects.
     */
    fun claim(wanted: String): String = claimKey(byKey::containsKey, wanted)

    override fun equals(other: Any?): Boolean = other is Keyed<*> && order == other.order && byKey == other.byKey

    override fun hashCode(): Int = order.hashCode() * HASH_PRIME + byKey.hashCode()

    override fun toString(): String = order.joinToString(prefix = "Keyed(", postfix = ")") { "$it=${byKey[it]}" }

    companion object {
        private const val HASH_PRIME = 31
        private val EMPTY: Keyed<Any> = Keyed(persistentListOf(), persistentMapOf())

        @Suppress("UNCHECKED_CAST")
        fun <T : Any> empty(): Keyed<T> = EMPTY as Keyed<T>
    }
}

/** [wanted] when [taken] says it is free, else the first of `wanted~2`, `wanted~3`… that is. */
internal fun claimKey(
    taken: (String) -> Boolean,
    wanted: String,
): String {
    if (!taken(wanted)) return wanted
    var suffix = 2
    while (taken("$wanted~$suffix")) suffix++
    return "$wanted~$suffix"
}
