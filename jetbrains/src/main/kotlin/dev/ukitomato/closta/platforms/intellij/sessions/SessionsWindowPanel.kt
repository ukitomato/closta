package dev.ukitomato.closta.platforms.intellij.sessions

import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.application.EDT
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.FileEditorManagerListener
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.ui.DoubleClickListener
import com.intellij.ui.OnePixelSplitter
import com.intellij.ui.PopupHandler
import com.intellij.ui.ScrollPaneFactory
import com.intellij.ui.content.ContentManagerEvent
import com.intellij.ui.content.ContentManagerListener
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.platforms.intellij.chat.ChatDirectory
import dev.ukitomato.closta.platforms.intellij.chat.ChatVirtualFile
import dev.ukitomato.closta.platforms.intellij.chat.TOOL_WINDOW_ID
import dev.ukitomato.closta.platforms.intellij.chat.wasRunningMarks
import dev.ukitomato.closta.platforms.intellij.session.ClaudeSessionService
import dev.ukitomato.closta.presenter.view.WindowGroup
import dev.ukitomato.closta.presenter.view.WindowRow
import dev.ukitomato.closta.presenter.view.keptSelection
import dev.ukitomato.closta.presenter.view.nextWaiting
import dev.ukitomato.closta.presenter.view.windowRows
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.awt.BorderLayout
import java.awt.Component
import java.awt.Point
import java.awt.event.KeyAdapter
import java.awt.event.KeyEvent
import java.awt.event.MouseEvent
import javax.swing.JComponent
import javax.swing.JPanel
import javax.swing.ScrollPaneConstants

/**
 * The bottom Closta tool window's one tab, laid out like the Services view: the sessions of every open project as a
 * tree on the left ([SessionsTree]), under the headings of their state, with a toolbar above it; the chosen session's
 * detail on the right ([SessionDetailPanel]). The sessions of this project that ran when it last closed are offered
 * under their own heading, to be resumed.
 *
 * A session opens on a double click or Enter, in the place already showing it (else an editor tab), in its own
 * project's window; its menu opens it in either place, stops it, or archives it.
 *
 * The only state held here is the chosen session's id: every change of [ChatDirectory.entries] redraws the rows, and
 * the selection follows that id ([keptSelection]), never a row's position.
 */
