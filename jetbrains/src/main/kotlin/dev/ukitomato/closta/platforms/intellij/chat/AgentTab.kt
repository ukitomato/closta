package dev.ukitomato.closta.platforms.intellij.chat

import com.intellij.openapi.Disposable
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import dev.ukitomato.closta.platforms.intellij.session.SessionView
import dev.ukitomato.closta.platforms.intellij.thread.SwingThreadSurface
import dev.ukitomato.closta.platforms.intellij.thread.ThreadSurface
import dev.ukitomato.closta.presenter.view.ThreadRows
import dev.ukitomato.closta.presenter.view.agentTranscript
import javax.swing.JComponent

/**
 * A subagent's conversation in a tab of its own, read-only (the SDK has no way to write to a subagent yet): the
 * messages of the call [toolUseId] drawn on a surface of its own, with no composer. Its approvals are answered on the
 * main tab, where their cards are.
 */
class AgentTab(
    project: Project,
    val toolUseId: String,
    parent: Disposable,
) {
    private val surface: ThreadSurface = SwingThreadSurface(project)
    private val rows = ThreadRows()

    val component: JComponent get() = surface.component

    init {
        Disposer.register(parent, surface)
    }

    /** Draws the subagent's part of [view] (on the EDT). */
    fun show(view: SessionView) {
        val transcript = agentTranscript(view.transcript, toolUseId) ?: return
        surface.show(rows.of(transcript)) { view.transcript.approvals[it] }
    }

    /** Whether the call that started the subagent has its result, and whether that result is an error. */
    fun state(view: SessionView): TabState {
        val call =
            view.transcript.messages.values().firstNotNullOfOrNull { message ->
                message.parts.values().firstOrNull { part ->
                    part is dev.ukitomato.closta.presenter.view.ToolCallRecord && part.toolUseId == toolUseId
                } as? dev.ukitomato.closta.presenter.view.ToolCallRecord
            }
        return tabState(call?.result)
    }

    fun dispose() = Disposer.dispose(surface)
}
