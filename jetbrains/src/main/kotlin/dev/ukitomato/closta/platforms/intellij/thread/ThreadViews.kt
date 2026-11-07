package dev.ukitomato.closta.platforms.intellij.thread

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.ide.CopyPasteManager
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.ui.MessageType
import com.intellij.openapi.ui.popup.Balloon
import com.intellij.openapi.ui.popup.JBPopupFactory
import com.intellij.ui.AnimatedIcon
import com.intellij.ui.ColorUtil
import com.intellij.ui.EditorNotificationPanel
import com.intellij.ui.InlineBanner
import com.intellij.ui.InplaceButton
import com.intellij.ui.PopupHandler
import com.intellij.ui.SimpleColoredComponent
import com.intellij.ui.SimpleTextAttributes
import com.intellij.ui.awt.RelativePoint
import com.intellij.ui.components.ActionLink
import com.intellij.ui.components.JBHtmlPane
import com.intellij.ui.components.JBHtmlPaneConfiguration
import com.intellij.ui.components.JBHtmlPaneStyleConfiguration
import com.intellij.ui.components.JBLabel
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.UIUtil
import dev.ukitomato.closta.core.models.AttachmentKind
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.platforms.intellij.chat.turnEndText
import dev.ukitomato.closta.presenter.view.AskAction
import dev.ukitomato.closta.presenter.view.AskActions
import dev.ukitomato.closta.presenter.view.AskRow
import dev.ukitomato.closta.presenter.view.AttachmentRecord
import dev.ukitomato.closta.presenter.view.CardRow
import dev.ukitomato.closta.presenter.view.ExploredRow
import dev.ukitomato.closta.presenter.view.SignInRow
import dev.ukitomato.closta.presenter.view.ThinkingRow
import dev.ukitomato.closta.presenter.view.ThreadRow
import dev.ukitomato.closta.presenter.view.TodoRow
import dev.ukitomato.closta.presenter.view.ToolDetail
import dev.ukitomato.closta.presenter.view.ToolLine
import dev.ukitomato.closta.presenter.view.ToolLineState
import dev.ukitomato.closta.presenter.view.ToolRow
import dev.ukitomato.closta.presenter.view.TurnEndRow
import java.awt.BasicStroke
import java.awt.BorderLayout
import java.awt.Component
import java.awt.Dimension
import java.awt.FlowLayout
import java.awt.Graphics
import java.awt.Graphics2D
import java.awt.KeyboardFocusManager
import java.awt.RenderingHints
import java.awt.datatransfer.StringSelection
import java.beans.PropertyChangeListener
import java.util.Locale
import javax.swing.Box
import javax.swing.BoxLayout
import javax.swing.JComponent
import javax.swing.JLayeredPane
import javax.swing.JPanel
import javax.swing.JTextArea
import javax.swing.ScrollPaneConstants
import javax.swing.SwingUtilities
import javax.swing.event.HyperlinkEvent
import javax.swing.text.DefaultHighlighter
import javax.swing.text.Document

/**
 * What the rows ask the surface to do: answer a card, open a sub-agent, measure a row that opened or closed, review a
 * turn, rewind or fork from an ask.
 */
interface RowActions {
    fun answer(answer: CardAnswer)

    fun openAgent(toolUseId: String)

    /** The row [key] opened or closed: it is made again, at its new height. */
    fun resized(key: String)

    /** Shows what the turn that answered [askKey] changed. */
    fun review(askKey: String)

    /** What the ask [askKey] offers now, or with [atEnd] what the end of its turn offers. */
    fun askActions(
        askKey: String,
        atEnd: Boolean,
    ): AskActions

    /** Rewinds or forks as [action] says; [askKey] and [atEnd] say where it was chosen, to check it again. */
    fun act(
        askKey: String,
        atEnd: Boolean,
        action: AskAction,
    )

    /** The whole Markdown of the reply the shown block [blockKey] belongs to. */
    fun replyOf(blockKey: String): String?

