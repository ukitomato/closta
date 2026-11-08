package dev.ukitomato.closta.platforms.intellij.thread

import com.intellij.icons.AllIcons
import com.intellij.ide.BrowserUtil
import com.intellij.openapi.Disposable
import com.intellij.openapi.components.service
import com.intellij.openapi.fileEditor.OpenFileDescriptor
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.ui.components.JBScrollPane
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.UIUtil
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.platforms.intellij.ide.IdeBridgeService
import dev.ukitomato.closta.presenter.view.ApprovalRecord
import dev.ukitomato.closta.presenter.view.AskAction
import dev.ukitomato.closta.presenter.view.AskActions
import dev.ukitomato.closta.presenter.view.CardRow
import dev.ukitomato.closta.presenter.view.ThreadRow
import dev.ukitomato.closta.providers.claude.launch.CliPaths
import java.awt.Point
import java.awt.Rectangle
import java.awt.event.ActionEvent
import java.awt.event.ComponentAdapter
import java.awt.event.ComponentEvent
import java.awt.event.KeyEvent
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import javax.swing.AbstractAction
import javax.swing.JButton
import javax.swing.JComponent
import javax.swing.JLayeredPane
import javax.swing.KeyStroke
import javax.swing.ScrollPaneConstants

/**
 * Where the conversation is drawn: it is given the rows and draws them, and holds no state of the conversation. This
 * is the boundary to draw it some other way (Compose + Jewel, once third-party plugins may use it): implement this
 * again over the same rows.
 */
interface ThreadSurface : Disposable {
    val component: JComponent

    /** Draws [rows] (on the EDT). [approval] finds the request a card answers. */
    fun show(
        rows: List<ThreadRow>,
        approval: (String) -> ApprovalRecord?,
    )

    var onAnswer: (CardAnswer) -> Unit

    /**
     * The keyboard leaves the thread for the composer: the card that had it was answered and went, or its key to go
     * back was pressed.
     */
    var onLetGo: () -> Unit

    /** Whether the earlier conversation is still being read (a resume): an empty thread says it is loading. */
    fun loading(reading: Boolean)

    /** Brings the waiting card at the top into view and gives it the keyboard; false when no card waits. */
    fun focusWaitingCard(): Boolean

    /** Tells how many waiting cards are outside the view, whenever the view or the cards change. */
    var onWaitingOffScreen: (Int) -> Unit

    var onOpenAgent: (toolUseId: String) -> Unit
    var onReview: (askKey: String) -> Unit

    /** The CLI said it is not signed in, and the user chose to sign in. */
    var onSignIn: () -> Unit

    /** What an ask (or, at the end of its turn, the turn's end) offers now. */
    var askActions: (askKey: String, atEnd: Boolean) -> AskActions

    /** Rewinds or forks as [AskAction] says, chosen at the ask [askKey] (or, atEnd, at the end of its turn). */
    var onAskAction: (askKey: String, atEnd: Boolean, AskAction) -> Unit
}

/** Opens the file at [path] in the editor, at [line] (1-based) when one is given, if there is a file there. */
private fun openPath(
    project: Project,
    path: String,
    line: Int? = null,
) {
    val file = LocalFileSystem.getInstance().refreshAndFindFileByPath(path) ?: return
    val descriptor =
        if (line != null) OpenFileDescriptor(project, file, line - 1, 0) else OpenFileDescriptor(project, file)
    descriptor.navigate(true)
}

/**
 * Opens a file the CLI named, only when it lies inside the project. The check is made in the CLI's path space (the
 * project folder mapped by [CliPaths.toCli]), then the path is mapped to the IDE's by [CliPaths.toIde]; a refused path
 * opens nothing and is not logged.
 */
internal fun openCliPath(
    project: Project,
    cliPath: String,
) {
    val cliPaths = project.service<IdeBridgeService>().cliPaths
    val root = project.basePath?.let(cliPaths::toCli) ?: return
    val inside = toolPathTarget(cliPath, root) ?: return
    openPath(project, cliPaths.toIde(inside))
}

