package dev.ukitomato.closta.core.services

import dev.ukitomato.closta.core.interfaces.UnsavedDocuments
import dev.ukitomato.closta.core.models.FileToolCall
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import java.util.concurrent.ConcurrentHashMap

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
    private val pending = ConcurrentHashMap<String, Job>()

    /** How many saves are still running or waiting for the UI thread. */
    fun pendingSaves(): Int = pending.size

    suspend fun before(call: FileToolCall) {
        val target = documents
        if (target == null || !saveEnabled()) return
        val save = saveOf(target, call.path)
        if (withTimeoutOrNull(saveLimitMillis) { save.join() } == null) {
            log("file hook: saving a file did not finish in $saveLimitMillis ms; going on")
        }
    }

    // A save still waiting for the UI thread is the one every later call for the same file waits on, so a long modal
    // dialog queues one save per file, not one per call.
    private fun saveOf(
        target: UnsavedDocuments,
        path: String,
    ): Job {
        while (true) {
            val fresh = scope.launch(start = CoroutineStart.LAZY) { save(target, path) }
            val live = pending.putIfAbsent(path, fresh)
            if (live == null) {
                fresh.invokeOnCompletion { pending.remove(path, fresh) }
                fresh.start()
                return fresh
            }
            fresh.cancel()
            if (live.isActive) return live
            pending.remove(path, live)
        }
    }

    private suspend fun save(
        target: UnsavedDocuments,
        path: String,
    ) {
        try {
            target.saveIfModified(path)
        } catch (cancel: CancellationException) {
            throw cancel
        } catch (
            @Suppress("TooGenericExceptionCaught") failure: Exception,
        ) {
            log("file hook: saving a file threw (${failure.javaClass.name})")
        }
    }

    companion object {
        const val DEFAULT_SAVE_LIMIT_MILLIS = 2_000L
    }
}
