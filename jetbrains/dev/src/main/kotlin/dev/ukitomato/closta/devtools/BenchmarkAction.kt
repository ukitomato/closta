package dev.ukitomato.closta.devtools

import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.EDT
import com.intellij.openapi.components.service
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.platform.ide.progress.withBackgroundProgress
import com.intellij.platform.util.progress.reportRawProgress
import dev.ukitomato.closta.platforms.intellij.session.ClaudeSessionService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * "Closta: Measure Performance": runs [ChatBenchmark] and opens its report. A development aid: shown only in an
 * internal IDE or one started with `-Dclosta.dev=true`.
 */
class BenchmarkAction :
    AnAction(),
    DumbAware {
    override fun actionPerformed(event: AnActionEvent) {
        val project = event.project ?: return
        val go =
            Messages.showOkCancelDialog(
                project,
                "Opens a huge session in the baseline editor and in the chat, scrolls it automatically and " +
                    "streams a reply. It takes several minutes. Do not touch the mouse or the keyboard until it " +
                    "is done.",
                "Closta: Measure Performance",
                "Start",
                "Cancel",
                null,
            ) == Messages.OK
        if (go) start(project)
    }

    private fun start(project: Project) {
        project.service<ClaudeSessionService>().viewScope(project).launch {
            withBackgroundProgress(project, "Closta: Measure Performance") {
                val report =
                    reportRawProgress { reporter ->
                        ChatBenchmark(project).run { step -> reporter.text(step) }
                    }
                withContext(Dispatchers.EDT) {
                    LocalFileSystem.getInstance().refreshAndFindFileByNioFile(report)?.let {
                        FileEditorManager.getInstance(project).openFile(it, true)
                    }
                    NotificationGroupManager
                        .getInstance()
                        .getNotificationGroup("Closta.Dev")
                        .createNotification("Performance measurement finished: $report", NotificationType.INFORMATION)
                        .notify(project)
                }
            }
        }
    }

    override fun update(event: AnActionEvent) {
        event.presentation.isEnabledAndVisible = event.project != null && developmentAidsShown()
    }

    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT
}

/** Whether the development aids are offered: an internal IDE, or one started with `-Dclosta.dev=true`. */
internal fun developmentAidsShown(): Boolean =
    System.getProperty("closta.dev") == "true" || ApplicationManager.getApplication().isInternal