/** The conversation as a lazy, kept Swing column ([LazyRows]) over [ShownRow]s. */
class SwingThreadSurface(
    project: Project,
    /** An editor tab's conversation: wider room at its sides. */
    roomy: Boolean = false,
) : ThreadSurface {
    override var onAnswer: (CardAnswer) -> Unit = {}
    override var onLetGo: () -> Unit = {}
    override var onWaitingOffScreen: (Int) -> Unit = {}
    private var offScreenTold = -1
    override var onOpenAgent: (String) -> Unit = {}
    override var onReview: (String) -> Unit = {}
    override var onSignIn: () -> Unit = {}
    override var askActions: (String, Boolean) -> AskActions = { _, _ -> AskActions(null, null, null, null) }
    override var onAskAction: (String, Boolean, AskAction) -> Unit = { _, _, _ -> }
    private var approvals: (String) -> ApprovalRecord? = { null }

    private val markdown = MarkdownBlocks(project)
    private val shown = ShownRows(markdown::of)
    private val actions =
        object : RowActions {
            override fun answer(answer: CardAnswer) = onAnswer(answer)

            override fun openAgent(toolUseId: String) = onOpenAgent(toolUseId)

            override fun review(askKey: String) = onReview(askKey)

            override fun signIn() = onSignIn()

            override fun askActions(
                askKey: String,
                atEnd: Boolean,
            ): AskActions = this@SwingThreadSurface.askActions(askKey, atEnd)

            override fun act(
                askKey: String,
                atEnd: Boolean,
                action: AskAction,
            ) = onAskAction(askKey, atEnd, action)

            override fun resized(key: String) {
                column.remake(key)
            }

            override fun replyOf(blockKey: String): String? = shown.replyOf(blockKey)

            override fun openFile(path: String) = openPath(project, path)

            override fun openLink(href: String) {
                when (val target = linkTarget(href, project.basePath)) {
                    is LinkTarget.Web -> BrowserUtil.browse(target.url)
                    is LinkTarget.File -> openPath(project, target.path, target.line)
                    null -> Unit
                }
            }
        }
    private val column: LazyRows =
        LazyRows(
            ThreadRowViews(
                actions,
                CardViews(
                    { approvals(it) },
                    { onAnswer(it) },
                    { scroll },
                    { openEditDiff(project, it) },
                    PlanTabs(project),
                    { path -> openCliPath(project, path) },
                    { column.remeasureHolding(it) },
                    { onLetGo() },
                ),
            ),
            roomy,
        )
    private val scroll =
        JBScrollPane(
            column,
            ScrollPaneConstants.VERTICAL_SCROLLBAR_AS_NEEDED,
            ScrollPaneConstants.HORIZONTAL_SCROLLBAR_NEVER,
        ).apply {
            border = JBUI.Borders.empty()
            viewport.background = ThreadStyle.background
        }
    private val toLatest =
        JButton(AllIcons.General.ArrowDown).apply {
            toolTipText = ClostaBundle.message("thread.toLatest")
            isVisible = false
            putClientProperty("JButton.buttonType", "roundRect")
            addActionListener { if (text == null || !focusWaitingCard()) toBottom() }
        }

    // The cards that wait for an answer, by key: the jump says so when one of them is below the view.
    private var waiting: List<String> = emptyList()
    private val layers =
        object : JLayeredPane() {
            override fun doLayout() {
                scroll.setBounds(0, 0, width, height)
                val size = toLatest.preferredSize
                val margin = JBUI.scale(MARGIN)
                toLatest.setBounds(
                    width - size.width - margin * 2,
                    height - size.height - margin,
                    size.width,
                    size.height,
                )
            }
        }.apply {
            add(scroll, JLayeredPane.DEFAULT_LAYER)
            add(toLatest, JLayeredPane.PALETTE_LAYER)
        }
    override val component: JComponent = layers

    init {
        keys()
        scroll.viewport.addChangeListener {
            column.layoutVisible()
            showJump()
        }
        layers.addComponentListener(
            object : ComponentAdapter() {
                override fun componentResized(e: ComponentEvent) = layers.revalidate()
            },
        )
    }

    /**
     * The conversation takes the keyboard (a click on it, or Tab) and moves with PgUp, PgDn, Ctrl+Home and Ctrl+End,
     * also while a part of it (a header, a card) has the keyboard.
     */
    private fun keys() {
        column.isFocusable = true
        column.getAccessibleContext().accessibleName = ClostaBundle.message("thread.name")
        column.addMouseListener(
            object : MouseAdapter() {
                override fun mousePressed(e: MouseEvent) {
                    column.requestFocusInWindow()
                }
            },
        )
        val page = { down: Boolean ->
            val port = scroll.viewport
            val step = port.extentSize.height - JBUI.scale(UNIT_OVERLAP)
            val top = (port.viewPosition.y + if (down) step else -step).coerceIn(0, maxTop())
            port.viewPosition = Point(0, top)
        }
        bind("PAGE_UP", KeyEvent.VK_PAGE_UP, 0) { page(false) }
        bind("PAGE_DOWN", KeyEvent.VK_PAGE_DOWN, 0) { page(true) }
        bind("TOP", KeyEvent.VK_HOME, KeyEvent.CTRL_DOWN_MASK) { scroll.viewport.viewPosition = Point(0, 0) }
        bind("BOTTOM", KeyEvent.VK_END, KeyEvent.CTRL_DOWN_MASK) { toBottom() }
    }

    private fun bind(
        name: String,
        key: Int,
        modifiers: Int,
        act: () -> Unit,
    ) {
        val id = "closta.thread.$name"
        val keys = layers.getInputMap(JComponent.WHEN_ANCESTOR_OF_FOCUSED_COMPONENT)
        keys.put(KeyStroke.getKeyStroke(key, modifiers), id)
        layers.actionMap.put(
            id,
            object : AbstractAction() {
                override fun actionPerformed(e: ActionEvent) = act()
            },
        )
    }

    override fun loading(reading: Boolean) {
        column.loading = reading
    }

    override fun focusWaitingCard(): Boolean {
        val key = waiting.firstOrNull()
        val top = key?.let(column::topOf) ?: return false
        val port = scroll.viewport
        val view = port.viewRect
        // Out of sight (or only its top edge in it): its top goes near the view's top, and the column makes it.
        if (top < view.y || top > view.y + view.height - JBUI.scale(PEEK)) {
            port.viewPosition = Point(0, (top - JBUI.scale(MARGIN)).coerceIn(0, maxTop()))
        }
        column.layoutVisible()
        column.componentOf(key)?.let { card ->
            card.scrollRectToVisible(Rectangle(0, 0, card.width, card.height))
            partFor("", card)?.requestFocusInWindow()
        }
        return true
    }

    private fun maxTop(): Int = (column.totalHeight() - scroll.viewport.extentSize.height).coerceAtLeast(0)

    override fun show(
        rows: List<ThreadRow>,
        approval: (String) -> ApprovalRecord?,
    ) {
        approvals = approval
        waiting = rows.filter { it is CardRow && it.card.answered == null }.map { it.key }
        val following = atBottom()
        column.setRows(shown.of(rows))
        // Twice: the first move brings the last rows in sight and they are measured, which can change the height.
        if (following) repeat(2) { toBottom() }
        showJump()
    }

    /**
     * The "Scroll to latest" arrow, shown while the view is above the end; it says a card waits down there, in the
     * accent, when one does.
     */
    private fun showJump() {
        val view = scroll.viewport.viewRect
        // A card with any part in sight is on screen, though its top is not.
        val unseen =
            waiting.filter { key ->
                val top = column.topOf(key) ?: return@filter false
                val bottom = column.bottomOf(key) ?: top
                bottom <= view.y || top >= view.y + view.height
            }
        val off = waitingOffScreen(unseen.mapNotNull(column::topOf), view.y, view.y + view.height)
        if (off != offScreenTold) {
            offScreenTold = off
            onWaitingOffScreen(off)
        }
        toLatest.isVisible = !atBottom()
        if (!toLatest.isVisible) return
        val bottom = scroll.viewport.viewRect.let { it.y + it.height }
        val label = jumpLabel(waitingBelow(waiting.mapNotNull(column::topOf), bottom))
        val text = if (label == JumpLabel.WAITING) ClostaBundle.message("thread.jump.waiting") else null
        if (toLatest.text != text) {
            toLatest.text = text
            toLatest.foreground = if (text != null) ThreadStyle.accent else UIUtil.getLabelForeground()
            toLatest.toolTipText = text ?: ClostaBundle.message("thread.toLatest")
            layers.revalidate()
            layers.doLayout()
        }
    }

    private fun atBottom(): Boolean {
        val bar = scroll.verticalScrollBar
        return bar.value + bar.visibleAmount >= bar.maximum - JBUI.scale(BOTTOM_SLACK)
    }

    private fun toBottom() {
        scroll.viewport.validate()
        val bottom = (column.totalHeight() - scroll.viewport.extentSize.height).coerceAtLeast(0)
        scroll.viewport.viewPosition = Point(0, bottom)
    }

    override fun dispose() = Unit

    private companion object {
        const val UNIT_OVERLAP = 24
        const val BOTTOM_SLACK = 8
        const val MARGIN = 12
        const val PEEK = 48
    }
}