    /** Follows a link of a reply ([linkTarget]): a web page in the browser, a project file in the editor. */
    fun openLink(href: String)

    /** Opens the file at [path] (a sent file's, wherever it is) in the editor. */
    fun openFile(path: String)

    /** Signs the CLI in, in a terminal: it said it is not signed in. */
    fun signIn()
}

/**
 * The components of the conversation's rows: the user's message in a soft box, the reply as full-width
 * HTML, a tool call as one monospaced line with a dot for its state, read-only calls folded into one line, the to-do
 * list and the cards. Which rows are open is kept here, by key, so a row made again opens the same way.
 */
@Suppress("TooManyFunctions") // one maker per kind of row
class ThreadRowViews(
    private val actions: RowActions,
    private val cards: CardViews,
) : RowViews {
    private val open = HashSet<String>()

    // The header that had the keyboard when its row was made again (it opened, closed or changed): the new one takes
    // it back. Only for the row made next; a row not made again soon does not take the keyboard later.
    private var refocus: String? = null
    private val headers = HashMap<String, Opener>()

    override fun create(row: ShownRow): JComponent =
        when (row) {
            is ShownRow.Block -> block(row)
            is ShownRow.Typing -> JBLabel(AnimatedIcon.Default.INSTANCE).apply { horizontalAlignment = JBLabel.LEFT }
            is ShownRow.Of -> of(row.row)
        }

    private fun of(row: ThreadRow): JComponent =
        when (row) {
            is AskRow -> ask(row)
            is ThinkingRow -> thinking(row)
            is ToolRow -> tool(row)
            is ExploredRow -> explored(row)
            is TodoRow -> todo(row)
            is CardRow -> cards.create(row.card)
            is TurnEndRow -> turnEnd(row)
            is SignInRow -> signIn()
            // A row this version does not draw takes no room.
            else -> JPanel().apply { preferredSize = Dimension(0, 0) }
        }

    override fun update(
        component: JComponent,
        row: ShownRow,
    ): JComponent {
        val card = (row as? ShownRow.Of)?.row as? CardRow
        val kept =
            when {
                row is ShownRow.Block && !row.block.wide && component is JBHtmlPane -> {
                    // Only the HTML that changed is set: setting it parses and lays the block out again.
                    if (component.getClientProperty(HTML) != row.block.html) {
                        component.putClientProperty(HTML, row.block.html)
                        component.text = row.block.html
                    }
                    true
                }
                card != null -> cards.update(component, card.card)
                row is ShownRow.Typing -> true
                else -> false
            }
        return if (kept) component else create(row)
    }

    override fun estimate(
        row: ShownRow,
        width: Int,
    ): Int {
        val line = JBUI.scale(LINE)
        val perLine = (width / JBUI.scale(CHAR)).coerceAtLeast(1)
        return when (row) {
            is ShownRow.Block ->
                if (row.block.wide) {
                    line * (row.block.html.count { it == '\n' } + 1) + JBUI.scale(WIDE_EXTRA)
                } else {
                    line * (row.block.html.length / perLine + 1)
                }
            is ShownRow.Typing -> line
            is ShownRow.Of ->
                when (val r = row.row) {
                    is AskRow -> line * (r.text.length / perLine + r.text.count { it == '\n' } + 2)
                    is TodoRow -> line * (r.items.size + 2)
                    is CardRow -> line * CARD_LINES
                    else -> line
                }
        }
    }

    private fun block(row: ShownRow.Block): JComponent {
        val block = row.block
        val pane = htmlPane(block, actions::openLink)
        replyMenu(pane, row.key)
        if (!block.wide) return pane
        val scroll = sideways(pane)
        val code = block.html.trimStart().startsWith("<pre")
        return if (code) copyOnHover(scroll) { pane.document.plainText() } else scroll
    }

    // The reply's menu: copy the whole reply (its Markdown), or what is selected in this block.
    private fun replyMenu(
        pane: JBHtmlPane,
        blockKey: String,
    ) {
        val group =
            DefaultActionGroup(
                DumbAwareAction.create(
                    ClostaBundle.message("thread.reply.copy"),
                ) { actions.replyOf(blockKey)?.let(::copyToClipboard) },
                object : DumbAwareAction(ClostaBundle.message("thread.reply.copySelection")) {
                    override fun actionPerformed(e: AnActionEvent) {
                        pane.selectedText?.let(::copyToClipboard)
                    }

                    override fun update(e: AnActionEvent) {
                        e.presentation.isEnabled = !pane.selectedText.isNullOrEmpty()
                    }

                    override fun getActionUpdateThread() = ActionUpdateThread.EDT
                },
            )
        PopupHandler.installPopupMenu(pane, group, MENU_PLACE)
    }

    /** [content] with a copy button at its top right while the mouse is over it; it copies [text] and says so. */
    private fun copyOnHover(
        content: JComponent,
        text: () -> String,
    ): JComponent {
        lateinit var button: InplaceButton
        button =
            InplaceButton(ClostaBundle.message("thread.ask.copy"), AllIcons.Actions.Copy) {
                copyToClipboard(text())
                copied(button)
            }.apply { isVisible = false }
        val layers =
            object : JLayeredPane() {
                override fun getPreferredSize(): Dimension = content.preferredSize

                override fun getMinimumSize(): Dimension = content.minimumSize

                override fun doLayout() {
                    content.setBounds(0, 0, width, height)
                    val size = button.preferredSize
                    val inset = JBUI.scale(GAP)
                    button.setBounds(width - size.width - inset, inset, size.width, size.height)
                }
            }.apply {
                add(content, JLayeredPane.DEFAULT_LAYER)
                add(button, JLayeredPane.PALETTE_LAYER)
            }
        onHover(layers) { over -> button.isVisible = over }
        return layers
    }

    private fun ask(row: AskRow): JComponent = AskActionViews.ask(askBox(row), row.key, row.text, actions)

    // The box, and inside it the padded text; the ask's buttons go at its right (AskActionViews).
    private fun askBox(row: AskRow): JPanel =
        RoundedPanel().apply {
            layout = BorderLayout()
            add(
                JPanel(BorderLayout(0, JBUI.scale(GAP))).apply {
                    isOpaque = false
                    border = JBUI.Borders.empty(ThreadStyle.PAD_V, ThreadStyle.PAD_H)
                    if (row.attachments.isNotEmpty()) {
                        add(
                            JPanel(FlowLayout(FlowLayout.LEFT, JBUI.scale(GAP), 0)).apply {
                                isOpaque = false
                                row.attachments.forEach { add(attachmentLabel(it)) }
                            },
                            BorderLayout.NORTH,
                        )
                    }
                    val folded = foldedAsk(row.text)
                    val isOpen = row.key in open
                    val shown = if (folded != null && !isOpen) folded else row.text
                    add(wrapping(shown).also(::markMentions), BorderLayout.CENTER)
                    if (folded != null) {
                        val more =
                            if (isOpen) {
                                ClostaBundle.message(
                                    "thread.ask.collapse",
                                )
                            } else {
                                ClostaBundle.message("thread.ask.showAll")
                            }
                        add(
                            JPanel(FlowLayout(FlowLayout.LEFT, 0, 0)).apply {
                                isOpaque = false
                                add(
                                    ActionLink(more) {
                                        if (!open.add(row.key)) open.remove(row.key)
                                        actions.resized(row.key)
                                    },
                                )
                            },
                            BorderLayout.SOUTH,
                        )
                    }
                },
                BorderLayout.CENTER,
            )
        }

    // The ask's `@` mentions on a soft mark of the accent, the way the composer shows them.
    private fun markMentions(area: JTextArea) {
        val painter = DefaultHighlighter.DefaultHighlightPainter(ColorUtil.withAlpha(ThreadStyle.accent, MENTION_ALPHA))
        mentions(area.text).forEach { area.highlighter.addHighlight(it.first, it.last + 1, painter) }
    }

    // "12s · 3 files · Review", muted, under the turn's reply, and the rewind's icon once another ask came after it.
    private fun turnEnd(row: TurnEndRow): JComponent =
        JPanel(FlowLayout(FlowLayout.LEFT, JBUI.scale(GAP), 0)).apply {
            isOpaque = false
            add(JBLabel(turnEndText(row)).apply { foreground = ThreadStyle.muted })
            if (row.changes?.files?.isNotEmpty() == true) {
                add(JBLabel("·").apply { foreground = ThreadStyle.muted })
                add(ActionLink(ClostaBundle.message("thread.turnEnd.review")) { actions.review(row.askKey) })
            }
            if (row.followed) {
                add(JBLabel("·").apply { foreground = ThreadStyle.muted })
                add(AskActionViews.turnEndRewind(row.askKey, actions))
            }
        }

    // The IDE's own banner for "something to do before this can go on", with the one thing to do.
    private fun signIn(): JComponent =
        InlineBanner(ClostaBundle.message("thread.signIn.text"), EditorNotificationPanel.Status.Warning)
            .showCloseButton(false)
            .addAction(ClostaBundle.message("thread.signIn.action")) { actions.signIn() }

    private fun attachmentLabel(attachment: AttachmentRecord): JComponent {
        val icon =
            when (attachment.kind) {
                AttachmentKind.IMAGE -> AllIcons.FileTypes.Image
                AttachmentKind.DOCUMENT -> AllIcons.FileTypes.Any_type
                AttachmentKind.TEXT -> AllIcons.FileTypes.Text
            }
        val path =
            attachment.path
                ?: return JBLabel(
                    attachment.name,
                    icon,
                    JBLabel.LEFT,
                ).apply { foreground = UIUtil.getLabelForeground() }
        // Where it was read from: the whole path in the tooltip, and a click opens it in the editor.
        return ActionLink(attachment.name) { actions.openFile(path) }.apply {
            setIcon(icon)
            toolTipText = path
        }
    }

    private fun thinking(row: ThinkingRow): JComponent {
        val key = row.key
        val isOpen = key in open
        val words =
            JBLabel(
                ClostaBundle.message(if (row.streaming) "thread.thinking.running" else "thread.thinking.done"),
            ).apply {
                foreground = ThreadStyle.muted
                if (row.streaming) {
                    icon = AnimatedIcon.Default.INSTANCE
                    horizontalTextPosition = JBLabel.LEFT
                }
            }
        return column(
            toggle(key, isOpen, words, words.text),
            if (isOpen) wrapping(row.text, ThreadStyle.muted) else null,
        )
    }

    private fun tool(row: ToolRow): JComponent {
        val agent = row.toolName == AGENT || row.toolName == TASK
        val named = toolName(row.line)
        if (agent) return indented(agentCard(row), row.depth)
        val key = row.key
        val isOpen = key in open
        val body = if (isOpen) row.detail?.let(::toolBody) else null
        return indented(column(toggle(key, isOpen, toolLine(row.line), named), body), row.depth)
    }

    /**
     * A sub-agent as a one-line card: its state, what it was asked to do and how many tools it has called. Pressing it
     * opens its conversation in a tab of its own.
     */
    private fun agentCard(row: ToolRow): JComponent {
        val summary = row.agent
        val what = summary?.description ?: row.line.label
        val pieces =
            listOfNotNull(
                what to SimpleTextAttributes.REGULAR_ATTRIBUTES,
                summary?.let {
                    " · " + ClostaBundle.message("chat.mcp.tools", it.tools) to SimpleTextAttributes.GRAYED_ATTRIBUTES
                },
                summary?.durationMs?.let {
                    " · " +
                        ClostaBundle.message(
                            "chat.duration.seconds",
                            String.format(
                                Locale.ROOT,
                                "%.1f",
                                it / MS_PER_SECOND,
                            ),
                        ) to
                        SimpleTextAttributes.GRAYED_ATTRIBUTES
                },
            )
        val line =
            EllipsizedLine(
                pieces,
                ThreadStyle.stateIcon(row.line.state),
                UIUtil.getLabelFont(),
                listOf(ClostaBundle.message("thread.tool.openAgent"), ThreadStyle.stateWord(row.line.state))
                    .joinToString(" — "),
            )
        val opener =
            Opener(line, AllIcons.Nodes.Plugin, "$what ${ThreadStyle.stateWord(row.line.state)}", {
                actions.openAgent(row.toolUseId)
            }) { old -> handBack(row.key, old) }
        keepFocus(row.key, opener)
        return CardPanel(ThreadStyle.cardBorder).apply {
            layout = BorderLayout()
            add(opener, BorderLayout.CENTER)
        }
    }

    // A row of a sub-agent's own calls, [depth] steps in.
    private fun indented(
        component: JComponent,
        depth: Int,
    ): JComponent {
        if (depth <= 0) return component
        val step = JBUI.Borders.emptyLeft(ThreadStyle.INDENT * depth)
        component.border = JBUI.Borders.merge(component.border, step, true)
        return component
    }

    // What an opened tool line shows under it: the input, then the output (why it failed, when it failed).
    private fun toolBody(detail: ToolDetail): JComponent? {
        val boxes =
            listOfNotNull(
                detail.input.takeIf { it.isNotBlank() }?.let { codeBox(it) },
                detail.output?.takeIf { it.isNotBlank() }?.let { codeBox(if (detail.outputCut) "…\n$it" else it) },
            )
        if (boxes.isEmpty()) return null
        return JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            isOpaque = false
            border = JBUI.Borders.emptyLeft(ThreadStyle.INDENT)
            boxes.forEachIndexed { index, box ->
                if (index > 0) add(Box.createVerticalStrut(JBUI.scale(GAP)))
                box.alignmentX = Component.LEFT_ALIGNMENT
                add(box)
            }
        }
    }

    private fun explored(row: ExploredRow): JComponent {
        val key = row.key
        val isOpen = key in open
        val counts =
            row.members
                .groupingBy { it.toolName }
                .eachCount()
                .entries
                .joinToString(", ") { "${it.key} ${it.value}" }
        val states = row.lines.map { it.state }
        val state =
            when {
                ToolLineState.ERROR in states -> ToolLineState.ERROR
                ToolLineState.RUNNING in states -> ToolLineState.RUNNING
                else -> ToolLineState.OK
            }
        val line =
            SimpleColoredComponent().apply {
                font = ThreadStyle.mono
                isOpaque = false
                icon = ThreadStyle.stateIcon(state)
                toolTipText = ThreadStyle.stateWord(state)
                append(ClostaBundle.message("thread.explored.title") + " ", SimpleTextAttributes.REGULAR_ATTRIBUTES)
                append(
                    ClostaBundle.message("thread.explored.files", row.files, counts),
                    SimpleTextAttributes.GRAYED_ATTRIBUTES,
                )
            }
        val header = toggle(key, isOpen, line, line.getCharSequence(false).toString())
        val body =
            if (isOpen) {
                JPanel().apply {
                    layout = BoxLayout(this, BoxLayout.Y_AXIS)
                    isOpaque = false
                    border = JBUI.Borders.emptyLeft(ThreadStyle.INDENT)
                    row.lines.forEach { add(toolLine(it)) }
                }
            } else {
                null
            }
        return indented(column(header, body), row.depth)
    }

    private fun todo(row: TodoRow): JComponent {
        val done = row.items.count { it.status == "completed" }
        val title =
            JBLabel(ClostaBundle.message("thread.todo.title", done, row.items.size)).apply {
                font = JBUI.Fonts.label().asBold()
            }
        val list =
            JPanel().apply {
                layout = BoxLayout(this, BoxLayout.Y_AXIS)
                isOpaque = false
                row.items.forEach { item ->
                    add(
                        SimpleColoredComponent().apply {
                            isOpaque = false
                            when (item.status) {
                                "completed" -> {
                                    icon = AllIcons.Actions.Checked
                                    append(
                                        item.content,
                                        SimpleTextAttributes(SimpleTextAttributes.STYLE_STRIKEOUT, ThreadStyle.muted),
                                    )
                                }
                                "in_progress" -> {
                                    icon = DotIcon(ThreadStyle.running)
                                    append(item.content, SimpleTextAttributes.REGULAR_BOLD_ATTRIBUTES)
                                }
                                else -> {
                                    icon = DotIcon(ThreadStyle.muted, hollow = true)
                                    append(item.content, SimpleTextAttributes.REGULAR_ATTRIBUTES)
                                }
                            }
                        },
                    )
                }
            }
        return CardPanel(ThreadStyle.cardBorder).apply {
            layout = BorderLayout(0, JBUI.scale(GAP))
            add(title, BorderLayout.NORTH)
            add(list, BorderLayout.CENTER)
        }
    }

    /**
     * The header of the row [key] that opens and closes it: the IDE's arrow, then [line]. It is made again with the row
     * and takes the keyboard back when it had it, so Enter can open and close it in turn.
     */
    private fun toggle(
        key: String,
        isOpen: Boolean,
        line: JComponent,
        words: String,
    ): JComponent {
        val arrow = if (isOpen) AllIcons.General.ArrowDown else AllIcons.General.ArrowRight
        val header =
            Opener(
                line,
                arrow,
                ClostaBundle.message(
                    if (isOpen) "thread.opener.close" else "thread.opener.open",
                    words,
                ),
                {
                    if (!open.add(key)) open.remove(key)
                    actions.resized(key)
                },
            ) { old -> handBack(key, old) }
        keepFocus(key, header)
        return header
    }

    private fun keepFocus(
        key: String,
        header: Opener,
    ) {
        headers[key] = header
        if (refocus == key) {
            refocus = null
            SwingUtilities.invokeLater { if (header.isShowing) header.requestFocusInWindow() }
        }
    }

    // [old], the header of [key], left the screen with the keyboard: to its row's new header, made already or next.
    private fun handBack(
        key: String,
        old: Opener,
    ) {
        val now = headers[key]
        if (now != null && now !== old) {
            SwingUtilities.invokeLater { if (now.isShowing) now.requestFocusInWindow() }
        } else {
            refocus = key
            SwingUtilities.invokeLater { if (refocus == key) refocus = null }
        }
    }

    private fun column(
        header: JComponent,
        body: JComponent?,
    ): JComponent =
        JPanel(BorderLayout()).apply {
            isOpaque = false
            add(header, BorderLayout.NORTH)
            if (body != null) add(body, BorderLayout.CENTER)
        }

    companion object {
        private const val HTML = "closta.html"
        private const val AGENT = "Agent"
        private const val TASK = "Task"
        private const val LINE = 20
        private const val CHAR = 7
        private const val WIDE_EXTRA = 16
        private const val CARD_LINES = 6
        private const val GAP = 4
        private const val CODE_LINES = 12
        private const val MENTION_ALPHA = 0.25
        private const val MS_PER_SECOND = 1000.0
        private const val COPIED_MS = 1500L
        private const val MENU_PLACE = "ClostaReply"
        private val STYLE =
            JBHtmlPaneStyleConfiguration { enableCodeBlocksBackground(true).enableInlineCodeBackground(true) }

        /**
         * One tool call as one monospaced line with its state as an icon, and in words in its tooltip after [what]
         * (what pressing the line does, when it does something). A line wider than its column ends in an ellipsis
         * and shows the whole call in its tooltip.
         */
        fun toolLine(
            line: ToolLine,
            what: String? = null,
        ): SimpleColoredComponent =
            EllipsizedLine(
                ThreadStyle.pieces(line),
                ThreadStyle.stateIcon(line.state),
                note = listOfNotNull(what, ThreadStyle.stateWord(line.state)).joinToString(" — "),
            ).apply { getAccessibleContext().accessibleName = toolName(line) }

        /** What a screen reader says of a tool line: what it is, then its state in words. */
        fun toolName(line: ToolLine): String = "${line.label} ${ThreadStyle.stateWord(line.state)}"

        /**
         * Monospaced [text] in a soft box, not wrapped: no taller than [CODE_LINES] lines (the rest scrolls inside with
         * its bar), sideways with Shift+wheel; the plain wheel goes on to the conversation ([SidewaysScroll]).
         */
        fun codeBox(text: String): JComponent {
            val area =
                JTextArea(text).apply {
                    isEditable = false
                    isOpaque = false
                    border = JBUI.Borders.empty()
                    font = ThreadStyle.mono
                    foreground = UIUtil.getLabelForeground()
                }
            val scroll =
                object : SidewaysScroll(
                    area,
                    ScrollPaneConstants.VERTICAL_SCROLLBAR_AS_NEEDED,
                    ScrollPaneConstants.HORIZONTAL_SCROLLBAR_AS_NEEDED,
                ) {
                    override fun getPreferredSize(): Dimension {
                        val inner = area.preferredSize
                        val line = area.getFontMetrics(area.font).height
                        return Dimension(inner.width, minOf(inner.height, line * CODE_LINES))
                    }
                }.apply {
                    border = JBUI.Borders.empty()
                    isOpaque = false
                    viewport.isOpaque = false
                }
            return RoundedPanel().apply {
                layout = BorderLayout()
                border = JBUI.Borders.empty(ThreadStyle.PAD_V, ThreadStyle.PAD_H)
                add(scroll, BorderLayout.CENTER)
            }
        }

        /** Puts [text] on the clipboard. */
        fun copyToClipboard(text: String) = CopyPasteManager.getInstance().setContents(StringSelection(text))

        /** Says, in a small balloon under [near] that goes by itself, that it was copied. */
        fun copied(near: JComponent) {
            JBPopupFactory
                .getInstance()
                .createHtmlTextBalloonBuilder(ClostaBundle.message("thread.copied"), MessageType.INFO, null)
                .setFadeoutTime(COPIED_MS)
                .createBalloon()
                .show(RelativePoint.getSouthOf(near), Balloon.Position.below)
        }

        /**
         * A block of a reply: HTML in a pane, a [HtmlBlock.wide] one (code, a table) in a box that scrolls sideways.
         * Links in it are followed by [openLink], when given.
         */
        fun htmlBlock(
            block: HtmlBlock,
            openLink: ((String) -> Unit)? = null,
        ): JComponent {
            val pane = htmlPane(block, openLink)
            return if (block.wide) sideways(pane) else pane
        }

        private fun htmlPane(
            block: HtmlBlock,
            openLink: ((String) -> Unit)?,
        ): JBHtmlPane =
            JBHtmlPane(STYLE, JBHtmlPaneConfiguration()).apply {
                isEditable = false
                isOpaque = false
                putClientProperty(HTML, block.html)
                text = block.html
                if (openLink != null) {
                    addHyperlinkListener { e ->
                        val href = e.description ?: e.url?.toString()
                        if (e.eventType == HyperlinkEvent.EventType.ACTIVATED && href != null) openLink(href)
                    }
                }
            }

        // The code's height: its bar is drawn over the code's own box, at its bottom.
        private fun sideways(pane: JBHtmlPane): JComponent =
            object : SidewaysScroll(
                pane,
                ScrollPaneConstants.VERTICAL_SCROLLBAR_NEVER,
                ScrollPaneConstants.HORIZONTAL_SCROLLBAR_AS_NEEDED,
            ) {
                override fun getPreferredSize(): Dimension = pane.preferredSize
            }.apply {
                border = JBUI.Borders.empty()
                isOpaque = false
                viewport.isOpaque = false
            }

        /** Text that wraps at the column's width and can be selected and copied. */
        fun wrapping(
            text: String,
            color: java.awt.Color = UIUtil.getLabelForeground(),
        ): JTextArea =
            JTextArea(text).apply {
                lineWrap = true
                wrapStyleWord = true
                isEditable = false
                isOpaque = false
                border = JBUI.Borders.empty()
                font = UIUtil.getLabelFont()
                foreground = color
            }
    }
}

