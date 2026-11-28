package dev.ukitomato.closta.platforms.intellij.chat

import com.intellij.ide.actions.OpenFileAction
import com.intellij.notification.NotificationAction
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.EDT
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.fileChooser.FileChooserFactory
import com.intellij.openapi.fileChooser.FileSaverDescriptor
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.platforms.intellij.session.ClaudeSessionService
import dev.ukitomato.closta.platforms.intellij.sessions.SessionItem
import dev.ukitomato.closta.platforms.intellij.sessions.SessionRowAction
import dev.ukitomato.closta.platforms.intellij.ui.plainHtml
import dev.ukitomato.closta.presenter.view.ExportHeader
import dev.ukitomato.closta.presenter.view.sessionName
import dev.ukitomato.closta.presenter.view.transcriptMarkdown
import dev.ukitomato.closta.presenter.view.visible
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.nio.file.Files
import java.nio.file.Path
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

private val STAMP: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")

/** Closta: Export to Markdown: writes the chosen running conversation to a file (the sessions window's menu). */
internal class ExportChatAction : SessionRowAction() {
    // A session with no conversation yet has nothing to write.
    override fun suits(item: SessionItem): Boolean = item is SessionItem.Live

    override fun run(
        e: AnActionEvent,
        item: SessionItem,
    ) {
        val live = item as? SessionItem.Live ?: return
        e.project?.let { exportConversation(it, live.entry.source) }
    }
}

/**
 * Asks where to save [source]'s conversation (the project's folder to start with, `<name>-<date>.md`), writes it in
 * UTF-8, and says where it went in a notification with a link to the file. Only the name of the file and a count
 * leave this function; the conversation and its name are never logged.
 */
internal fun exportConversation(
    project: Project,
    source: ChatSource,
) {
    val view = source.view.value
    val name = sessionName(view.transcript) ?: source.title
    val now = LocalDateTime.now()
    val dialog =
        FileChooserFactory
            .getInstance()
            .createSaveFileDialog(
                FileSaverDescriptor(
                    ClostaBundle.message("chat.export.title"),
                    ClostaBundle.message("chat.export.description"),
                    "md",
                ),
                project,
            )
    val start = project.basePath?.let(Path::of)
    val chosen = dialog.save(start, exportFileName(name, now.toLocalDate().toString())) ?: return
    val target = chosen.file.toPath()
    val header = ExportHeader(name, view.conversation.session?.model, now.format(STAMP))
    val text = transcriptMarkdown(view.transcript, header, exportWords { ClostaBundle.message(it) })
    val once = Disposer.newDisposable(project, "Closta export")
    project.service<ClaudeSessionService>().viewScope(once).launch {
        try {
            val written = runCatching { withContext(Dispatchers.IO) { Files.writeString(target, text) } }
            withContext(Dispatchers.EDT) {
                written.fold(
                    onSuccess = { savedNotice(project, target) },
                    onFailure = { failure ->
                        thisLogger().warn("Closta export not written: ${failure::class.simpleName}")
                        notice(ClostaBundle.message("chat.export.failed"), NotificationType.WARNING).notify(project)
                    },
                )
            }
        } finally {
            // Last: disposing [once] cancels this coroutine's scope.
            withContext(NonCancellable + Dispatchers.EDT) { Disposer.dispose(once) }
        }
    }
}

private fun savedNotice(
    project: Project,
    target: Path,
) {
    notice(
        ClostaBundle.message("chat.export.saved", plainHtml(visible(target.fileName.toString()).text)),
        NotificationType.INFORMATION,
    ).addAction(
        NotificationAction.createSimple(ClostaBundle.message("chat.export.open")) {
            OpenFileAction.openFile(target.toString(), project)
        },
    ).notify(project)
}

private fun notice(
    text: String,
    type: NotificationType,
) = NotificationGroupManager
    .getInstance()
    .getNotificationGroup(NoticeGroups.EXPORT)
    .createNotification(text, type)
