package dev.ukitomato.closta.platforms.intellij.ide

import com.intellij.openapi.application.readAction
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import dev.ukitomato.closta.core.interfaces.IdeResult
import dev.ukitomato.closta.core.interfaces.OpenEditor
import dev.ukitomato.closta.core.interfaces.OpenEditors

/**
 * The files open in the project's editor tabs, in tab order. Read in a read action off the UI thread; tabs that are not
 * files on disk (a chat, a diff) are left out. The thin part that calls the platform; measured in a running IDE.
 */
class IdeOpenEditors(
    private val project: Project,
) : OpenEditors {
    override suspend fun list(): IdeResult<List<OpenEditor>> =
        IdeResult.Ok(
            readAction {
                val manager = FileEditorManager.getInstance(project)
                val documents = FileDocumentManager.getInstance()
                val active = manager.selectedFiles.toSet()
                manager.openFiles
                    .filter { it.isInLocalFileSystem && !it.isDirectory }
                    .map { OpenEditor(it.path, active = it in active, modified = documents.isFileModified(it)) }
            },
        )
}
