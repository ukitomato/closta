package dev.ukitomato.closta.platforms.intellij.composer

// The names a narrow composer shows, decided without the IDE. Free of `com.intellij`.

/** An Effort level's name ([level] as the button says it) for a narrow composer, each one different. */
fun shortEffort(level: String): String =
    when (level) {
        "Low" -> "L"
        "Medium" -> "Med"
        "High" -> "H"
        "Extra High" -> "XH"
        "Max" -> "Max"
        else -> level
    }

/** [name] in at most [max] characters, cut with "…" (the whole name is the button's tooltip). */
fun shortModel(
    name: String,
    max: Int,
): String = if (name.length <= max) name else name.take(max - 1) + "…"

/**
 * The mode Shift+Tab goes to from [current] (none counts as "default"): the next of [modes], the first after the last,
 * never Bypass (that one is chosen on purpose, with its bar). Null when there is no other mode to go to.
 */
fun nextMode(
    modes: List<String>,
    current: String?,
): String? {
    val cycle = modes.filter { it != "bypassPermissions" }
    if (cycle.isEmpty()) return null
    val at = modes.indexOf(current ?: "default")
    val after = modes.drop(at + 1) + modes.take(at + 1)
    return after.firstOrNull { it != "bypassPermissions" }
}
