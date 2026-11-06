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
