package dev.ukitomato.closta.platforms.intellij.ide

import com.intellij.openapi.application.readAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.ProjectFileIndex
import com.intellij.openapi.vcs.changes.ChangeListManager
import com.intellij.openapi.vfs.VirtualFile
import dev.ukitomato.closta.core.interfaces.FileList
import dev.ukitomato.closta.core.interfaces.FileQuery
import dev.ukitomato.closta.core.interfaces.IdeFailureKind
import dev.ukitomato.closta.core.interfaces.IdeResult
import dev.ukitomato.closta.core.interfaces.ProjectFiles

/**
 * The project's files, by query: the content of the project's modules (so excluded folders and
 * libraries are never visited), without the files version control ignores unless the caller asks for them. The walk
 * stops one match past the limit, which is how it knows the answer was cut. Runs in a read action.
 *
 * This is the thin part that calls the platform; the limit, the match and the relative path are
 * `IdeCalculations.kt`'s. It is measured in a running IDE.
 */
@Suppress("ReturnCount") // early refusals read better than nested branches in this thin platform code
class IdeProjectFiles(
    private val project: Project,
) : ProjectFiles {
    override suspend fun list(query: FileQuery): IdeResult<FileList> {
        val base = project.basePath ?: return IdeResult.Failed(IdeFailureKind.UNAVAILABLE, "the project has no root")
        val limit = clampLimit(query.limit)
        val found = readAction { collect(base, query, limit) }
        return IdeResult.Ok(limited(found, limit))
    }

    private fun collect(
        base: String,
        query: FileQuery,
        limit: Int,
    ): List<String> {
        val found = ArrayList<String>()
        val changes = ChangeListManager.getInstance(project)
        ProjectFileIndex.getInstance(project).iterateContent { file ->
            relativeIfWanted(file, base, query, changes)?.let(found::add)
            found.size <= limit
        }
        return found
    }

    private fun relativeIfWanted(
        file: VirtualFile,
        base: String,
        query: FileQuery,
        changes: ChangeListManager,
    ): String? {
        if (file.isDirectory) return null
        val relative = relativePath(base, file.path) ?: return null
        val wanted = matchesQuery(relative, query.match) && (query.includeIgnored || !changes.isIgnoredFile(file))
        return relative.takeIf { wanted }
    }
}