/**
 * A rounded box (the user's message, a card's subject) filled one step off what it sits on
 * ([ThreadStyle.lifted]): the nearest card's fill or opaque parent's background.
 */
open class RoundedPanel : JPanel() {
    init {
        isOpaque = false
    }

    private fun under(): java.awt.Color =
        generateSequence(parent) { it.parent }
            .firstNotNullOfOrNull { at -> (at as? CardPanel)?.fill ?: at.background.takeIf { at.isOpaque } }
            ?: ThreadStyle.background

    override fun paintComponent(g: Graphics) {
        val g2 = g.create() as Graphics2D
        try {
            g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
            g2.color = ThreadStyle.lifted(under())
            val arc = JBUI.scale(ThreadStyle.ARC)
            g2.fillRoundRect(0, 0, width, height, arc, arc)
        } finally {
            g2.dispose()
        }
    }
}

/**
 * A card: padded content in a rounded box of [line], filled with [fill] when one is given. A card that [watchesKeyboard]
 * draws its line twice as thick in the focus colour while the keyboard is in it, and tells [onKeyboard].
 */
open class CardPanel(
    var line: java.awt.Color,
    val fill: java.awt.Color? = null,
    private val watchesKeyboard: Boolean = false,
) : JPanel() {
    /** Whether the keyboard is in the card (only for a card that [watchesKeyboard]). */
    var keyboardIn = false
        private set

    /** Told when the keyboard comes into the card or leaves it. */
    var onKeyboard: (Boolean) -> Unit = {}

    // The keyboard went while the card was off the column: it is told when it is back.
    private var lostWhileAway = false

    // A focus owner of null is the keyboard on its way between two parts, or the window left: neither moves it out.
    private val watch =
        PropertyChangeListener { event ->
            val owner = event.newValue as? Component ?: return@PropertyChangeListener
            val now = SwingUtilities.isDescendingFrom(owner, this)
            if (now != keyboardIn) {
                keyboardIn = now
                repaint()
                onKeyboard(now)
            }
        }

    init {
        isOpaque = false
        border = JBUI.Borders.empty(ThreadStyle.PAD_V, ThreadStyle.PAD_H)
    }

    override fun addNotify() {
        super.addNotify()
        if (watchesKeyboard) {
            KeyboardFocusManager.getCurrentKeyboardFocusManager().addPropertyChangeListener(FOCUS_OWNER, watch)
        }
        if (lostWhileAway) {
            lostWhileAway = false
            SwingUtilities.invokeLater { if (!keyboardIn) onKeyboard(false) }
        }
    }

    override fun removeNotify() {
        KeyboardFocusManager.getCurrentKeyboardFocusManager().removePropertyChangeListener(FOCUS_OWNER, watch)
        // Taken off the column (scrolled away) with the keyboard: it no longer has it. It is told once it is back in
        // the column (not while the column takes it off, which would measure the column inside its own layout).
        if (keyboardIn) {
            keyboardIn = false
            lostWhileAway = true
        }
        super.removeNotify()
    }

    override fun paintComponent(g: Graphics) {
        val g2 = g.create() as Graphics2D
        try {
            g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
            val arc = JBUI.scale(ThreadStyle.ARC)
            fill?.let {
                g2.color = it
                g2.fillRoundRect(0, 0, width - 1, height - 1, arc, arc)
            }
            if (keyboardIn) {
                val thick = JBUI.scale(2)
                g2.color = JBUI.CurrentTheme.Focus.focusColor()
                g2.stroke = BasicStroke(thick.toFloat())
                g2.drawRoundRect(thick / 2, thick / 2, width - thick, height - thick, arc, arc)
            } else {
                g2.color = line
                g2.drawRoundRect(0, 0, width - 1, height - 1, arc, arc)
            }
        } finally {
            g2.dispose()
        }
    }

    private companion object {
        const val FOCUS_OWNER = "focusOwner"
    }
}

private fun Document.plainText(): String = getText(0, length).trimEnd()
