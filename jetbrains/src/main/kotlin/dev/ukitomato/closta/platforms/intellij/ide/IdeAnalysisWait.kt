package dev.ukitomato.closta.platforms.intellij.ide

import com.intellij.codeInsight.daemon.DaemonCodeAnalyzer
import com.intellij.codeInsight.daemon.impl.DaemonCodeAnalyzerEx
import com.intellij.openapi.application.readAction
import com.intellij.openapi.editor.Document
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.fileEditor.FileEditor
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.util.text.StringUtil
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiFile
import com.intellij.psi.PsiManager
import dev.ukitomato.closta.core.interfaces.AnalysisWait
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Waits for the IDE to analyse a file again after something outside the IDE wrote it. Only a file a visible editor
 * shows is analysed, so only such a file can be waited for. The thin part that calls the platform; measured in a
 * running IDE.
 *
 * The order is what makes the answer fresh: the daemon listener is attached first; then the file is refreshed in the
 * virtual file system (asynchronously), and the wait goes on until the document holds what is on disk; only a daemon
 * run that finishes after that counts, and it must report the file's error analysis as finished. Nothing is awaited on
 * the UI thread or while a lock is held, and the whole wait is cancelled at the limit.
 */
@Suppress("ReturnCount") // the file, its document and its PSI each end the wait early when missing
class IdeAnalysisWait(
    private val project: Project,
) : AnalysisWait {
    override suspend fun canAnalyse(path: String): Boolean =
        readAction {
            val file = LocalFileSystem.getInstance().findFileByPath(path)
            file != null && FileEditorManager.getInstance(project).selectedEditors.any { it.file == file }
        }

    override suspend fun refreshAndAwait(
        path: String,
        limitMillis: Long,
    ): Boolean = withTimeoutOrNull(limitMillis) { await(path) } == true

    private suspend fun await(path: String): Boolean {
        val file = readAction { LocalFileSystem.getInstance().findFileByPath(path) } ?: return false
        val document = readAction { FileDocumentManager.getInstance().getCachedDocument(file) } ?: return false
        val psi = readAction { PsiManager.getInstance(project).findFile(file) } ?: return false
        val finished = Channel<Unit>(Channel.CONFLATED)

        val counting = AtomicBoolean(false)
        val listening = Disposer.newDisposable("Closta analysis wait")
        try {
            project.messageBus.connect(listening).subscribe(
                DaemonCodeAnalyzer.DAEMON_EVENT_TOPIC,
                object : DaemonCodeAnalyzer.DaemonListener {
                    override fun daemonFinished(fileEditors: Collection<FileEditor>) {
                        if (counting.get() && fileEditors.any { it.file == file }) finished.trySend(Unit)
                    }
                },
            )
            refresh(file)
            while (!matchesDisk(file, document)) delay(POLL_MILLIS)
            counting.set(true)
            while (true) {
                if (analysed(psi)) return true
                finished.receive()
            }
        } finally {
            Disposer.dispose(listening)
        }
    }

    private suspend fun refresh(file: VirtualFile) {
        val done = CompletableDeferred<Unit>()
        withContext(Dispatchers.Default) {
            VfsUtil.markDirty(true, false, file)
            file.refresh(true, false) { done.complete(Unit) }
        }
        done.await()
    }

    private suspend fun matchesDisk(
        file: VirtualFile,
        document: Document,
    ): Boolean {
        val onDisk = withContext(Dispatchers.IO) { String(file.contentsToByteArray(), file.charset).removePrefix(BOM) }
        return readAction { document.immutableCharSequence.toString() == StringUtil.convertLineSeparators(onDisk) }
    }

    private suspend fun analysed(psi: PsiFile): Boolean =
        readAction { DaemonCodeAnalyzerEx.getInstanceEx(project).isErrorAnalyzingFinished(psi) }

    private companion object {
        const val POLL_MILLIS = 50L
        const val BOM = "\uFEFF"
    }
}