class SessionsWindowPanel(
    private val project: Project,
    window: ToolWindow,
    parent: Disposable,
    // checkUi: allow unnamed-component — a container: the tree and the detail in it carry their own names
) : JPanel(BorderLayout()) {
    private val directory = service<ChatDirectory>()
    private val detail = SessionDetailPanel(project, window, parent)
    private val tree = SessionsTree(project, ::chosen)
    private val actions = SessionsActions(project, tree::selected, ::render)
    private var entries: List<ChatDirectory.Entry> = emptyList()
    private var selectedId: String? = null

    /** The saved sessions' titles, read once, to name the sessions that ran when the project last closed. */
    private var savedTitles: Map<String, String> = emptyMap()

    init {
        val left =
            JPanel(BorderLayout()).apply {
                add(actions.toolbar(tree.component), BorderLayout.NORTH)
                val scroll = ScrollPaneFactory.createScrollPane(tree.component, true)
                // The rows fit the width (SessionsTree): nothing to scroll to sideways.
                scroll.horizontalScrollBarPolicy = ScrollPaneConstants.HORIZONTAL_SCROLLBAR_NEVER
                add(scroll, BorderLayout.CENTER)
            }
        val splitter =
            OnePixelSplitter(false, SPLIT_KEY, SPLIT).apply {
                firstComponent = left
                secondComponent = detail
            }
        add(splitter, BorderLayout.CENTER)
        wire()
        val scope = project.service<ClaudeSessionService>().viewScope(parent)
        scope.launch(Dispatchers.EDT) {
            directory.entries.collect { now ->
                entries = now
                render()
            }
        }
        if (project.wasRunningMarks().isNotEmpty()) loadSavedTitles(scope)
        followPlacements(scope, parent)
    }

    /** The id of the chosen session, if one is. */
    fun selectedSessionId(): String? = selectedId

    /**
     * Chooses the next session that waits, after the chosen one (wrapping); false, and nothing chosen, when none waits.
     */
    fun selectNextWaiting(): Boolean {
        val waiting = tree.items().filter { it.windowGroup() == WindowGroup.WAITING }.map { it.sessionId }
        val next = nextWaiting(selectedId, waiting) ?: return false
        tree.select(next)
        return true
    }

    /** Chooses the session [sessionId], as a click on its row would. For the gallery of the dev tools plugin only. */
    fun select(sessionId: String) = tree.select(sessionId)

    /** Puts the keyboard in the chosen session's wait, now or once it is drawn ([SessionDetailPanel.focusAnswer]). */
    fun focusAnswer() = detail.focusAnswer()

    /** What takes the focus when the tab is shown. */
    fun preferredFocus(): JComponent = tree.component

    private fun chosen(item: SessionItem?) {
        selectedId = item?.sessionId
        detail.show(item)
    }

    private fun render() {
        val open = entries.mapTo(HashSet()) { it.sessionId }
        val live = entries.map { SessionItem.Live(it) }
        val marks =
            (project.wasRunningMarks() - open).toSortedMap().map { (id, mark) ->
                SessionItem.Mark(id, markTitle(savedTitles[id] ?: mark.title), mark.workingDirectory)
            }
        val rows = windowRows(live + marks, SessionItem::windowGroup, SessionItem::isUnread)
        selectedId = keptSelection(selectedId, rows.mapNotNull { (it as? WindowRow.Item)?.item?.sessionId })
        tree.show(rows, selectedId)
        detail.show(tree.selected())
    }

    private fun wire() {
        val component = tree.component
        object : DoubleClickListener() {
            override fun onDoubleClick(event: MouseEvent): Boolean {
                val item = tree.itemAt(event.point) ?: return false
                openItem(project, item)
                return true
            }
        }.installOn(component)
        component.addKeyListener(
            object : KeyAdapter() {
                override fun keyPressed(event: KeyEvent) {
                    if (event.keyCode != KeyEvent.VK_ENTER) return
                    val item = tree.selected() ?: return
                    openItem(project, item)
                    event.consume()
                }
            },
        )
        component.addMouseListener(
            object : PopupHandler() {
                override fun invokePopup(
                    comp: Component,
                    x: Int,
                    y: Int,
                ) {
                    val item = tree.itemAt(Point(x, y)) ?: return
                    tree.select(item.sessionId)
                    ActionManager
                        .getInstance()
                        .createActionPopupMenu(SessionsActions.PLACE, actions.menuFor(item))
                        .component
                        .show(comp, x, y)
                }
            },
        )
    }

    private fun loadSavedTitles(scope: CoroutineScope) {
        scope.launch {
            val titles =
                try {
                    project.service<ClaudeSessionService>().savedSessions().associate { it.id to it.title }
                } catch (cancel: CancellationException) {
                    throw cancel
                } catch (
                    @Suppress("TooGenericExceptionCaught") failure: Exception,
                ) {
                    thisLogger().warn("sessions: the saved sessions could not be listed (${failure.javaClass.name})")
                    emptyMap()
                }
            withContext(Dispatchers.EDT) {
                savedTitles = titles
                render()
            }
        }
    }

    // What a row shows at its right edge changes without the directory telling: the time passes, and a conversation is
    // opened in or closed from a tab or the sidebar. Those of this project are followed as they happen; the clock (and
    // another project's places) every TICK_MS.
    private fun followPlacements(
        scope: CoroutineScope,
        parent: Disposable,
    ) {
        project.messageBus.connect(parent).subscribe(
            FileEditorManagerListener.FILE_EDITOR_MANAGER,
            object : FileEditorManagerListener {
                override fun fileOpened(
                    source: FileEditorManager,
                    file: VirtualFile,
                ) {
                    if (file is ChatVirtualFile) tree.refresh()
                }

                override fun fileClosed(
                    source: FileEditorManager,
                    file: VirtualFile,
                ) {
                    if (file is ChatVirtualFile) tree.refresh()
                }
            },
        )
        val sidebar = ToolWindowManager.getInstance(project).getToolWindow(TOOL_WINDOW_ID)
        val tabs =
            object : ContentManagerListener {
                override fun contentAdded(event: ContentManagerEvent) = tree.refresh()

                override fun contentRemoved(event: ContentManagerEvent) = tree.refresh()
            }
        sidebar?.addContentManagerListener(tabs)
        Disposer.register(parent) { sidebar?.contentManagerIfCreated?.removeContentManagerListener(tabs) }
        scope.launch(Dispatchers.EDT) {
            while (true) {
                delay(TICK_MS)
                tree.refresh()
            }
        }
    }

    private companion object {
        val MARK_TITLE: String get() = ClostaBundle.message("chat.sessions.mark.title")

        /** A mark's own title, or the marks' common one when it has none (or a blank one). */
        fun markTitle(title: String?): String = title?.takeIf { it.isNotBlank() } ?: MARK_TITLE

        const val SPLIT_KEY = "closta.sessions.split"
        const val SPLIT = 0.3f
        const val TICK_MS = 30_000L
    }
}
