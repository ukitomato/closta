package dev.ukitomato.closta.platforms.intellij.ide

import com.intellij.openapi.application.EDT
import com.intellij.openapi.application.readAction
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.LocalFileSystem
import dev.ukitomato.closta.core.interfaces.SaveResult
import dev.ukitomato.closta.core.interfaces.UnsavedDocuments
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Saves one open document when it has unsaved changes. The lookup is a read action off the UI thread; only the save
 * enters the UI thread, which takes the write action itself. The thin part that calls the platform; measured in a
 * running IDE. [project] scopes nothing yet: documents are the IDE's, not the project's.
 */
@Suppress("UnusedPrivateProperty")
class IdeUnsavedDocuments(
    private val project: Project,
) : UnsavedDocuments {
    override suspend fun saveIfModified(path: String): SaveResult {
        val manager = FileDocumentManager.getInstance()
        val document =
            readAction { LocalFileSystem.getInstance().findFileByPath(path)?.let { manager.getCachedDocument(it) } }
        return when {
            document == null -> SaveResult.NOT_OPEN
            !manager.isDocumentUnsaved(document) -> SaveResult.NOT_MODIFIED
            else -> {
                withContext(Dispatchers.EDT) { manager.saveDocument(document) }
                SaveResult.SAVED
            }
        }
    }
}
