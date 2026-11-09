package dev.ukitomato.closta.platforms.intellij.ide

import com.intellij.diff.DiffContentFactory
import com.intellij.diff.DiffManager
import com.intellij.diff.contents.DiffContent
import com.intellij.diff.requests.SimpleDiffRequest
import com.intellij.openapi.application.EDT
import com.intellij.openapi.editor.Document
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.fileTypes.FileTypeManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VirtualFile
import dev.ukitomato.closta.core.interfaces.DiffShowRequest
import dev.ukitomato.closta.core.interfaces.DiffViews
import dev.ukitomato.closta.core.interfaces.IdeFailureKind
import dev.ukitomato.closta.core.interfaces.IdeResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

/**
 * Opens the IDE's diff view for a pair of texts. Reads only: nothing is written, and the file is
 * read only for a Write, whose left side is the file as it is now. A Write's file is found with a refresh (the disk is
 * looked at again, so a file Claude has just made is not taken for a missing one) and read from its document, so
 * changes not yet saved are in the left side, as for [IdeEditorEdits].
 *
 * The thin part that calls the platform; measured in a running IDE. Where the left comes from and
 * which paths refuse is `IdeCalculations.kt`'s.
 */
class IdeDiffViews(
    private val project: Project,
) : DiffViews {
    override suspend fun show(request: DiffShowRequest): IdeResult<Unit> {
        val name = File(request.path).name
        val before = request.before
        return if (before != null) {
            withContext(Dispatchers.EDT) { open(name, before, request.after, current = false) }
        } else {
            showAgainstFile(request, name)
        }
    }

    // A Write: the path must be inside the project (as for an edit); the file is looked up off the EDT, the rest is
    // done on it.
    private suspend fun showAgainstFile(
        request: DiffShowRequest,
        name: String,
    ): IdeResult<Unit> {
        val base = project.basePath
        val resolved = base?.let { resolveInside(it, request.path) }
        return when {
            base == null -> IdeResult.Failed(IdeFailureKind.UNAVAILABLE, "the project has no root")
            resolved == null ->
                IdeResult.Failed(IdeFailureKind.OUTSIDE_PROJECT, "the path is not inside the project")
            else -> {
                val file =
                    withContext(Dispatchers.IO) { LocalFileSystem.getInstance().refreshAndFindFileByPath(resolved) }
                withContext(Dispatchers.EDT) { showWithLeftOf(base, resolved, file, request.after, name) }
            }
        }
    }

    private fun showWithLeftOf(
        base: String,
        resolved: String,
        file: VirtualFile?,
        after: String,
        name: String,
    ): IdeResult<Unit> {
        val document: Document? =
            file?.takeUnless { it.isDirectory }?.let { FileDocumentManager.getInstance().getDocument(it) }
        val left = diffLeftSource(base, resolved, file != null, file?.canonicalPath) { document != null }
        return when (left) {
            is DiffLeft.Refused -> left.failure
            DiffLeft.Empty -> open(name, "", after, current = true)
            DiffLeft.Current -> open(name, checkNotNull(document).text, after, current = true)
        }
    }

    private fun open(
        name: String,
        left: String,
        right: String,
        current: Boolean,
    ): IdeResult<Unit> {
        val factory = DiffContentFactory.getInstance()
        val type = FileTypeManager.getInstance().getFileTypeByFileName(name)
        val leftContent: DiffContent = factory.create(project, left, type)
        val rightContent: DiffContent = factory.create(project, right, type)
        val (leftTitle, rightTitle) = if (current) "Current" to "Proposed" else "Before" to "After"
        val request = SimpleDiffRequest(name, leftContent, rightContent, leftTitle, rightTitle)
        DiffManager.getInstance().showDiff(project, request)
        return IdeResult.Ok(Unit)
    }
}
