package dev.ukitomato.closta.platforms.intellij.session

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.withTimeoutOrNull

/**
 * The step before a message is written to the CLI: when the setting says so, save the IDE's unsaved documents,
 * so Claude reads what the user sees in the editor. The decision is here, free of `com.intellij`; the saving itself is
 * [save] (`DocumentSaving` in the IDE, a fake in the fast suite).
 *
 * It never holds a message back for long and never fails it: [save] is given [limitMillis] (the IDE's UI thread may
 * not turn while a modal dialog is open), and a [save] that threw — or did not finish — is written to [log] as the type
 * of the exception, or as a timeout, and the call returns so that the message goes on. A save that gave up on time may
 * still run later, when the UI thread is free; it then saves after the message was sent.
 *
 * The setting is read at every call, so a change applies to the next message. Nothing here reads a document or a path:
 * what is logged is the type of an exception or the limit.
 *
 * Free of `com.intellij` (a test reads this file to keep it so).
 */
class SaveBeforeSend(
    /** Whether to save: read at each call. */
    private val enabled: () -> Boolean,
    /** Saves the unsaved documents; suspends until it has. */
    private val save: suspend () -> Unit,
    private val log: (String) -> Unit = {},
    private val limitMillis: Long = DEFAULT_LIMIT_MILLIS,
) {
    suspend operator fun invoke() {
        if (!enabled()) return
        try {
            val finished = withTimeoutOrNull(limitMillis) { save() }
            if (finished == null) log("claude session: saving the documents did not finish in $limitMillis ms; sending")
        } catch (cancel: CancellationException) {
            throw cancel
        } catch (
            @Suppress("TooGenericExceptionCaught") failure: Exception,
        ) {
            log("claude session: saving the documents threw (${failure.javaClass.name}); sending")
        }
    }

    companion object {
        const val DEFAULT_LIMIT_MILLIS = 5_000L
    }
}
