package dev.ukitomato.closta.core.services

import dev.ukitomato.closta.core.interfaces.UnsavedDocuments
import dev.ukitomato.closta.core.models.FileToolCall
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

/**
 * What the host does around a file tool call. Before Claude reads or edits a file, its unsaved changes are saved, so
 * Claude sees what the user sees and an edit does not land on an older text.
 *
 * It never holds Claude's work back for long and never fails it: the save runs in [scope] and is waited for at most
 * [saveLimitMillis] (the UI thread may not turn while a modal dialog is open). A save that did not finish is not
 * cancelled; it runs later, when the UI thread is free. What is logged is the type of an exception or the limit, never
 * a path. The setting [saveEnabled] is read at every call.
 */
class FileToolHooks(
    private val scope: CoroutineScope,
    private val documents: UnsavedDocuments?,
    private val saveEnabled: () -> Boolean,
    private val log: (String) -> Unit,
    private val saveLimitMillis: Long = DEFAULT_SAVE_LIMIT_MILLIS,
) {
    suspend fun before(call: FileToolCall) {
        val target = documents
        if (target == null || !saveEnabled()) return
        val save =
            scope.launch {
                try {
                    target.saveIfModified(call.path)
                } catch (cancel: CancellationException) {
                    throw cancel
                } catch (
                    @Suppress("TooGenericExceptionCaught") failure: Exception,
                ) {
                    log("file hook: saving a file threw (${failure.javaClass.name})")
                }
            }
        if (withTimeoutOrNull(saveLimitMillis) { save.join() } == null) {
            log("file hook: saving a file did not finish in $saveLimitMillis ms; going on")
        }
    }

    companion object {
        const val DEFAULT_SAVE_LIMIT_MILLIS = 2_000L
    }
}
