package dev.ukitomato.closta.platforms.intellij.settings

import dev.ukitomato.closta.platforms.intellij.store.ProviderId

/** Which provider a new session starts with: the one Settings makes active, or one picked for this session. */
sealed interface ProviderPick {
    /** The provider Settings makes active for new sessions. */
    data object Active : ProviderPick

    /** The provider [id]; null is the default, the `claude` command's own sign-in. */
    data class Chosen(
        val id: ProviderId?,
    ) : ProviderPick
}

/** What [pick] means for the next claude process; a picked provider that is gone is the default. */
fun ProviderSettings.launchFor(pick: ProviderPick): ProviderLaunch = ProviderLaunch.launchFor(recordOf(pick))

/** The name [pick] is shown under: the record's, or the default's. */
fun ProviderSettings.nameOf(pick: ProviderPick): String = recordOf(pick)?.name ?: ProviderSettings.DEFAULT_NAME

private fun ProviderSettings.recordOf(pick: ProviderPick): ProviderRecord? {
    val saved = load()
    val id = if (pick is ProviderPick.Chosen) pick.id else saved.active
    return saved.records.firstOrNull { it.id == id }
}
