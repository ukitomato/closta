package dev.ukitomato.closta.platforms.intellij.chat

import com.intellij.icons.AllIcons
import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.application.EDT
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.ide.CopyPasteManager
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.project.Project
import com.intellij.ui.CollectionListModel
import com.intellij.ui.ColoredListCellRenderer
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
import dev.ukitomato.closta.presenter.view.PluginError
import dev.ukitomato.closta.presenter.view.PluginRow
import dev.ukitomato.closta.presenter.view.PluginsView
import dev.ukitomato.closta.presenter.view.ReloadFailure
import dev.ukitomato.closta.presenter.view.builtIn
import dev.ukitomato.closta.presenter.view.pluginsView
import dev.ukitomato.closta.presenter.view.visible
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import java.awt.BorderLayout
import java.awt.datatransfer.StringSelection
import javax.swing.JComponent
import javax.swing.JList
import javax.swing.JPanel
import javax.swing.ScrollPaneConstants

/** A line of the list: a plugin the CLI loaded, or one of the errors it reported while loading. */
private sealed interface PluginLine {
    data class Loaded(
        val row: PluginRow,
    ) : PluginLine

    data class Failed(
        val error: PluginError,
    ) : PluginLine
}

/**
 * The tool window's Plugins tab: the plugins of the session [LastChat] names (its title is under the toolbar), each a
 * row with its name, its version and where it comes from, then the errors the CLI reported while loading. The toolbar
 * reloads them from disk, and what the CLI says of the reload (a refusal while the session is busy, a count of those
 * that did not load) is under the list. Installing and enabling are left to `/plugin` in a terminal, whose command can
 * be copied. What is shown is [pluginsView] of the session's view; every word that comes from the CLI is made visible
 * and drawn as plain text.
 */
