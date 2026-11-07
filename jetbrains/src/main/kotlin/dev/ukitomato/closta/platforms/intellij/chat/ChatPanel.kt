package dev.ukitomato.closta.platforms.intellij.chat

import com.intellij.icons.AllIcons
import com.intellij.ide.DataManager
import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.EDT
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.options.ShowSettingsUtil
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.MessageType
import com.intellij.openapi.ui.popup.Balloon
import com.intellij.openapi.ui.popup.JBPopupFactory
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.ui.AnimatedIcon
import com.intellij.ui.SimpleListCellRenderer
import com.intellij.ui.awt.RelativePoint
import com.intellij.ui.components.ActionLink
import com.intellij.ui.components.JBLabel
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.UIUtil
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.platforms.intellij.auth.SignInTerminal
import dev.ukitomato.closta.platforms.intellij.composer.ComposerPanel
import dev.ukitomato.closta.platforms.intellij.composer.SendBlock
import dev.ukitomato.closta.platforms.intellij.composer.ToolbarButton
import dev.ukitomato.closta.platforms.intellij.composer.tip
import dev.ukitomato.closta.platforms.intellij.ide.htmlEscaped
import dev.ukitomato.closta.platforms.intellij.session.ClaudeSessionService
import dev.ukitomato.closta.platforms.intellij.session.SessionNotice
import dev.ukitomato.closta.platforms.intellij.session.SessionRelaunch
import dev.ukitomato.closta.platforms.intellij.session.SessionStatus
import dev.ukitomato.closta.platforms.intellij.session.SessionView
import dev.ukitomato.closta.platforms.intellij.settings.ProvidersConfigurable
import dev.ukitomato.closta.platforms.intellij.thread.SwingThreadSurface
import dev.ukitomato.closta.platforms.intellij.thread.ThreadStyle
import dev.ukitomato.closta.platforms.intellij.thread.ThreadSurface
import dev.ukitomato.closta.presenter.view.CardRow
import dev.ukitomato.closta.presenter.view.ThreadRows
import dev.ukitomato.closta.presenter.view.askActions
import dev.ukitomato.closta.presenter.view.composerState
import dev.ukitomato.closta.presenter.view.runningTasks
import dev.ukitomato.closta.presenter.view.sessionTitle
import dev.ukitomato.closta.presenter.view.threadIsRunning
import dev.ukitomato.closta.presenter.view.turnEndActions
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.awt.BorderLayout
import java.awt.Component
import java.awt.FlowLayout
import java.awt.KeyboardFocusManager
import java.awt.MouseInfo
import java.awt.Point
import java.awt.Rectangle
import java.awt.Window
import java.awt.event.ComponentAdapter
import java.awt.event.ComponentEvent
import java.awt.event.HierarchyEvent
import java.awt.event.HierarchyListener
import java.awt.event.WindowAdapter
import java.awt.event.WindowEvent
import java.nio.file.Path
import javax.swing.JComponent
import javax.swing.JPanel
import javax.swing.LayoutFocusTraversalPolicy
import javax.swing.SwingConstants
import javax.swing.SwingUtilities

/**
 * One conversation on screen: a header (title, repository and branch, new conversation, more), the session's notice,
 * the thread, and the composer. It draws [source]'s view at most once a frame on the EDT and holds no state of the
 * conversation: what it shows is folded from the view every time. [place] is where it is shown: it moves the
 * conversation to the other place, and closes when a rewind puts the copy there instead.
 */
