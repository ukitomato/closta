package dev.ukitomato.closta.platforms.intellij.thread

import com.intellij.openapi.application.ReadAction
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.Logger
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
import dev.ukitomato.closta.presenter.view.ApprovalRecord
import dev.ukitomato.closta.presenter.view.PlanCard
import dev.ukitomato.closta.presenter.view.PlanGo
import dev.ukitomato.closta.presenter.view.planAnswerWithFeedback
import dev.ukitomato.closta.presenter.view.planCardOf
import dev.ukitomato.closta.presenter.view.planFeedback
import kotlinx.coroutines.CoroutineExceptionHandler
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
        val tab = planTabOf(project, file)
        // The edits are worked out here, off the EDT: the function below only builds the bar.
        val data = tab?.let { barData(project, file, it) }
        return if (tab == null || data == null) null else Function { editor -> panel(project, file, tab, editor, data) }
    }

    /** What the bar shows, read from the presenter and the document. */
    private class BarData(
        val document: Document,
        val approval: ApprovalRecord?,
        val card: PlanCard?,
        val pending: Boolean,
        val sessionRunning: Boolean,
        val changed: Boolean,
    )

    private fun barData(
        project: Project,
        file: VirtualFile,
        tab: PlanTab,
    ): BarData? {
        val source = project.service<ChatSessions>().source(tab.sessionId)
        val view = source?.view?.value
        val approval = view?.transcript?.approvals?.get(tab.requestId)
        val card = approval?.let { planCardOf(it, PlanGo.AUTO) }
        val document = FileDocumentManager.getInstance().getDocument(file) ?: return null
        val feedback =
            card?.plan?.let {
                planFeedback(it, textOf(document), planNote(project.service<PlanNotes>()[tab.requestId]))
            }
        return BarData(
            document,
            approval,
            card,
            pending = view?.conversation?.pendingApprovals?.any { it.requestId == tab.requestId } == true,
            sessionRunning = source != null,
            changed = feedback != null,
        )
    }

    private fun panel(
        project: Project,
        file: VirtualFile,
        tab: PlanTab,
        editor: FileEditor,
        data: BarData,
    ): JComponent? {
        val card = data.card
        val plan = card?.plan
        val bar =
            planBar(
                planPresent = plan != null,
                answered = data.approval?.outcome != null,
                pending = data.pending,
                sessionRunning = data.sessionRunning,
                changed = data.changed,
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
                        send(project, tab, card, data.document)
                    }
                    panel.createActionLabel(ClostaBundle.message("thread.plan.bar.revert")) {
                        revert(project, file, data.document, plan)
                    }
                }
            }
        }
    }

    // The edits are worked out in the send's own coroutine, from the document as it is when the click is handled.
    private fun send(
        project: Project,
        tab: PlanTab,
        card: PlanCard,
        document: Document,
    ) {
        planScope(project).launch(failures) {
            val source = project.service<ChatSessions>().source(tab.sessionId)
            val approval =
                source
                    ?.view
                    ?.value
                    ?.transcript
                    ?.approvals
                    ?.get(tab.requestId)
            val feedback =
                card.plan?.let {
                    planFeedback(it, textOf(document), planNote(project.service<PlanNotes>()[tab.requestId]))
                }
            if (source != null && approval != null && feedback != null) {
                val made = planAnswerWithFeedback(card, approval, feedback)
                source.respond(CardAnswer(card.requestId, made.decision, made.payload, made.passedOn, made.modeAfter))
            }
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

/** A send that throws (a session already closed) is logged by its type and goes no further, as the card's is. */
private val failures =
    CoroutineExceptionHandler { _, failure ->
        Logger
            .getInstance(
                PlanNotifications::class.java,
            ).warn("chat: a plan's comments were not sent (${failure.javaClass.name})")
    }

private fun textOf(document: Document): String = ReadAction.compute<String, RuntimeException> { document.text }
