// put / add, not 0.5's putting / adding: IDEs before 2026.2 bundle an older kotlinx-collections-immutable that
// comes first on the compile classpath and has only these names.
@file:Suppress("DEPRECATION")

package dev.ukitomato.closta.presenter.view

import kotlinx.collections.immutable.PersistentMap
import kotlinx.collections.immutable.toPersistentMap
import java.util.Collections

// The transcript hands out its routing maps and lists. Built through these, they cannot be changed through a cast,
// so a record that compares equal today still does tomorrow, and the projection's memo can rely on it.

/**
 * This map with [key] set to [value], as a map that cannot be changed. The map is persistent, so the entry costs the
 * same however many there are, and the next version shares the rest.
 */
internal fun <K, V> Map<K, V>.plusEntry(
    key: K,
    value: V,
): Map<K, V> = ((this as? PersistentMap<K, V>) ?: toPersistentMap()).put(key, value)

/** This list with [item] at the end, as a list that cannot be changed. */
internal fun <T> List<T>.plusItem(item: T): List<T> = Collections.unmodifiableList(this + item)
