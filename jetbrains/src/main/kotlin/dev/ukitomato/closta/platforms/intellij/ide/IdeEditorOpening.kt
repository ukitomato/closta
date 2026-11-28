package dev.ukitomato.closta.platforms.intellij.ide

import com.intellij.openapi.application.EDT
import com.intellij.openapi.fileEditor.OpenFileDescriptor
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.LocalFileSystem
import dev.ukitomato.closta.core.interfaces.EditorOpening
import dev.ukitomato.closta.core.interfaces.IdeFailureKind
import dev.ukitomato.closta.core.interfaces.IdeResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Opens a file in an editor tab without taking the keyboard from where the user is typing. The file is looked up
 * (with a refresh, so one just made is found) off the UI thread; only the navigation is on it. The line is 1-based.
 * The thin part that calls the platform; measured in a running IDE.
 */
class IdeEditorOpening(
    private val project: Project,
) : EditorOpening {
    override suspend fun open(
        path: String,
        line: Int?,
    ): IdeResult<Unit> {
        val file = withContext(Dispatchers.IO) { LocalFileSystem.getInstance().refreshAndFindFileByPath(path) }
        return when {
            file == null -> IdeResult.Failed(IdeFailureKind.NOT_FOUND, "the file was not found")
            file.isDirectory -> IdeResult.Failed(IdeFailureKind.INVALID_ARGUMENT, "the path is a folder")
            else -> {
                val target = OpenFileDescriptor(project, file, (line ?: 1) - 1, 0)
                withContext(Dispatchers.EDT) { target.navigate(false) }
                IdeResult.Ok(Unit)
            }
        }
    }
}