@Suppress("TooManyFunctions") // one conversation's screen: its header, notice, rewinds, thread and composer
class ChatPanel(
    private val project: Project,
    private val source: ChatSource,
    private val place: ChatPlace,
    private val lease: ViewLeases.Lease,
    parent: Disposable,
    // checkUi: allow unnamed-component — a container: the tab or the tool window around it names the conversation
) : JPanel(BorderLayout()) {
    private val scope: CoroutineScope = project.service<ClaudeSessionService>().viewScope(parent)

    // Declared before everything that launches with it: init (the header) runs in declaration order, and a handler
    // declared below it is still null there.

    /** A command that throws (a session already closed) is logged by its type and goes no further. */
    private val failures =
        CoroutineExceptionHandler {
            _,
            failure,
            ->
            thisLogger().warn("chat: a command failed (${failure.javaClass.name})")
        }
    private val surface: ThreadSurface = SwingThreadSurface(project, roomy = place.placement == Placement.EDITOR_TAB)
    private val drafts = service<ComposerDrafts>()
    private val draft = drafts.of(source)
    private val composer = ComposerPanel(project, scope, parent, draft)
    private val rows = ThreadRows()
    private val notice = JPanel(BorderLayout()).apply { isOpaque = false }
    private var noticeShown: SessionNotice? = null
    private val where = JBLabel().apply { foreground = UIUtil.getContextHelpForeground() }
    private var title = source.title
    private var head: String = ""
    private val made = System.nanoTime()
    private var drawnOnce = false
    private var wasRunning = false
    private var inViewNow = false

    /** "Rewinding…" with a spinner, while a rewind waits for its copy to start. */
    private val rewinding =
        JBLabel(ClostaBundle.message("chat.rewinding"), AnimatedIcon.Default.INSTANCE, JBLabel.LEFT).apply {
            border = JBUI.Borders.empty(2, ThreadStyle.INSET)
            foreground = UIUtil.getContextHelpForeground()
            isVisible = false
        }

    /** Where the pointer was when an ask's rewind or fork was clicked: its refusal is said there. */
    private var clickedAt: Point? = null

    private val changes = project.service<TurnChanges>()
    private val changesBar = ChangesBar(changes)

    private val tabs = ChatTabs(project, surface.component, parent)
    private val running =
        RunningList(
            onOpen = { task -> task.toolUseId?.takeIf { task.kind == "agent" }?.let { tabs.open(it, task.title) } },
            onStop = { task -> scope.launch(failures) { source.stopTask(task.taskId) } },
        )

    init {
        Disposer.register(parent, surface)
        Disposer.register(parent) { running.stop() }
        background = UIUtil.getPanelBackground()
        notice.isVisible = false
        tabs.onMainShown = { main -> composer.component.isVisible = main }
        tabs.onLetGo = ::returnFocusToComposer
        changesBar.onLetGo = { returnFocusToComposer(changesBar.component) }
        composer.onLetGo = { returnFocusToComposer(null) }
        surface.onLetGo = { returnFocusToComposer(null) }
        composer.onJump = surface::focusWaitingCard
        addComponentListener(
            object : ComponentAdapter() {
                override fun componentResized(e: ComponentEvent) = noticeShown?.let(::showNotice) ?: Unit
            },
        )

        add(
            JPanel(BorderLayout()).apply {
                isOpaque = false
                add(header(), BorderLayout.NORTH)
                add(notice, BorderLayout.SOUTH)
            },
            BorderLayout.NORTH,
        )
        add(tabs.component, BorderLayout.CENTER)
        add(
            JPanel(BorderLayout()).apply {
                isOpaque = false
                // Tab goes from the composer's buttons to the running list (it sits above the composer, but the
                // composer's ↑↓ are its history, so the list is reached from the buttons, not from the input).
                isFocusTraversalPolicyProvider = true
                focusTraversalPolicy = RunningListLast(running.component)
                add(
                    JPanel(BorderLayout()).apply {
                        isOpaque = false
                        add(running.component, BorderLayout.NORTH)
                        add(rewinding, BorderLayout.CENTER)
                        add(changesBar.component, BorderLayout.SOUTH)
                    },
                    BorderLayout.NORTH,
                )
                add(composer.component, BorderLayout.CENTER)
            },
            BorderLayout.SOUTH,
        )
        wire()
        draw()
        watchVisibility(parent)
    }

    /**
     * Tells the lease whether this screen is in view: shown in the window the user is in. A tab behind another, a
     * hidden tool window or a window behind another is not.
     */
    private fun watchVisibility(parent: Disposable) {
        var window: Window? = null
        val activation =
            object : WindowAdapter() {
                override fun windowActivated(event: WindowEvent) = report()

                override fun windowDeactivated(event: WindowEvent) = report()
            }
        val hierarchy =
            HierarchyListener { event ->
                if (event.changeFlags and HierarchyEvent.SHOWING_CHANGED.toLong() != 0L) {
                    window?.removeWindowListener(activation)
                    window = if (isShowing) SwingUtilities.getWindowAncestor(this) else null
                    window?.addWindowListener(activation)
                    report()
                }
            }
        addHierarchyListener(hierarchy)
        Disposer.register(parent) {
            removeHierarchyListener(hierarchy)
            window?.removeWindowListener(activation)
            lease.visible(false)
        }
        report()
    }

    // In view: shown in the active window, whichever window that is (the lease's change marks the session read).
    private fun report() {
        val inView = screenInView(isShowing, SwingUtilities.getWindowAncestor(this)?.isActive == true)
        if (inView && !inViewNow) readHead()
        inViewNow = inView
        lease.visible(inView)
        // The MCP tab follows the conversation last in view in this window.
        if (inView) project.service<LastChat>().shown(source.sessionId)
    }

    val sessionId: String get() = source.sessionId

    fun preferredFocus(): JComponent = composer.focusTarget()

    /**
     * Gives the keyboard back to the composer when what had it goes away ([lostFrom]: a card answered, the changes bar
     * decided, a subagent's tab closed; null for what always gives it back). Called before it goes: only when the
     * keyboard was in it (or nowhere), and then, once it has gone, only if the keyboard is still nowhere or in this
     * panel and the composer is shown. A keyboard the user moved to the editor or a list is left there.
     */
    fun returnFocusToComposer(lostFrom: Component?) {
        if (!keyboardWentWith(KeyboardFocusManager.getCurrentKeyboardFocusManager().focusOwner, lostFrom)) return
        // Later: what had the keyboard is removed first, so this request comes after the one its removal makes.
        SwingUtilities.invokeLater {
            val owner = KeyboardFocusManager.getCurrentKeyboardFocusManager().focusOwner
            if (composerMayTakeBack(owner, this, composer.component.isShowing)) {
                composer.focusTarget().requestFocusInWindow()
            }
        }
    }

    /** The thread's own component (the benchmark scrolls it). */
    fun surfaceComponent(): JComponent = surface.component

    /**
     * The header: the repository and branch, cut with "…" (the tab already names the conversation: its title is the
     * tooltip). In an editor tab New Conversation and More are at its right; in the sidebar they are the tool window's
     * title actions instead.
     */
    private fun header(): JComponent {
        readHead()
        return JPanel(BorderLayout()).apply {
            isOpaque = false
            border =
                JBUI.Borders.compound(
                    JBUI.Borders.customLineBottom(JBUI.CurrentTheme.ToolWindow.borderColor()),
                    JBUI.Borders.empty(2, ThreadStyle.INSET),
                )
            add(where, BorderLayout.CENTER)
            if (place.placement == Placement.SIDEBAR) {
                ToolWindowManager.getInstance(project).getToolWindow(TOOL_WINDOW_ID)?.let {
                    sidebarTitleActions(project, it)
                }
            } else {
                val right = JPanel(FlowLayout(FlowLayout.RIGHT, 0, 0)).apply { isOpaque = false }
                right.add(
                    ToolbarButton(null, AllIcons.General.Add, false) { openNewChat(project, place.placement) }
                        .tip(ClostaBundle.message("chat.newChat")),
                )
                right.add(
                    ToolbarButton(null, AllIcons.General.ChevronDown, false) { under ->
                        JBPopupFactory
                            .getInstance()
                            .createActionGroupPopup(
                                null,
                                newChatChoices(project),
                                DataManager.getInstance().getDataContext(under),
                                JBPopupFactory.ActionSelectionAid.SPEEDSEARCH,
                                false,
                            ).showUnderneathOf(under)
                    }.tip(ClostaBundle.message("chat.newChat.where")),
                )
                right.add(
                    ToolbarButton(null, AllIcons.Actions.More, false) { showMore(it) }
                        .tip(ClostaBundle.message("chat.more")),
                )
                add(right, BorderLayout.EAST)
            }
        }
    }

    /** Reads the repository and branch again (at the start, after each turn, when the window comes back). */
    private fun readHead() {
        scope.launch(failures) {
            val folder = source.workingDirectory ?: project.basePath
            val read = folder?.let { withContext(Dispatchers.IO) { GitHead.of(Path.of(it)) } }
            withContext(Dispatchers.EDT) {
                head =
                    listOfNotNull(
                        read?.let { "${it.repository} · ${it.branch}" },
                        source.providerName,
                    ).joinToString(" · ")
                showHead()
            }
        }
    }

    private fun showHead() {
        where.text = head.ifEmpty { title }
        where.toolTipText = listOf(title, head).filter { it.isNotEmpty() }.joinToString(" — ")
    }

    /** Moves the conversation to the other place (the sidebar's title action, the editor tab's More). */
    fun moveToOtherPlace() =
        place.move(if (place.placement == Placement.EDITOR_TAB) Placement.SIDEBAR else Placement.EDITOR_TAB)

    private fun showMore(under: JComponent) {
        val other = if (place.placement == Placement.EDITOR_TAB) Placement.SIDEBAR else Placement.EDITOR_TAB
        val label =
            if (other == Placement.SIDEBAR) {
                ClostaBundle.message("chat.move.toSidebar")
            } else {
                ClostaBundle.message("chat.move.toEditorTab")
            }
        JBPopupFactory
            .getInstance()
            .createPopupChooserBuilder(listOf(label))
            .setRenderer(SimpleListCellRenderer.create("") { it })
            .setItemChosenCallback { moveToOtherPlace() }
            .createPopup()
            .show(RelativePoint(under, Point(0, under.height)))
    }

    private fun wire() {
        surface.onAnswer = { answer ->
            scope.launch(failures) {
                source.respond(answer)
                // A plan's yes switches the mode after the allow is sent; a refusal shows as the switch's result line.
                answer.modeAfter?.let { source.switchMode(it) }
            }
        }
        surface.onReview = { askKey -> changes.review(askKey) }
        surface.onSignIn = { SignInTerminal.open(project, source.workingDirectory ?: project.basePath) }
        surface.askActions = { askKey, atEnd ->
            val view = source.view.value
            val running = threadIsRunning(view.conversation, view.transcript)
            if (atEnd) {
                turnEndActions(
                    view.transcript,
                    running,
                    askKey,
                )
            } else {
                askActions(view.transcript, running, askKey)
            }
        }
        val acting =
            AskActing(project, source, place, scope, surface.askActions, ::refusedNearClick).apply {
                busy = { waiting ->
                    rewinding.isVisible = waiting
                    rewinding.revalidate()
                }
            }
        surface.onAskAction = { askKey, atEnd, action ->
            clickedAt = MouseInfo.getPointerInfo()?.location
            acting.act(askKey, atEnd, action)
        }
        surface.onOpenAgent = { toolUseId ->
            val task = runningTasks(source.view.value.transcript).firstOrNull { it.toolUseId == toolUseId }
            tabs.open(toolUseId, task?.title ?: ClostaBundle.message("chat.subagent"))
        }
        composer.onSend = { text, attachments -> scope.launch(failures) { source.send(text, attachments) } }
        composer.onStop = { scope.launch(failures) { source.interrupt() } }
        composer.onModel = { value -> scope.launch(failures) { source.switchModel(value) } }
        composer.onEffort = { level -> scope.launch(failures) { source.switchEffort(level) } }
        composer.onMode = { mode -> scope.launch(failures) { source.switchMode(mode) } }
    }

    private fun draw() {
        scope.launch(Dispatchers.EDT) {
            source.view.collect { view ->
                drawn(view)
                delay(FRAME_MS)
            }
        }
        scope.launch(Dispatchers.EDT) {
            source.canSend.collect { sendable ->
                val view = source.view.value
                composer.show(composerState(view.conversation, view.transcript), sendable, sendBlock(sendable))
            }
        }
        scope.launch(Dispatchers.EDT) {
            source.notice.collect { now ->
                noticeShown = now
                showNotice(now)
                // A start that fails keeps canSend false, so the composer learns it ended from the notice.
                val view = source.view.value
                val sendable = source.canSend.value
                composer.show(composerState(view.conversation, view.transcript), sendable, sendBlock(sendable))
            }
        }
    }

    /**
     * Why nothing can be sent: a live session is starting or has ended; a fixed one (the gallery) has ended when it
     * shows a notice, and is starting when it shows none.
     */
    private fun sendBlock(sendable: Boolean): SendBlock =
        when {
            sendable -> SendBlock.NONE
            source is ChatSource.Live ->
                if (source.runtime.status.value is SessionStatus.Starting) SendBlock.STARTING else SendBlock.CLOSED
            source.notice.value != null -> SendBlock.CLOSED
            else -> SendBlock.STARTING
        }

    /**
     * The session's failure or end as the IDE's error banner across the panel, its text wrapped to the panel's width,
     * with Restart Session (a new session in this place, as the remedy says) and Open Settings.
     */
    private fun showNotice(now: SessionNotice?) {
        notice.removeAll()
        notice.isVisible = now != null
        if (now != null) {
            // The banner's colours and icon, drawn here: EditorNotificationPanel keeps its text to two lines and cuts
            // the remedy, and squeezes it beside its actions. The text wraps to the panel's width; the actions go on a
            // line of their own under it.
            val room = (width - JBUI.scale(NOTICE_MARGIN)).coerceAtLeast(JBUI.scale(NOTICE_MIN))
            val banner =
                JBLabel(now.toHtml(room), AllIcons.General.Error, JBLabel.LEFT).apply {
                    verticalTextPosition = SwingConstants.TOP
                    iconTextGap = JBUI.scale(ACTION_GAP / 2)
                    border = JBUI.Borders.empty(ThreadStyle.PAD_V, ThreadStyle.INSET, 0, ThreadStyle.INSET)
                }
            notice.isOpaque = true
            notice.background = JBUI.CurrentTheme.Banner.ERROR_BACKGROUND
            notice.border = JBUI.Borders.customLineBottom(JBUI.CurrentTheme.Banner.ERROR_BORDER_COLOR)
            val actions =
                JPanel(FlowLayout(FlowLayout.LEFT, JBUI.scale(ACTION_GAP), JBUI.scale(2))).apply {
                    isOpaque = false
                    border = JBUI.Borders.empty(0, ThreadStyle.INSET, ThreadStyle.PAD_V, 0)
                    add(ActionLink(ClostaBundle.message("chat.failure.restart")) { restart() })
                    add(
                        ActionLink(ClostaBundle.message("chat.failure.openSettings")) {
                            ShowSettingsUtil
                                .getInstance()
                                .showSettingsDialog(project, ProvidersConfigurable::class.java)
                        },
                    )
                }
            notice.add(banner, BorderLayout.CENTER)
            notice.add(actions, BorderLayout.SOUTH)
        }
        notice.revalidate()
        notice.repaint()
    }

    /** A new session where this one is: this place closes and the session's CLI is stopped, then the new one opens. */
    private fun restart() {
        val old = source.sessionId
        val placement = place.placement
        SessionRelaunch(
            open = { _, opening, folder -> openNewChat(project, placement, opening, workingDirectory = folder) },
            close = {
                place.close()
                project.service<ChatSessions>().stopFromScreen(old)
            },
            workingDirectory = source.workingDirectory,
        ).restart()
    }

    /** Says why a rewind or fork did not happen in a balloon where it was clicked, else on the composer's line. */
    private fun refusedNearClick(text: String) {
        val at = clickedAt
        val surfaceArea = surface.component.takeIf { it.isShowing }
        val inside =
            at != null &&
                surfaceArea != null &&
                Rectangle(surfaceArea.locationOnScreen, surfaceArea.size).contains(at)
        if (!inside || at == null) {
            composer.refused(text)
            return
        }
        JBPopupFactory
            .getInstance()
            .createHtmlTextBalloonBuilder(htmlEscaped(text), MessageType.WARNING, null)
            .setFadeoutTime(BALLOON_MS)
            .createBalloon()
            .show(RelativePoint(at), Balloon.Position.above)
    }

    private fun drawn(view: SessionView) {
        try {
            val start = System.nanoTime()
            val transcript = view.transcript
            drafts.seed(draft, source)
            val shown = rows.of(transcript)
            val sendable = source.canSend.value
            // A resume reads its earlier conversation before the CLI is up: until then the thread is loading.
            surface.loading(
                source.opensWithContent && sendBlock(sendable) == SendBlock.STARTING && transcript.messages.size == 0,
            )
            surface.show(shown) { transcript.approvals[it] }
            composer.cardsWaiting(shown.count { it is CardRow && it.card.answered == null })
            changesBar.show(changesBar(shown, changes.settled))
            composer.show(composerState(view.conversation, transcript), sendable, sendBlock(sendable))
            running.show(runningTasks(transcript))
            tabs.show(view)
            followTitleAndHead(view)
            onRender?.invoke(System.nanoTime() - start)
        } catch (cancel: CancellationException) {
            throw cancel
        } catch (
            @Suppress("TooGenericExceptionCaught") failure: Exception,
        ) {
            // One bad frame must not end the conversation's updates; the next view is drawn again. Only the kind of
            // failure is logged: the conversation is the user's.
            thisLogger().warn("chat panel failed to draw (${failure.javaClass.name})")
        }
        if (!drawnOnce && source.opensWithContent && view.transcript.messages.size > 0) {
            drawnOnce = true
            val ms = (System.nanoTime() - made) / NANOS_PER_MS
            onFirstDraw?.invoke(ms)
        }
    }

    /** The title follows the first request; the branch is read again when a turn ends (it may have switched it). */
    private fun followTitleAndHead(view: SessionView) {
        val named = sessionTitle(view.transcript) ?: source.title
        if (named != title) {
            title = named
            showHead()
            place.retitle(named)
        }
        val runs = threadIsRunning(view.conversation, view.transcript)
        if (wasRunning && !runs) readHead()
        wasRunning = runs
    }

    companion object {
        /** Told how long each draw took, in nanoseconds (the benchmark listens; nothing else does). */
        @Volatile
        var onRender: ((Long) -> Unit)? = null

        /** Told how long the first draw of a conversation with content took from the panel's making, in ms. */
        @Volatile
        var onFirstDraw: ((Long) -> Unit)? = null

        const val FRAME_MS = 16L
        private const val NANOS_PER_MS = 1_000_000L
        private const val NOTICE_MARGIN = 72
        private const val ACTION_GAP = 12
        private const val NOTICE_MIN = 120
        private const val BALLOON_MS = 6_000L
    }
}

