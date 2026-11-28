package dev.ukitomato.closta.platforms.intellij.chat

import com.intellij.openapi.Disposable
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.popup.JBPopup
import com.intellij.openapi.ui.popup.JBPopupFactory
import com.intellij.openapi.ui.popup.JBPopupListener
import com.intellij.openapi.ui.popup.LightweightWindowEvent
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.components.JBTextArea
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.UIUtil
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.platforms.intellij.session.SessionView
import dev.ukitomato.closta.platforms.intellij.thread.ThreadStyle
import dev.ukitomato.closta.platforms.intellij.ui.noHtml
import dev.ukitomato.closta.presenter.view.OutputPoll
import dev.ukitomato.closta.presenter.view.RunningTask
import dev.ukitomato.closta.presenter.view.outputPoll
import dev.ukitomato.closta.presenter.view.visible
import java.awt.BorderLayout
import java.awt.Dimension
import javax.swing.JPanel
import javax.swing.SwingUtilities
import javax.swing.Timer

/**
 * The end of a background shell command's output, in a window of its own. It asks the CLI for the output when it opens
 * and then once a second, and sends the next request only when the last one is answered; it stops when the task has
 * ended and its last output was read, when the CLI refuses, and when it is closed. One per conversation: opening it for
 * another task closes the first. What it shows is the presenter's `output` for its task; the only state here is the
 * clock and what the area last showed.
 */
class TaskOutputPopup(
    private val project: Project,
    private val view: () -> SessionView,
    private val ask: (taskId: String) -> Unit,
) : Disposable {
    private val title = JBLabel().noHtml().apply { border = JBUI.Borders.emptyBottom(GAP) }
    private val truncated = JBLabel().noHtml().apply { foreground = UIUtil.getContextHelpForeground() }
    private val stopped =
        JBLabel(ClostaBundle.message("chat.taskOutput.stopped")).noHtml().apply {
            foreground = UIUtil.getContextHelpForeground()
            isVisible = false
        }
    private val area =
        JBTextArea().apply {
            isEditable = false
            lineWrap = false
            font = ThreadStyle.mono
        }
    private val scroll = JBScrollPane(area)
    private val content =
        JPanel(BorderLayout(0, GAP)).apply {
            border = JBUI.Borders.empty(GAP * 2)
            preferredSize = Dimension(JBUI.scale(WIDTH), JBUI.scale(HEIGHT))
            add(
                JPanel(BorderLayout()).apply {
                    isOpaque = false
                    add(title, BorderLayout.NORTH)
                    add(truncated, BorderLayout.CENTER)
                    add(stopped, BorderLayout.SOUTH)
                },
                BorderLayout.NORTH,
            )
            add(scroll, BorderLayout.CENTER)
        }
    private val clock = Timer(POLL_MS) { tick() }
    private var popup: JBPopup? = null
    private var taskId: String? = null
    private var lastAsked = false
    private var launchesAtOpen = 0
    private var shown: String? = null

    /** Opens the output of [task], or moves the open one to it. */
    fun open(task: RunningTask) {
        close()
        taskId = task.taskId
        lastAsked = false
        shown = null
        launchesAtOpen = view().transcript.operations.launches
        stopped.isVisible = false
        title.text = ClostaBundle.message("chat.taskOutput.title", visible(task.title.ifBlank { task.kind }).text)
        truncated.isVisible = false
        area.text = ClostaBundle.message("chat.taskOutput.waiting")
        val made =
            JBPopupFactory
                .getInstance()
                .createComponentPopupBuilder(content, area)
                .setResizable(true)
                .setMovable(true)
                .setRequestFocus(true)
                .setCancelOnClickOutside(false)
                .setCancelKeyEnabled(true)
                .addListener(
                    object : JBPopupListener {
                        override fun onClosed(event: LightweightWindowEvent) {
                            clock.stop()
                            taskId = null
                        }
                    },
                ).createPopup()
        popup = made
        made.showCenteredInCurrentWindow(project)
        ask(task.taskId)
        clock.start()
    }

    private fun close() {
        clock.stop()
        popup?.takeIf { !it.isDisposed }?.cancel()
        popup = null
        taskId = null
    }

    private fun tick() {
        val id = taskId ?: return clock.stop()
        val now = view()
        val operations = now.transcript.operations
        val output = operations.output?.takeIf { it.taskId == id }
        draw(output)
        // The task id is the CLI's own: once that CLI is gone or replaced, nothing is asked of the next one with it.
        val gone = operations.processEnded || operations.launches != launchesAtOpen
        stopped.isVisible = gone
        val step =
            outputPoll(
                asking = operations.outputAsk != null,
                live =
                    now.transcript.background.live
                        .any { it.taskId == id },
                lastAsked = lastAsked,
                failed = output?.failure != null,
                stopped = gone,
            )
        when (step) {
            OutputPoll.ASK -> ask(id)
            OutputPoll.ASK_LAST -> {
                lastAsked = true
                ask(id)
            }
            OutputPoll.STOP -> clock.stop()
            OutputPoll.WAIT -> Unit
        }
    }

    private fun draw(output: dev.ukitomato.closta.presenter.view.TaskOutputRecord?) {
        output ?: return
        truncated.isVisible = output.truncated && output.failure == null
        truncated.text = ClostaBundle.message("chat.taskOutput.truncated", output.totalBytes.toString())
        val text =
            when {
                output.failure != null ->
                    ClostaBundle.message("chat.taskOutput.failed", visible(output.failure).text)
                output.text.isEmpty() -> ClostaBundle.message("chat.taskOutput.empty")
                else -> output.text
            }
        if (text == shown) return
        shown = text
        val bar = scroll.verticalScrollBar
        val atBottom = bar.value + bar.model.extent >= bar.maximum - BOTTOM_SLACK
        area.text = text
        if (atBottom) SwingUtilities.invokeLater { bar.value = bar.maximum }
    }

    override fun dispose() = close()

    private companion object {
        const val GAP = 4
        const val WIDTH = 640
        const val HEIGHT = 320
        const val POLL_MS = 1000
        const val BOTTOM_SLACK = 4
    }
}
