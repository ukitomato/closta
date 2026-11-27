package dev.ukitomato.closta.core.services

import dev.ukitomato.closta.core.interfaces.AnalysisWait
import dev.ukitomato.closta.core.interfaces.Diagnostic
import dev.ukitomato.closta.core.interfaces.DiagnosticSeverity
import dev.ukitomato.closta.core.interfaces.Diagnostics
import dev.ukitomato.closta.core.interfaces.IdeResult
import dev.ukitomato.closta.core.interfaces.UnsavedDocuments
import dev.ukitomato.closta.core.models.FileToolCall
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
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
@Suppress("LongParameterList", "TooManyFunctions") // the seams are given one each; the rest is bookkeeping
class FileToolHooks(
    private val scope: CoroutineScope,
    private val documents: UnsavedDocuments?,
    private val saveEnabled: () -> Boolean,
    private val log: (String) -> Unit,
    private val saveLimitMillis: Long = DEFAULT_SAVE_LIMIT_MILLIS,
    private val diagnostics: Diagnostics? = null,
    private val analysis: AnalysisWait? = null,
    private val reportEnabled: () -> Boolean = { false },
    private val analysisLimitMillis: Long = DEFAULT_ANALYSIS_LIMIT_MILLIS,
    private val snapshotLimit: Int = DEFAULT_SNAPSHOT_LIMIT,
) {
    private val reported = MutableSharedFlow<Pair<String, DiagnosticsReport>>(extraBufferCapacity = 16)

    /** The reports [after] made, each with the id of its tool call. */
    val reports: SharedFlow<Pair<String, DiagnosticsReport>> = reported

    private val pending = ConcurrentHashMap<String, Job>()

    /** How many saves are still running or waiting for the UI thread. */
    fun pendingSaves(): Int = pending.size

    private val copies = LinkedHashMap<String, List<Diagnostic>>()

    /** Forgets every copy taken for a call whose after-hook has not come. */
    fun turnEnded() = synchronized(copies) { copies.clear() }

    /** How many copies wait for their after-hook. */
    fun snapshots(): Int = synchronized(copies) { copies.size }

    suspend fun before(call: FileToolCall) {
        val target = documents
        val save = if (target != null && saveEnabled()) saveOf(target, call.path) else null
        val copy = wantsCopy(call)
        if (save == null && !copy) return
        var taken: List<Diagnostic>? = null
        val done =
            withTimeoutOrNull(saveLimitMillis) {
                save?.join()
                if (copy) taken = errorsOf(call.path)
                true
            }
        if (done == null) log("file hook: saving a file did not finish in $saveLimitMillis ms; going on")
        taken?.let { remember(call.toolUseId, it) }
    }

    /**
     * The errors an edit added to its file: those the IDE finds once it has read the file again that the copy taken
     * before the tool did not have. Null when there is no copy, the setting is off, or the analysis did not finish in
     * [analysisLimitMillis]. A report is also sent to [reports] with the tool call's id.
     */
    suspend fun after(call: FileToolCall): DiagnosticsReport? {
        val earlier = forget(call.toolUseId)?.takeIf { canReport() }
        return earlier?.let { reportOf(call, it) }
    }

    private suspend fun reportOf(
        call: FileToolCall,
        earlier: List<Diagnostic>,
    ): DiagnosticsReport? {
        val later = withTimeoutOrNull(analysisLimitMillis) { analysedErrors(call.path) }
        if (later == null) log("file hook: the analysis of a file did not finish in $analysisLimitMillis ms; going on")
        val added = later?.let { introducedDiagnostics(earlier, it) }.orEmpty()
        return added
            .takeIf { it.isNotEmpty() }
            ?.let { DiagnosticsReport(call.path, it) }
            ?.also { reported.tryEmit(call.toolUseId to it) }
    }

    private fun canReport(): Boolean = diagnostics != null && analysis != null && reportEnabled()

    private suspend fun analysedErrors(path: String): List<Diagnostic>? =
        if (analysis?.refreshAndAwait(path, analysisLimitMillis) == true) errorsOf(path) else null

    private fun wantsCopy(call: FileToolCall): Boolean =
        call.toolName in EDIT_TOOLS && canReport() && analysis?.canAnalyse(call.path) == true

    // The errors of one file; null when the IDE gives none (a file it has not opened) or fails.
    private suspend fun errorsOf(path: String): List<Diagnostic>? =
        try {
            (diagnostics?.diagnostics(path) as? IdeResult.Ok)?.value?.filter { it.severity == DiagnosticSeverity.ERROR }
        } catch (cancel: CancellationException) {
            throw cancel
        } catch (
            @Suppress("TooGenericExceptionCaught") failure: Exception,
        ) {
            log("file hook: reading a file's errors threw (${failure.javaClass.name})")
            null
        }

    private fun remember(
        toolUseId: String,
        errors: List<Diagnostic>,
    ) = synchronized(copies) {
        copies.remove(toolUseId)
        copies[toolUseId] = errors
        while (copies.size > snapshotLimit) copies.remove(copies.keys.first())
    }

    private fun forget(toolUseId: String): List<Diagnostic>? = synchronized(copies) { copies.remove(toolUseId) }

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
        const val DEFAULT_ANALYSIS_LIMIT_MILLIS = 3_000L
        const val DEFAULT_SNAPSHOT_LIMIT = 64
        private val EDIT_TOOLS = setOf("Edit", "Write", "NotebookEdit")
    }
}
