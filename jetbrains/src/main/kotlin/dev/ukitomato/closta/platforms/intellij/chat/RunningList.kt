package dev.ukitomato.closta.platforms.intellij.chat

import com.intellij.icons.AllIcons
import com.intellij.ui.AnimatedIcon
import com.intellij.ui.ColoredListCellRenderer
import com.intellij.ui.SimpleTextAttributes
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBList
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.UIUtil
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.platforms.intellij.thread.ThreadStyle
import dev.ukitomato.closta.presenter.view.RunningTask
import java.awt.BorderLayout
import java.awt.event.KeyAdapter
import java.awt.event.KeyEvent
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import javax.swing.DefaultListModel
import javax.swing.JComponent
import javax.swing.JList
import javax.swing.JPanel
import javax.swing.ListSelectionModel
import javax.swing.Timer

/**
 * The running list above the composer: a heading that folds the list to one line (a click, or Enter or Space on it),
 * then a row per running subagent or shell, a child one step in under its parent. The row under the mouse and the row
 * chosen show a stop icon, which stops the task when it is pressed; Delete and the row's context menu stop it too.
 * ↑↓ choose and Enter (or a double click) opens the subagent's tab. It disappears when nothing runs; folded, its
 * spinners stop. It only shows [show]'s list.
 */
