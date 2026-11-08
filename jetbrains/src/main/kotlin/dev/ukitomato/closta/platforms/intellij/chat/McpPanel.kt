package dev.ukitomato.closta.platforms.intellij.chat

import com.intellij.icons.AllIcons
import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CustomShortcutSet
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.actionSystem.KeyboardShortcut
import com.intellij.openapi.actionSystem.Presentation
import com.intellij.openapi.application.EDT
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.ide.CopyPasteManager
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.project.Project
import com.intellij.ui.AnimatedIcon
import com.intellij.ui.CollectionListModel
import com.intellij.ui.ColoredListCellRenderer
import com.intellij.ui.ListSpeedSearch
import com.intellij.ui.PopupHandler
import com.intellij.ui.SimpleColoredComponent
import com.intellij.ui.SimpleTextAttributes
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBList
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.components.panels.VerticalLayout
import com.intellij.util.ui.EmptyIcon
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.UIUtil
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.platforms.intellij.session.ClaudeSessionService
import dev.ukitomato.closta.platforms.intellij.ui.noHtml
import dev.ukitomato.closta.platforms.intellij.ui.plainTip
import dev.ukitomato.closta.presenter.view.McpList
import dev.ukitomato.closta.presenter.view.McpRow
import dev.ukitomato.closta.presenter.view.mcpList
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import java.awt.BorderLayout
import java.awt.Component
import java.awt.Point
import java.awt.datatransfer.StringSelection
import java.awt.event.KeyEvent
import javax.swing.Icon
import javax.swing.JComponent
import javax.swing.JList
import javax.swing.JPanel
import javax.swing.KeyStroke
import javax.swing.ScrollPaneConstants

/** The conversation of this project's window that was last in view: the MCP tab shows its session. EDT only. */
@Service(Service.Level.PROJECT)
class LastChat {
    private val state = MutableStateFlow<String?>(null)
    val sessionId: StateFlow<String?> = state.asStateFlow()

    fun shown(sessionId: String) {
        state.value = sessionId
    }
}

/**
 * The tool window's MCP tab: the MCP servers of the session [LastChat] names (its title is under the toolbar), each a
 * row of a list with its state (an icon and the word), its tool count and what went wrong. A server is turned on or off
 * (Enter, Space) and reconnected from the row's menu or the toolbar, for the selected row; typing searches the names.
 * A server that needs a sign-in says to run `/mcp` in a terminal, and the command can be copied; Closta does not sign
 * in. What is shown is [mcpList] of the session's view: nothing of a server's `config` was ever read. [refresh] asks
 * the CLI again.
 */
