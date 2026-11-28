package dev.ukitomato.closta.platforms.intellij.thread

import com.intellij.openapi.application.ReadAction
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.components.service
import com.intellij.openapi.editor.Document
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.fileEditor.FileEditor
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.EditorNotificationPanel
import com.intellij.ui.EditorNotificationProvider
import com.intellij.ui.EditorNotifications
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.platforms.intellij.chat.ChatSessions
import dev.ukitomato.closta.presenter.view.PlanCard
import dev.ukitomato.closta.presenter.view.PlanGo
import dev.ukitomato.closta.presenter.view.planAnswerWithFeedback
import dev.ukitomato.closta.presenter.view.planCardOf
import dev.ukitomato.closta.presenter.view.planFeedback
import kotlinx.coroutines.launch
import java.util.function.Function
import javax.swing.JComponent

/**
 * The bar over a plan's tab: once the user has edited the plan, "Send as Comments" answers it with the edits as
 * comments for Claude, and "Revert" puts the plan back. What it shows is [planBar] of what the presenter says of the
 * request (answered, still pending) and of the document; it keeps nothing of its own.
 */
class PlanNotifications :
    EditorNotificationProvider,
    DumbAware {
    override fun collectNotificationData(
        project: Project,
        file: VirtualFile,
    ): Function<in FileEditor, out JComponent?>? {
        val tab = planTabOf(project, file) ?: return null
        return Function { editor -> panel(project, file, tab, editor) }
    }

    private fun panel(
        project: Project,
        file: VirtualFile,
        tab: PlanTab,
        editor: FileEditor,
    ): JComponent? {
        val source = project.service<ChatSessions>().source(tab.sessionId)
        val view = source?.view?.value
        val approval = view?.transcript?.approvals?.get(tab.requestId)
        val card = approval?.let { planCardOf(it, PlanGo.AUTO) }
        val document = FileDocumentManager.getInstance().getDocument(file) ?: return null
        val plan = card?.plan
        val feedback = plan?.let { planFeedback(it, textOf(document), "") }
        val bar =
            planBar(
                planPresent = plan != null,
                answered = approval?.outcome != null,
                pending = view?.conversation?.pendingApprovals?.any { it.requestId == tab.requestId } == true,
                sessionRunning = source != null,
                changed = feedback != null,
            )
        return if (bar == PlanBar.HIDDEN || card == null || plan == null) {
            null
        } else {
            EditorNotificationPanel(editor, EditorNotificationPanel.Status.Info).also { panel ->
                if (bar == PlanBar.DISABLED) {
                    panel.text = ClostaBundle.message("thread.plan.bar.edit")
                } else {
                    panel.text = ClostaBundle.message("thread.plan.bar.ready")
                    panel.createActionLabel(ClostaBundle.message("thread.plan.bar.send")) {
                        send(project, tab, card, document)
                    }
                    panel.createActionLabel(ClostaBundle.message("thread.plan.bar.revert")) {
                        revert(project, file, document, plan)
                    }
                }
            }
        }
    }

    private fun send(
        project: Project,
        tab: PlanTab,
        card: PlanCard,
        document: Document,
    ) {
        val source = project.service<ChatSessions>().source(tab.sessionId)
        val approval =
            source
                ?.view
                ?.value
                ?.transcript
                ?.approvals
                ?.get(tab.requestId)
        val feedback = card.plan?.let { planFeedback(it, textOf(document), "") }
        if (source != null && approval != null && feedback != null) {
            val made = planAnswerWithFeedback(card, approval, feedback)
            val answer = CardAnswer(card.requestId, made.decision, made.payload, made.passedOn, made.modeAfter)
            planScope(project).launch { source.respond(answer) }
        }
    }

    private fun revert(
        project: Project,
        file: VirtualFile,
        document: Document,
        plan: String,
    ) {
        WriteCommandAction.runWriteCommandAction(project) { document.setText(plan) }
        EditorNotifications.getInstance(project).updateNotifications(file)
    }
}

private fun textOf(document: Document): String = ReadAction.compute<String, RuntimeException> { document.text }
