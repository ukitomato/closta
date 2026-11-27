package dev.ukitomato.closta.platforms.intellij.composer

private val SOURCES =
    setOf(
        "userSettings",
        "projectSettings",
        "localSettings",
        "flagSettings",
        "policySettings",
        "cliArg",
        "command",
        "session",
        "mcpMount",
        "toolsNarrowing",
        "mcpServerPolicy",
        "hostCredential",
    )

/** The bundle key of the words for a rule's [source], or null for a source with no words: it is shown as given. */
fun ruleSourceKey(source: String): String? = if (source in SOURCES) "composer.rules.source.$source" else null

/**
 * The settings file a rule of [source] is read from, in the CLI's path space: the project's and the local one in the
 * directory the session started in ([originalCwd]), the user's in [configDir] (null when the platform could not tell
 * where it is). Other sources are no file.
 */
fun settingsFileOf(
    source: String,
    originalCwd: String,
    configDir: String?,
): String? =
    when (source) {
        "projectSettings" -> inside(originalCwd, ".claude", "settings.json")
        "localSettings" -> inside(originalCwd, ".claude", "settings.local.json")
        "userSettings" -> configDir?.takeIf { it.isNotEmpty() }?.let { inside(it, "settings.json") }
        else -> null
    }

private fun inside(
    root: String,
    vararg parts: String,
): String? {
    if (root.isEmpty()) return null
    val separator = if ('\\' in root && '/' !in root) '\\' else '/'
    return (listOf(root.trimEnd('/', '\\')) + parts).joinToString(separator.toString())
}
