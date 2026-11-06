package dev.ukitomato.closta.platforms.intellij.ide

import com.intellij.codeInsight.daemon.impl.HighlightInfo
import com.intellij.lang.annotation.HighlightSeverity
import com.intellij.openapi.application.readAction
import com.intellij.openapi.editor.Document
import com.intellij.openapi.editor.impl.DocumentMarkupModel
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VirtualFile
import dev.ukitomato.closta.core.interfaces.Diagnostic
import dev.ukitomato.closta.core.interfaces.Diagnostics
import dev.ukitomato.closta.core.interfaces.IdeFailureKind
import dev.ukitomato.closta.core.interfaces.IdeResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.IOException

/**
 * What the IDE has already highlighted as an error or a warning, read from the highlights on the
 * documents it holds: it starts no analysis. With no path it reads every open file; with one, that file, which must
 * be in the project (by its name and with symbolic links resolved) and open: a file that is not open has no document
 * and no highlights, and answers `UNAVAILABLE` rather than an empty list that would read as "no errors". Runs in a
 * read action.
 *
 * The thin part that calls the platform; measured in a running IDE. The mapping from a highlight to a
 * finding is `IdeCalculations.kt`'s.
 */
@Suppress("ReturnCount") // early refusals read better than nested branches in this thin platform code
class IdeDiagnostics(
    private val project: Project,
) : Diagnostics {
    override suspend fun diagnostics(path: String?): IdeResult<List<Diagnostic>> {
        val base = project.basePath ?: return IdeResult.Failed(IdeFailureKind.UNAVAILABLE, "the project has no root")
        if (path ==
            null
        ) {
            return IdeResult.Ok(
                readAction {
                    FileEditorManager
                        .getInstance(project)
                        .openFiles
                        .toList()
                        .flatMap { of(it).orEmpty() }
                },
            )
        }
        if (!insideProject(base, path)) {
            return IdeResult.Failed(IdeFailureKind.OUTSIDE_PROJECT, "the path is not inside the project")
        }
        return readAction {
            val file = LocalFileSystem.getInstance().findFileByPath(path)
            val found = file?.let(::of)
            when {
                file == null -> IdeResult.Failed(IdeFailureKind.NOT_FOUND, "the file does not exist")
                found == null ->
                    IdeResult.Failed(
                        IdeFailureKind.UNAVAILABLE,
                        "the file is not open in the IDE, so it has no diagnostics yet; open it and ask again",
                    )
                else -> IdeResult.Ok(found)
            }
        }
    }

    /** Inside the root by its name, and still inside once symbolic links on both sides are resolved. */
    private suspend fun insideProject(
        base: String,
        path: String,
    ): Boolean =
        relativePath(base, path) != null &&
            withContext(Dispatchers.IO) {
                try {
                    relativePath(File(base).canonicalPath, File(path).canonicalPath) != null
                } catch (
                    @Suppress("SwallowedException") unreadable: IOException,
                ) {
                    false
                }
            }

    /** The findings of an open [file], or null when the IDE holds no document for it (it is not open). */
    private fun of(file: VirtualFile): List<Diagnostic>? {
        val document = FileDocumentManager.getInstance().getCachedDocument(file) ?: return null
        val markup = DocumentMarkupModel.forDocument(document, project, false) ?: return emptyList()
        return markup.allHighlighters
            .mapNotNull(HighlightInfo::fromRangeHighlighter)
            .mapNotNull { info -> finding(file, document, info) }
            .sortedWith(compareBy({ it.line }, { it.column }))
    }

    private fun finding(
        file: VirtualFile,
        document: Document,
        info: HighlightInfo,
    ): Diagnostic? {
        val offset = info.startOffset.coerceIn(0, document.textLength)
        val line = document.getLineNumber(offset)
        return diagnosticOf(
            path = file.path,
            line0 = line,
            column0 = offset - document.getLineStartOffset(line),
            atLeastError = info.severity >= HighlightSeverity.ERROR,
            atLeastWarning = info.severity >= HighlightSeverity.WARNING,
            description = info.description,
            source = info.inspectionToolId,
        )
    }
}
