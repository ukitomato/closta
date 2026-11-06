package dev.ukitomato.closta.platforms.intellij.ide

import com.intellij.openapi.application.EDT
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.editor.Document
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VirtualFile
import dev.ukitomato.closta.core.interfaces.EditApplied
import dev.ukitomato.closta.core.interfaces.EditRequest
import dev.ukitomato.closta.core.interfaces.EditorEdits
import dev.ukitomato.closta.core.interfaces.IdeFailureKind
import dev.ukitomato.closta.core.interfaces.IdeResult
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Replaces lines of a project file through the editor's document, opening the file so the user sees
 * the change, as one named command, so the IDE's undo history takes it back in one step. The file is not saved here:
 * saving is the IDE's, and an explicit save would be a write undo cannot reach.
 *
 * Refuses, and changes nothing, for a path outside the project (after resolving links), a missing file, a directory, a
 * file that is not text or not writable, and a range past the end. The thin part that calls the platform; measured in
 * a running IDE. The range and the path checks are `IdeCalculations.kt`'s.
 */
@Suppress("ReturnCount") // early refusals read better than nested branches in this thin platform code
class IdeEditorEdits(
    private val project: Project,
) : EditorEdits {
    /** Looks the file up (a refresh that may touch the disk) off the EDT, then does the edit itself on the EDT. */
    override suspend fun replace(request: EditRequest): IdeResult<EditApplied> {
        val base = project.basePath ?: return refuse(IdeFailureKind.UNAVAILABLE, "the project has no root")
        val resolved =
            resolveInside(base, request.path)
                ?: return refuse(IdeFailureKind.OUTSIDE_PROJECT, "the path is not inside the project")
        val file =
            withContext(Dispatchers.IO) { LocalFileSystem.getInstance().refreshAndFindFileByPath(resolved) }
                ?: return refuse(IdeFailureKind.NOT_FOUND, "the file does not exist")
        return withContext(Dispatchers.EDT) { apply(base, resolved, file, request) }
    }

    private fun apply(
        base: String,
        resolved: String,
        file: VirtualFile,
        request: EditRequest,
    ): IdeResult<EditApplied> {
        val relative = relativePath(base, file.canonicalPath ?: resolved)
        val document = if (relative == null) null else documentOf(file)
        return when {
            relative == null -> refuse(IdeFailureKind.OUTSIDE_PROJECT, "the path is not inside the project")
            file.isDirectory -> refuse(IdeFailureKind.INVALID_ARGUMENT, "the path is a directory")
            !file.isWritable -> refuse(IdeFailureKind.NOT_WRITABLE, "the file is not writable")
            document == null -> refuse(IdeFailureKind.INVALID_ARGUMENT, "the file is not a text file")
            !document.isWritable -> refuse(IdeFailureKind.NOT_WRITABLE, "the file is not writable")
            else -> edit(file, document, relative, request)
        }
    }

    private fun documentOf(file: VirtualFile): Document? =
        if (file.isDirectory) null else FileDocumentManager.getInstance().getDocument(file)

    private fun edit(
        file: VirtualFile,
        document: Document,
        relative: String,
        request: EditRequest,
    ): IdeResult<EditApplied> {
        val range =
            replacementRange(
                lineCount = document.lineCount,
                textLength = document.textLength,
                startLine = request.startLine,
                endLine = request.endLine,
                lineStart = document::getLineStartOffset,
                lineEnd = document::getLineEndOffset,
            )
        if (range is IdeResult.Failed) return range
        val offsets = (range as IdeResult.Ok).value
        val text = request.text.replace("\r\n", "\n").replace('\r', '\n')
        FileEditorManager.getInstance(project).openFile(file, false)
        WriteCommandAction.runWriteCommandAction(project, ClostaBundle.message("ide.edit.command", relative), null, {
            document.replaceString(offsets.start, offsets.end, text)
        })
        return IdeResult.Ok(EditApplied(relative, undoable = true))
    }

    private fun refuse(
        kind: IdeFailureKind,
        message: String,
    ) = IdeResult.Failed(kind, message)
}
