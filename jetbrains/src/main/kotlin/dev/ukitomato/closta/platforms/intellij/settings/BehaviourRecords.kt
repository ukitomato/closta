package dev.ukitomato.closta.platforms.intellij.settings

import dev.ukitomato.closta.core.interfaces.SettingsStore
import kotlinx.coroutines.CancellationException

/**
 * How [BehaviourSettings] are kept in the settings: one key each, under [SAVE_BEFORE_SEND_KEY],
 * [RESPECT_GIT_IGNORE_KEY] and [INITIAL_PERMISSION_MODE_KEY].
 *
 * Reading never throws. A value that is not one of the words this version writes (a flag other than `true` and
 * `false`, an unknown mode, `bypassPermissions`, an empty word) reads as the default, and a store that throws makes
 * the whole result the default, with the type of the exception handed to [log] (never a value). Saving always writes
 * all three keys, even a value equal to the default: a default changed later then does not silently change what a user
 * had chosen. "No mode" is written as an empty word.
 *
 * Free of `com.intellij` (a test reads this file to keep it so).
 */
object BehaviourRecords {
    const val SAVE_BEFORE_SEND_KEY = "behaviour.saveBeforeSend"
    const val RESPECT_GIT_IGNORE_KEY = "behaviour.respectGitIgnore"
    const val INITIAL_PERMISSION_MODE_KEY = "behaviour.initialPermissionMode"

    /** The behaviour saved in [store]; the defaults for anything not readable. Never throws. */
    @Suppress("TooGenericExceptionCaught")
    fun load(
        store: SettingsStore,
        log: (String) -> Unit = {},
    ): BehaviourSettings {
        val defaults = BehaviourSettings()
        return try {
            BehaviourSettings(
                saveBeforeSend = flag(store.get(SAVE_BEFORE_SEND_KEY), defaults.saveBeforeSend),
                respectGitIgnore = flag(store.get(RESPECT_GIT_IGNORE_KEY), defaults.respectGitIgnore),
                initialPermissionMode = InitialPermissionMode.of(store.get(INITIAL_PERMISSION_MODE_KEY)),
            )
        } catch (cancel: CancellationException) {
            throw cancel
        } catch (failure: Exception) {
            log("Closta behaviour: could not read the settings (${failure.javaClass.name}); using the defaults")
            defaults
        }
    }

    /** Saves all three values to [store]. */
    fun save(
        store: SettingsStore,
        settings: BehaviourSettings,
    ) {
        store.set(SAVE_BEFORE_SEND_KEY, settings.saveBeforeSend.toString())
        store.set(RESPECT_GIT_IGNORE_KEY, settings.respectGitIgnore.toString())
        store.set(INITIAL_PERMISSION_MODE_KEY, settings.initialPermissionMode?.wire.orEmpty())
    }

    private fun flag(
        stored: String?,
        default: Boolean,
    ): Boolean =
        when (stored) {
            "true" -> true
            "false" -> false
            else -> default
        }
}
