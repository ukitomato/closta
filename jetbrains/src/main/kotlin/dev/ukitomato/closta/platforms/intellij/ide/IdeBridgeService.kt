package dev.ukitomato.closta.platforms.intellij.ide

import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.SystemInfo
import dev.ukitomato.closta.core.interfaces.Diagnostics
import dev.ukitomato.closta.core.interfaces.DiffViews
import dev.ukitomato.closta.core.interfaces.EditorEdits
import dev.ukitomato.closta.core.interfaces.EditorSelections
import dev.ukitomato.closta.core.interfaces.IdeBridge
import dev.ukitomato.closta.core.interfaces.ProjectFiles
import dev.ukitomato.closta.core.interfaces.WorktreeCreated
import dev.ukitomato.closta.core.interfaces.Worktrees
import dev.ukitomato.closta.platforms.intellij.chat.NoticeGroups
import dev.ukitomato.closta.providers.claude.launch.CliPaths
import dev.ukitomato.closta.providers.claude.launch.cliPathsFor

/**
 * The IntelliJ implementation of [IdeBridge] for one project: the six seams, backed by the platform. A light
 * project service, registered by the annotation; callers take it by this class (`project.service`), so plugin.xml
 * needs no `serviceInterface`.
 *
 * Worktrees are offered only when the project has a root; each one created is announced in a balloon (the group
 * declared in plugin.xml) with where it is and how to remove it.
 */
@Service(Service.Level.PROJECT)
class IdeBridgeService(
    private val project: Project,
) : IdeBridge {
    override fun projectBasePath(): String? = project.basePath

    /** The mouth between the CLI's paths and the IDE's, made once from the project's folder. */
    val cliPaths: CliPaths = cliPathsFor(project.basePath, SystemInfo.isWindows)

    override val projectFiles: ProjectFiles = IdeProjectFiles(project)
    override val editorSelections: EditorSelections = IdeEditorSelections(project)
    override val editorEdits: EditorEdits = IdeEditorEdits(project)
    override val diagnostics: Diagnostics = IdeDiagnostics(project)
    override val diffViews: DiffViews = IdeDiffViews(project)
    override val worktrees: Worktrees? =
        project.basePath?.let { root -> NotifyingWorktrees(GitWorktrees(root), ::announce) }

    private fun announce(created: WorktreeCreated) {
        NotificationGroupManager
            .getInstance()
            .getNotificationGroup(NoticeGroups.WORKTREE)
            .createNotification(worktreeNoticeText(created), NotificationType.INFORMATION)
            .notify(project)
    }
}