class PluginsPanel(
    private val project: Project,
    parent: Disposable,
) : JPanel(BorderLayout()) {
    private val scope: CoroutineScope = project.service<ClaudeSessionService>().viewScope(parent)
    private val model = CollectionListModel<PluginLine>()
    private val list =
        object : JBList<PluginLine>(model) {
            // As wide as the tab: a long message is cut with an ellipsis, not scrolled.
            override fun getScrollableTracksViewportWidth() = true
        }
    private val target = SimpleColoredComponent().apply { ipad = JBUI.insets(0, PAD, ROW_PAD, PAD) }
    private val notice = JBLabel(AllIcons.General.Warning).noHtml()
    private val hint = JBLabel().noHtml()
    private var source: ChatSource? = null

    private val failures =
        CoroutineExceptionHandler {
            _,
            failure,
            ->
            thisLogger().warn("plugins: a command failed (${failure.javaClass.name})")
        }

    init {
        background = UIUtil.getListBackground()
        list.cellRenderer = Renderer()
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
        hint.text = ClostaBundle.message("chat.plugins.hint")
        hint.foreground = UIUtil.getContextHelpForeground()
        add(
            JPanel(VerticalLayout(JBUI.scale(ROW_PAD))).apply {
                isOpaque = false
                border = JBUI.Borders.empty(PAD)
                add(notice)
                add(hint)
            },
            BorderLayout.SOUTH,
        )
        watch()
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
                        shown.view.map { pluginsView(it.transcript.operations) }.distinctUntilChanged()
                    }
                }.collect { view -> show(view) }
        }
    }

    private fun toolbar(): JComponent {
        val reload =
            object : DumbAwareAction(
                ClostaBundle.message("chat.plugins.reload"),
                ClostaBundle.message("chat.plugins.reload.description"),
                AllIcons.Actions.Refresh,
            ) {
                override fun getActionUpdateThread() = ActionUpdateThread.EDT

                override fun update(e: AnActionEvent) {
                    val shown = source
                    e.presentation.isEnabled =
                        shown != null &&
                        !pluginsView(shown.view.value.transcript.operations).reloading
                }

                override fun actionPerformed(e: AnActionEvent) = reload()
            }
        val copy =
            object : DumbAwareAction(
                ClostaBundle.message("chat.plugins.copyCommand"),
                null,
                AllIcons.Actions.Copy,
            ) {
                override fun actionPerformed(e: AnActionEvent) =
                    CopyPasteManager.getInstance().setContents(StringSelection(PLUGIN_COMMAND))
            }
        val toolbar =
            ActionManager.getInstance().createActionToolbar(
                "ClostaPlugins",
                DefaultActionGroup(reload, copy),
                true,
            )
        toolbar.targetComponent = this
        return toolbar.component
    }

    private fun reload() {
        val shown = source ?: return
        scope.launch(failures) { shown.reloadPlugins() }
    }

    private fun show(shown: PluginsView?) {
        val record = shown?.plugins
        model.replaceAll(
            record?.plugins.orEmpty().map { PluginLine.Loaded(it) } +
                record?.errors.orEmpty().map { PluginLine.Failed(it) },
        )
        target.clear()
        source?.let {
            target.append(ClostaBundle.message("chat.plugins.target", it.title), SimpleTextAttributes.GRAYED_ATTRIBUTES)
        }
        target.isVisible = source != null
        list.setPaintBusy(shown?.reloading == true)
        list.emptyText.text =
            ClostaBundle.message(
                when {
                    source == null -> "chat.plugins.noChat"
                    record == null -> "chat.plugins.notListed"
                    else -> "chat.plugins.empty"
                },
            )
        val below = listOfNotNull(failureText(shown?.failure), failedText(record?.failedOnReload))
        notice.isVisible = below.isNotEmpty()
        notice.text = below.joinToString(" · ")
    }

    private fun failureText(failure: ReloadFailure?): String? =
        when (failure) {
            null -> null
            ReloadFailure.Busy -> ClostaBundle.message("chat.plugins.busy")
            is ReloadFailure.Refused -> ClostaBundle.message("chat.plugins.refused", visible(failure.sentence).text)
        }

    private fun failedText(count: Int?): String? =
        count?.let {
            ClostaBundle.message("chat.plugins.failedOnReload", it.toString())
        }

    private inner class Renderer : ColoredListCellRenderer<PluginLine>() {
        init {
            ipad = JBUI.insets(ROW_PAD, PAD)
        }

        override fun customizeCellRenderer(
            list: JList<out PluginLine>,
            line: PluginLine,
            index: Int,
            selected: Boolean,
            hasFocus: Boolean,
        ) {
            when (line) {
                is PluginLine.Loaded -> loaded(line.row)
                is PluginLine.Failed -> failed(line.error)
            }
        }

        private fun loaded(row: PluginRow) {
            icon = EmptyIcon.ICON_16
            val name = visible(row.name).text
            val version = row.version?.let { visible(it).text }
            val origin =
                if (row.builtIn) ClostaBundle.message("chat.plugins.builtIn") else row.source?.let { visible(it).text }
            append(name, SimpleTextAttributes.REGULAR_ATTRIBUTES)
            version?.let { append("  $it", SimpleTextAttributes.REGULAR_ATTRIBUTES) }
            origin?.let {
                append("  ", SimpleTextAttributes.GRAYED_SMALL_ATTRIBUTES)
                appendWithClipping(
                    it,
                    SimpleTextAttributes.GRAYED_SMALL_ATTRIBUTES,
                    DefaultFragmentTextClipper.INSTANCE,
                )
            }
            toolTipText = plainTip(origin)
            getAccessibleContext().accessibleName = listOfNotNull(name, version, origin).joinToString(", ")
        }

        private fun failed(error: PluginError) {
            icon = AllIcons.General.Warning
            val plugin = visible(error.plugin).text
            val message = visible(error.message).text
            append(plugin, SimpleTextAttributes.REGULAR_ATTRIBUTES)
            append("  ", SimpleTextAttributes.GRAYED_SMALL_ATTRIBUTES)
            appendWithClipping(message, SimpleTextAttributes.ERROR_ATTRIBUTES, DefaultFragmentTextClipper.INSTANCE)
            toolTipText = plainTip(visible(error.type).text + ": " + message)
            getAccessibleContext().accessibleName = "$plugin, $message"
        }
    }

    private companion object {
        const val PAD = 8
        const val ROW_PAD = 4
        const val PLUGIN_COMMAND = "claude /plugin"
    }
}