/** The order of the layout, but with what is in [running] after everything else. */
private class RunningListLast(
    private val running: Component,
) : LayoutFocusTraversalPolicy() {
    init {
        val byPlace = comparator
        comparator =
            compareBy<Component> { if (SwingUtilities.isDescendingFrom(it, running)) 1 else 0 }.then(byPlace)
    }
}

/**
 * Puts New Conversation, where to open one (▾) and Move to Editor Tab in the Closta tool window's title, from before
 * its first conversation (the sidebar's header then shows only the repository and branch). The move acts on the
 * conversation selected in the window and is hidden while none is. Setting them again puts the same actions back.
 */
internal fun sidebarTitleActions(
    project: Project,
    window: ToolWindow,
) {
    val selected = { window.contentManager.selectedContent?.component as? ChatPanel }
    // The registered action (Find Action and the toolbar have the same one); made here only if it is missing.
    val newChat =
        ActionManager.getInstance().getAction(NEW_SIDEBAR_CHAT)
            ?: object : DumbAwareAction(ClostaBundle.message("chat.newChat"), null, AllIcons.General.Add) {
                override fun actionPerformed(e: AnActionEvent) = openNewChat(project, Placement.SIDEBAR)
            }
    window.setTitleActions(
        listOf(
            providerSwitch(),
            newChat,
            newChatChoices(project),
            // History: a saved conversation, resumed here in the sidebar; the list opens under the button.
            object : DumbAwareAction(
                ClostaBundle.message("chat.sessions.resume"),
                null,
                AllIcons.Vcs.History,
            ) {
                override fun getActionUpdateThread() = ActionUpdateThread.BGT

                override fun actionPerformed(e: AnActionEvent) =
                    resumeChosen(project, Placement.SIDEBAR, e.inputEvent?.component as? JComponent)
            },
            object : DumbAwareAction(
                ClostaBundle.message("chat.move.toEditorTab"),
                null,
                AllIcons.Actions.MoveToWindow,
            ) {
                override fun getActionUpdateThread() = ActionUpdateThread.EDT

                override fun update(e: AnActionEvent) {
                    e.presentation.isEnabledAndVisible = selected() != null
                }

                override fun actionPerformed(e: AnActionEvent) {
                    selected()?.moveToOtherPlace()
                }
            },
        ),
    )
}

private const val NEW_SIDEBAR_CHAT = "Closta.NewSidebarChat"