class RunningList(
    private val onOpen: (RunningTask) -> Unit,
    private val onStop: (RunningTask) -> Unit,
) {
    private val model = DefaultListModel<RunningTask>()
    private val list = JBList(model)
    private val heading = JBLabel()
    private var folded = false
    private var hovered = -1
    private var overStop = false
    private val renderer = Renderer()
    private val spin = Timer(SPIN_MS) { list.repaint() }

    val component: JComponent =
        JPanel(BorderLayout()).apply {
            isOpaque = false
            border = JBUI.Borders.empty(0, ThreadStyle.INSET)
            isVisible = false
        }

    init {
        heading.foreground = UIUtil.getContextHelpForeground()
        heading.border = JBUI.Borders.empty(2, 0)
        heading.isFocusable = true
        heading.addMouseListener(
            object : MouseAdapter() {
                // checkUi: allow clickable-label — keys fold it, but a reader hears a label: ActionLink later (P4)
                override fun mouseClicked(e: MouseEvent) = fold()
            },
        )
        heading.addKeyListener(
            object : KeyAdapter() {
                override fun keyPressed(e: KeyEvent) {
                    if (e.keyCode == KeyEvent.VK_ENTER || e.keyCode == KeyEvent.VK_SPACE) fold()
                }
            },
        )
        heading.addFocusListener(
            object : java.awt.event.FocusAdapter() {
                override fun focusGained(e: java.awt.event.FocusEvent) {
                    heading.border = focusedHeading()
                }

                override fun focusLost(e: java.awt.event.FocusEvent) {
                    heading.border = JBUI.Borders.empty(2, 0)
                }
            },
        )
        list.selectionMode = ListSelectionModel.SINGLE_SELECTION
        list.cellRenderer = renderer
        list.visibleRowCount = MAX_ROWS
        list.addKeyListener(
            object : KeyAdapter() {
                override fun keyPressed(e: KeyEvent) {
                    when (e.keyCode) {
                        KeyEvent.VK_ENTER -> list.selectedValue?.let(onOpen)
                        KeyEvent.VK_DELETE -> list.selectedValue?.let(onStop)
                    }
                }
            },
        )
        val mouse =
            object : MouseAdapter() {
                override fun mouseMoved(e: MouseEvent) {
                    val at = rowAt(e) ?: -1
                    val stop = at >= 0 && onStopIcon(at, e)
                    if (at != hovered || stop != overStop) {
                        hovered = at
                        overStop = stop
                        list.repaint()
                    }
                }

                override fun mouseExited(e: MouseEvent) {
                    hovered = -1
                    overStop = false
                    list.repaint()
                }

                // checkUi: allow clickable-label — a list's rows: Enter opens and Delete stops the chosen row too
                override fun mouseClicked(e: MouseEvent) {
                    if (e.isPopupTrigger || e.button != MouseEvent.BUTTON1) return
                    val index = rowAt(e) ?: return
                    val task = model.get(index)
                    when {
                        onStopIcon(index, e) -> onStop(task)
                        e.clickCount == 2 -> onOpen(task)
                    }
                }

                override fun mousePressed(e: MouseEvent) = menu(e)

                override fun mouseReleased(e: MouseEvent) = menu(e)
            }
        list.addMouseListener(mouse)
        list.addMouseMotionListener(mouse)
        component.add(heading, BorderLayout.NORTH)
        component.add(list, BorderLayout.CENTER)
    }

    private fun fold() {
        folded = !folded
        layout()
    }

    private fun focusedHeading() =
        JBUI.Borders.compound(
            JBUI.Borders.customLineBottom(JBUI.CurrentTheme.Focus.focusColor()),
            JBUI.Borders.empty(2, 0, 1, 0),
        )

    private fun rowAt(e: MouseEvent): Int? =
        list.locationToIndex(e.point).takeIf { it >= 0 && list.getCellBounds(it, it)?.contains(e.point) == true }

    /** Whether [e] is on the stop icon of row [index], where the row's renderer lays the icon out. */
    private fun onStopIcon(
        index: Int,
        e: MouseEvent,
    ): Boolean {
        val bounds = list.getCellBounds(index, index) ?: return false
        val row = renderer.getListCellRendererComponent(list, model.get(index), index, true, false)
        row.setBounds(0, 0, bounds.width, bounds.height)
        row.doLayout()
        val icon = renderer.stopBounds()
        icon.translate(bounds.x, bounds.y)
        return icon.contains(e.point)
    }

    /** The row's context menu, with Stop, on the platform's popup trigger. */
    private fun menu(e: MouseEvent) {
        if (!e.isPopupTrigger) return
        val index = rowAt(e) ?: return
        list.selectedIndex = index
        val task = model.get(index)
        val stop =
            object : com.intellij.openapi.project.DumbAwareAction(ClostaBundle.message("chat.running.stop")) {
                override fun actionPerformed(event: com.intellij.openapi.actionSystem.AnActionEvent) = onStop(task)
            }
        com.intellij.openapi.actionSystem.ActionManager
            .getInstance()
            .createActionPopupMenu(
                PLACE,
                com.intellij.openapi.actionSystem
                    .DefaultActionGroup(stop),
            ).component
            .show(list, e.x, e.y)
    }

    /** Shows [tasks] (on the EDT); keeps the selection on the same task when it is still there. */
    fun show(tasks: List<RunningTask>) {
        val chosen = list.selectedValue?.taskId
        if (tasks != (0 until model.size()).map(model::get)) {
            model.clear()
            tasks.forEach(model::addElement)
            tasks.indexOfFirst { it.taskId == chosen }.takeIf { it >= 0 }?.let(list::setSelectedIndex)
        }
        component.isVisible = tasks.isNotEmpty()
        layout()
    }

    fun stop() = spin.stop()

    private fun layout() {
        val tasks = (0 until model.size()).map(model::get)
        val agents = tasks.count { it.kind == AGENT }
        val shells = tasks.count { it.kind == SHELL }
        val others = tasks.size - agents - shells
        val summary =
            listOfNotNull(
                ClostaBundle.message("chat.running.subagents", agents).takeIf { agents > 0 },
                ClostaBundle.message("chat.running.shells", shells).takeIf { shells > 0 },
                ClostaBundle.message("chat.running.others", others).takeIf { others > 0 },
            ).joinToString(" · ")
        heading.icon = if (folded) AllIcons.General.ArrowRight else AllIcons.General.ArrowDown
        heading.text =
            if (folded) {
                ClostaBundle.message("chat.running.headingFolded", summary)
            } else {
                ClostaBundle.message("chat.running.heading", tasks.size)
            }
        list.isVisible = !folded
        // The spinners are drawn again only while they can be seen.
        if (folded || model.isEmpty) {
            spin.stop()
        } else if (!spin.isRunning) {
            spin.start()
        }
        component.revalidate()
    }

    private inner class Renderer : javax.swing.ListCellRenderer<RunningTask> {
        private val text = Text()
        private val stopIcon = JBLabel(AllIcons.Actions.Suspend).apply { border = JBUI.Borders.emptyRight(PAD) }
        private val row =
            JPanel(BorderLayout()).apply {
                add(text, BorderLayout.CENTER)
                add(stopIcon, BorderLayout.EAST)
            }

        override fun getListCellRendererComponent(
            list: JList<out RunningTask>,
            task: RunningTask,
            index: Int,
            selected: Boolean,
            hasFocus: Boolean,
        ): JComponent {
            text.getListCellRendererComponent(list, task, index, selected, hasFocus)
            row.background = text.background
            // Shown on the row under the mouse and on the chosen one, so the keyboard sees what Delete does.
            stopIcon.isVisible = index == hovered || selected
            row.toolTipText =
                when {
                    index == hovered && overStop -> ClostaBundle.message("chat.running.stop")
                    task.kind == AGENT -> ClostaBundle.message("chat.running.agent.tooltip")
                    else -> null
                }
            return row
        }

        /** Where the stop icon is in the row last laid out. */
        fun stopBounds(): java.awt.Rectangle = stopIcon.bounds
    }

    private class Text : ColoredListCellRenderer<RunningTask>() {
        override fun customizeCellRenderer(
            list: JList<out RunningTask>,
            task: RunningTask,
            index: Int,
            selected: Boolean,
            hasFocus: Boolean,
        ) {
            ipad = JBUI.insetsLeft(INDENT * task.depth)
            icon = AnimatedIcon.Default.INSTANCE
            append(task.title.ifBlank { task.kind })
            val kind =
                when (task.kind) {
                    AGENT -> ClostaBundle.message("chat.subagent")
                    SHELL -> ClostaBundle.message("chat.running.shell")
                    else -> task.kind
                }
            append("  " + listOfNotNull(kind, task.detail).joinToString(" · "), SimpleTextAttributes.GRAYED_ATTRIBUTES)
            task.elapsedMs?.let { append("  ${it / MS_PER_S}s", SimpleTextAttributes.GRAYED_SMALL_ATTRIBUTES) }
        }
    }

    private companion object {
        const val AGENT = "agent"
        const val SHELL = "shell"
        const val PAD = 8
        const val INDENT = 16
        const val MAX_ROWS = 6
        const val PLACE = "ClostaRunningList"
        const val SPIN_MS = 125
        const val MS_PER_S = 1000
    }
}
