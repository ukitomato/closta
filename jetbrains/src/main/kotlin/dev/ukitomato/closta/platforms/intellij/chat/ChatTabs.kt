package dev.ukitomato.closta.platforms.intellij.chat

import com.intellij.icons.AllIcons
import com.intellij.openapi.Disposable
import com.intellij.openapi.project.Project
import com.intellij.ui.AnimatedIcon
import com.intellij.ui.InplaceButton
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBTabbedPane
import com.intellij.util.ui.JBUI
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.platforms.intellij.session.SessionView
import dev.ukitomato.closta.platforms.intellij.ui.noHtml
import dev.ukitomato.closta.platforms.intellij.ui.plainHtml
import dev.ukitomato.closta.platforms.intellij.ui.plainTip
import java.awt.BorderLayout
import java.awt.FlowLayout
import javax.swing.JComponent
import javax.swing.JPanel

/**
 * The main thread and the subagent tabs opened from it. With no subagent tab only the main thread is shown (no tab
 * strip); opening one shows the strip, Main first. A subagent tab closes with its ✕; its dot says running or done.
 */
class ChatTabs(
    private val project: Project,
    private val main: JComponent,
    private val parent: Disposable,
) {
    private val agents = LinkedHashMap<String, Pair<AgentTab, JBLabel>>()
    private val tabs = JBTabbedPane()
    private var last: SessionView? = null

    /**
     * Told, before a subagent's tab goes, what had the keyboard that goes with it: the tab shown, or the strip when
     * the last one goes (the main thread moves out of it).
     */
    var onLetGo: (lostFrom: JComponent) -> Unit = {}

    /** Told whether the main thread is the tab shown: a subagent's tab is read-only and has no composer. */
    var onMainShown: (Boolean) -> Unit = {}

    val component: JComponent = JPanel(BorderLayout()).apply { add(main, BorderLayout.CENTER) }

    init {
        tabs.addChangeListener { if (agents.isNotEmpty()) onMainShown(tabs.selectedComponent == main) }
    }

    /** Opens (or selects) the tab of the subagent the call [toolUseId] started. */
    fun open(
        toolUseId: String,
        title: String,
    ) {
        val open = agents[toolUseId]
        if (open != null) {
            tabs.selectedComponent = open.first.component
            return
        }
        val tab = AgentTab(project, toolUseId, parent)
        val label =
            JBLabel(
                tabTitle(title, TITLE_MAX, ClostaBundle.message("chat.subagent")),
                AnimatedIcon.Default.INSTANCE,
                JBLabel.LEFT,
            ).noHtml().apply { toolTipText = plainTip(title) }
        agents[toolUseId] = tab to label
        if (agents.size == 1) {
            component.remove(main)
            tabs.addTab(ClostaBundle.message("chat.tabs.main"), main)
            component.add(tabs, BorderLayout.CENTER)
        }
        tabs.addTab("<html>${plainHtml(label.text)}</html>", tab.component)
        val index = tabs.indexOfComponent(tab.component)
        tabs.setTabComponentAt(index, tabHead(label) { close(toolUseId) })
        tabs.selectedIndex = index
        last?.let { show(it) }
        component.revalidate()
        component.repaint()
    }

    /** Draws [view] into every subagent tab (on the EDT). */
    fun show(view: SessionView) {
        last = view
        for ((tab, label) in agents.values) {
            tab.show(view)
            label.icon =
                when (tab.state(view)) {
                    TabState.RUNNING -> AnimatedIcon.Default.INSTANCE
                    TabState.DONE -> AllIcons.RunConfigurations.TestPassed
                    TabState.FAILED -> AllIcons.RunConfigurations.TestError
                }
        }
    }

    private fun close(toolUseId: String) {
        val (tab, _) = agents[toolUseId] ?: return
        when {
            agents.size == 1 -> onLetGo(tabs)
            tabs.selectedComponent === tab.component -> onLetGo(tab.component)
        }
        agents.remove(toolUseId)
        tabs.remove(tab.component)
        tab.dispose()
        if (agents.isEmpty()) {
            tabs.removeAll()
            component.remove(tabs)
            component.add(main, BorderLayout.CENTER)
            onMainShown(true)
        }
        component.revalidate()
        component.repaint()
    }

    private fun tabHead(
        label: JBLabel,
        close: () -> Unit,
    ): JComponent =
        JPanel(FlowLayout(FlowLayout.LEFT, JBUI.scale(2), 0)).apply {
            isOpaque = false
            add(label)
            add(InplaceButton(ClostaBundle.message("chat.tabs.close"), AllIcons.Actions.Close) { close() })
        }

    private companion object {
        const val TITLE_MAX = 32
    }
}
