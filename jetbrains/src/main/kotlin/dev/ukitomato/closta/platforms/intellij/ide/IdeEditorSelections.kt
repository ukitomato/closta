package dev.ukitomato.closta.platforms.intellij.ide

import com.intellij.openapi.application.EDT
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.TextRange
import dev.ukitomato.closta.core.interfaces.EditorSelections
import dev.ukitomato.closta.core.interfaces.IdeFailureKind
import dev.ukitomato.closta.core.interfaces.IdeResult
import dev.ukitomato.closta.core.interfaces.SelectedText
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * The selection in the frontmost text view, taken when asked on the UI thread, where the editor's
 * selection model lives. No view, or nothing selected, is `Ok(null)`. A file inside the project is named relative to
 * it; one outside is named by its absolute path, as there is nothing to be relative to.
 *
 * The thin part that calls the platform; measured in a running IDE.
 * Line arithmetic is in `IdeCalculations.kt`.
 */
@Suppress("ReturnCount") // early refusals read better than nested branches in this thin platform code
class IdeEditorSelections(
    private val project: Project,
) : EditorSelections {
    override suspend fun current(): IdeResult<SelectedText?> = withContext(Dispatchers.EDT) { read() }

    private fun read(): IdeResult<SelectedText?> {
        val view = FileEditorManager.getInstance(project).selectedTextEditor
        val selection = view?.selectionModel
        if (view == null || selection == null || !selection.hasSelection()) return IdeResult.Ok(null)
        val document = view.document
        val file =
            FileDocumentManager.getInstance().getFile(document)
                ?: return IdeResult.Failed(IdeFailureKind.UNAVAILABLE, "the selected text is not in a file")
        val base = project.basePath
        val path = base?.let { relativePath(it, file.path) } ?: file.path
        val start = selection.selectionStart
        val end = selection.selectionEnd
        return IdeResult.Ok(
            SelectedText(
                path = path,
                startLine = document.getLineNumber(start) + 1,
                endLine = inclusiveEndLine(start, end, document::getLineNumber),
                text = document.getText(TextRange(start, end)),
            ),
        )
    }
}