@Suppress("TooManyFunctions") // one maker per part of the tab, one sender per command
class McpPanel(
    private val project: Project,
    parent: Disposable,
) : JPanel(BorderLayout()) {
    private val scope: CoroutineScope = project.service<ClaudeSessionService>().viewScope(parent)
    private val model = CollectionListModel<McpRow>()
    private val list =
        object : JBList<McpRow>(model) {
            // As wide as the tab: a long error is cut with an ellipsis, not scrolled.
            override fun getScrollableTracksViewportWidth() = true
        }
    private val search = ListSpeedSearch.installOn(list) { it.name }
    private val target = SimpleColoredComponent().apply { ipad = JBUI.insets(0, PAD, ROW_PAD, PAD) }
    private val notice = JBLabel(AllIcons.General.Warning).noHtml()
    private var source: ChatSource? = null

    private val failures =
        CoroutineExceptionHandler {
            _,
            failure,
            ->
            thisLogger().warn("mcp: a command failed (${failure.javaClass.name})")
        }

    private val toggleAction =
        onSelected(ClostaBundle.message("chat.mcp.disable"), AllIcons.Actions.Suspend, ::toggle) { row, presentation ->
            presentation.text = toggleLabel(row)
            presentation.icon = if (row.enabled) AllIcons.Actions.Suspend else AllIcons.Actions.Execute
            row.canToggle
        }

    private val reconnectAction =
        onSelected(ClostaBundle.message("chat.mcp.reconnect"), AllIcons.Actions.Restart, ::reconnect) { row, _ ->
            row.canReconnect
        }

    private val copySignInAction =
        onSelected(COPY_SIGN_IN, AllIcons.Actions.Copy, { copySignIn() }) { row, presentation ->
            presentation.isVisible = row.needsSignIn
            row.needsSignIn
        }

    init {
        background = UIUtil.getListBackground()
        list.cellRenderer = Renderer()
        list.putClientProperty(AnimatedIcon.ANIMATION_IN_RENDERER_ALLOWED, true)
        toggleAction.registerCustomShortcutSet(
            CustomShortcutSet(
                KeyboardShortcut(KeyStroke.getKeyStroke(KeyEvent.VK_ENTER, 0), null),
                KeyboardShortcut(KeyStroke.getKeyStroke(KeyEvent.VK_SPACE, 0), null),
            ),
            list,
        )
        menu()
        add(
            JPanel(VerticalLayout(0)).apply {
                isOpaque = false
                add(toolbar())
                add(target)
            },
            BorderLayout.NORTH,
        )
        add(
            JBScrollPane(
                list,
                ScrollPaneConstants.VERTICAL_SCROLLBAR_AS_NEEDED,
                ScrollPaneConstants.HORIZONTAL_SCROLLBAR_NEVER,
            ).apply { border = JBUI.Borders.empty() },
            BorderLayout.CENTER,
        )
        add(
            JPanel(VerticalLayout(JBUI.scale(ROW_PAD))).apply {
                isOpaque = false
                border = JBUI.Borders.empty(PAD)
                add(notice)
            },
            BorderLayout.SOUTH,
        )
        watch()
    }

    /** Asks the session shown for its servers again (the tab was opened, or Refresh). */
    fun refresh() {
        val shown = source ?: return
        scope.launch(failures) { shown.requestMcpStatus() }
    }

    @OptIn(ExperimentalCoroutinesApi::class)
    private fun watch() {
        val chats = project.service<ChatSessions>()
        scope.launch(Dispatchers.EDT) {
            project
                .service<LastChat>()
                .sessionId
                .map { id -> id?.let(chats::source) }
                .distinctUntilChanged()
                .flatMapLatest { shown ->
                    source = shown
                    if (shown == null) {
                        flowOf(null)
                    } else {
                        refresh()
                        shown.view.map { mcpList(it.transcript.operations) }.distinctUntilChanged()
                    }
                }.collect { list -> show(list) }
        }
    }

    private fun toolbar(): JComponent {
        val group =
            DefaultActionGroup(
                object : DumbAwareAction(
                    ClostaBundle.message("chat.mcp.refresh"),
                    ClostaBundle.message("chat.mcp.refresh.description"),
                    AllIcons.Actions.Refresh,
                ) {
                    override fun actionPerformed(e: AnActionEvent) = refresh()
                },
                toggleAction,
                reconnectAction,
                copySignInAction,
            )
        val toolbar = ActionManager.getInstance().createActionToolbar("ClostaMcp", group, true)
        toolbar.targetComponent = this
        return toolbar.component
    }

    private fun menu() {
        val group = DefaultActionGroup(toggleAction, reconnectAction, copySignInAction)
        list.addMouseListener(
            object : PopupHandler() {
                override fun invokePopup(
                    comp: Component,
                    x: Int,
                    y: Int,
                ) {
                    val at = list.locationToIndex(Point(x, y))
                    if (at < 0 || list.getCellBounds(at, at)?.contains(x, y) != true) return
                    list.selectedIndex = at
                    ActionManager
                        .getInstance()
                        .createActionPopupMenu("ClostaMcp", group)
                        .component
                        .show(comp, x, y)
                }
            },
        )
    }

    private fun show(shown: McpList?) {
        val chosen = list.selectedValue?.name
        val rows = (shown as? McpList.Rows)?.rows.orEmpty()
        model.replaceAll(rows)
        val again = rows.indexOfFirst { it.name == chosen }
        if (again >= 0) list.selectedIndex = again
        target.clear()
        source?.let {
            target.append(
                ClostaBundle.message("chat.mcp.target", it.title),
                SimpleTextAttributes.GRAYED_ATTRIBUTES,
            )
        }
        target.isVisible = source != null
        list.setPaintBusy(shown == McpList.Waiting)
        when (shown) {
            null -> list.emptyText.text = ClostaBundle.message("chat.mcp.noChat")
            McpList.Waiting -> list.emptyText.text = ClostaBundle.message("chat.mcp.loading")
            McpList.Unreadable ->
                list.emptyText.setText(
                    ClostaBundle.message("chat.mcp.unreadable"),
                    SimpleTextAttributes.ERROR_ATTRIBUTES,
                )
            is McpList.Rows -> list.emptyText.text = ClostaBundle.message("chat.mcp.empty")
        }
        val rowsShown = shown as? McpList.Rows
        val below =
            listOfNotNull(
                rowsShown?.notice,
                ClostaBundle.message("chat.mcp.stale").takeIf { rowsShown?.stale == true },
            )
        notice.isVisible = below.isNotEmpty()
        notice.text = below.joinToString(" · ")
    }

    private fun toggleLabel(row: McpRow): String =
        ClostaBundle.message(if (row.enabled) "chat.mcp.disable" else "chat.mcp.enable")

    private fun toggle(row: McpRow) {
        if (!row.canToggle) return
        val shown = source ?: return
        scope.launch(failures) {
            shown.setMcpServerEnabled(row.name, !row.enabled)
            // The CLI answers in order: the list asked for after the switch has the switch's state.
            shown.requestMcpStatus()
        }
    }

    private fun reconnect(row: McpRow) {
        if (!row.canReconnect) return
        val shown = source ?: return
        scope.launch(failures) {
            shown.reconnectMcpServer(row.name)
            shown.requestMcpStatus()
        }
    }

    // Closta does not sign in: the command is put on the clipboard, to be run in a terminal.
    private fun copySignIn() = CopyPasteManager.getInstance().setContents(StringSelection(SIGN_IN_COMMAND))

    /** An action on the selected row; [offered] sets its presentation for the row and says whether it is enabled. */
    private fun onSelected(
        text: String,
        icon: Icon,
        run: (McpRow) -> Unit,
        offered: (McpRow, Presentation) -> Boolean,
    ) = object : DumbAwareAction(text, null, icon) {
        override fun getActionUpdateThread() = ActionUpdateThread.EDT

        override fun update(e: AnActionEvent) {
            val row = list.selectedValue
            e.presentation.isVisible = true
            // A key typed into the search (a space) is the search's, not a command.
            val typing = e.inputEvent is KeyEvent && search.isPopupActive
            e.presentation.isEnabled = row != null && !typing && offered(row, e.presentation)
        }

        override fun actionPerformed(e: AnActionEvent) {
            list.selectedValue?.let(run)
        }
    }

    private inner class Renderer : ColoredListCellRenderer<McpRow>() {
        init {
            ipad = JBUI.insets(ROW_PAD, PAD)
        }

        override fun customizeCellRenderer(
            list: JList<out McpRow>,
            row: McpRow,
            index: Int,
            selected: Boolean,
            hasFocus: Boolean,
        ) {
            icon = iconOf(row)
            append(row.name, SimpleTextAttributes.REGULAR_ATTRIBUTES)
            val state = mcpStatusText(row.status).let { if (row.busy) "$it…" else it }
            append(
                "  $state",
                if (row.status == "failed") {
                    SimpleTextAttributes.ERROR_ATTRIBUTES
                } else {
                    SimpleTextAttributes.REGULAR_ATTRIBUTES
                },
            )
            append("  " + ClostaBundle.message("chat.mcp.tools", row.tools), SimpleTextAttributes.GRAYED_ATTRIBUTES)
            val second = if (row.needsSignIn) ClostaBundle.message("chat.mcp.signIn") else row.error
            second?.let {
                append("  ", SimpleTextAttributes.GRAYED_SMALL_ATTRIBUTES)
                appendWithClipping(
                    it,
                    SimpleTextAttributes.GRAYED_SMALL_ATTRIBUTES,
                    DefaultFragmentTextClipper.INSTANCE,
                )
            }
            toolTipText = plainTip(second)
            val tools = ClostaBundle.message("chat.mcp.tools", row.tools)
            getAccessibleContext().accessibleName = listOfNotNull(row.name, state, tools, second).joinToString(", ")
        }
    }

    private companion object {
        const val PAD = 8
        const val ROW_PAD = 4
        const val SIGN_IN_COMMAND = "claude /mcp"
        val COPY_SIGN_IN: String get() = ClostaBundle.message("chat.mcp.copySignIn")

        fun iconOf(row: McpRow): Icon =
            when {
                row.busy || row.status == "pending" -> AnimatedIcon.Default.INSTANCE
                row.status == "connected" -> AllIcons.Status.Success
                row.status == "failed" -> AllIcons.General.Error
                row.status == "needs-auth" -> AllIcons.General.Warning
                else -> EmptyIcon.ICON_16
            }
    }
}
