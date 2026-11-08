package dev.ukitomato.closta.platforms.intellij.sessions

import com.intellij.openapi.keymap.KeymapUtil
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.SystemInfo
import com.intellij.openapi.util.text.StringUtil
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBTextField
import com.intellij.ui.dsl.builder.AlignX
import com.intellij.ui.dsl.builder.Panel
import com.intellij.ui.dsl.builder.RightGap
import com.intellij.ui.dsl.builder.Row
import com.intellij.ui.dsl.builder.TopGap
import com.intellij.ui.dsl.builder.panel
import com.intellij.util.ui.UIUtil
import dev.ukitomato.closta.core.models.ApprovalDecision
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.platforms.intellij.thread.CardAnswer
import dev.ukitomato.closta.platforms.intellij.thread.CardPanel
import dev.ukitomato.closta.platforms.intellij.thread.MarkdownBlocks
import dev.ukitomato.closta.platforms.intellij.thread.ThreadStyle
import dev.ukitomato.closta.platforms.intellij.thread.cardButton
import dev.ukitomato.closta.platforms.intellij.thread.diffBox
import dev.ukitomato.closta.platforms.intellij.thread.diffNote
import dev.ukitomato.closta.platforms.intellij.thread.headlineOf
import dev.ukitomato.closta.platforms.intellij.thread.inputRows
import dev.ukitomato.closta.platforms.intellij.thread.openEditDiff
import dev.ukitomato.closta.platforms.intellij.ui.noHtml
import dev.ukitomato.closta.platforms.intellij.ui.plainTip
import dev.ukitomato.closta.presenter.view.ApprovalRecord
import dev.ukitomato.closta.presenter.view.PermissionCard
import dev.ukitomato.closta.presenter.view.PlanCard
import dev.ukitomato.closta.presenter.view.QuestionCard
import dev.ukitomato.closta.presenter.view.ThreadCard
import dev.ukitomato.closta.presenter.view.allowPayload
import java.awt.BorderLayout
import java.awt.Component
import java.awt.KeyboardFocusManager
import java.awt.event.ActionEvent
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import javax.swing.AbstractAction
import javax.swing.JButton
import javax.swing.JComponent
import javax.swing.JLabel
import javax.swing.KeyStroke

// The detail pane's answer views: a permission (or an edit, with its diff), a question, a plan. They look like the
// conversation's cards but use the pane's width, and they answer only through their AnswerGate.Ask.

/** The keys an answer view may take, bound on the detail pane. Esc is never one of them. */
internal enum class AnswerKey(
    val stroke: KeyStroke,
) {
    /** Enter: a permission's Allow, only while the view itself has the keyboard. */
    ALLOW(KeyStroke.getKeyStroke("ENTER")),

    /** Alt+D: a permission's Deny…. */
    DENY(KeyStroke.getKeyStroke("alt D")),

    /** Ctrl+Enter (Cmd+Enter on macOS): a question's Answer. */
    ANSWER(KeyStroke.getKeyStroke(if (SystemInfo.isMac) "meta ENTER" else "ctrl ENTER")),
    ;

    val text: String get() = KeymapUtil.getKeystrokeText(stroke)
}

/**
 * Binds the answer keys on [pane], heard only while the keyboard is somewhere inside it, and passed to the view on
 * screen ([shown]). A key that view does not take is not consumed (it goes on to the window); Esc is never bound.
 */
internal fun bindAnswerKeys(
    pane: JComponent,
    shown: () -> AnswerView?,
) {
    AnswerKey.entries.forEach { key ->
        val name = "closta.sessions.detail.${key.name}"
        pane.getInputMap(JComponent.WHEN_ANCESTOR_OF_FOCUSED_COMPONENT).put(key.stroke, name)
        pane.actionMap.put(
            name,
            object : AbstractAction() {
                override fun isEnabled(): Boolean =
                    shown()?.takes(key, KeyboardFocusManager.getCurrentKeyboardFocusManager().focusOwner) == true

                override fun actionPerformed(e: ActionEvent) {
                    shown()?.press(key)
                }
            },
        )
    }
}

/** What an answer view works with: the [ask] it answers through and the approval record its answer is built from. */
internal class AnswerContext(
    val project: Project,
    val ask: AnswerGate.Ask,
    /** The shown request's approval record now; null once it is gone. */
    val approval: () -> ApprovalRecord?,
    val openConversation: () -> Unit,
    val markdown: MarkdownBlocks,
)

/** The view answering [card] in the detail pane. */
internal fun answerView(
    card: ThreadCard,
    context: AnswerContext,
): AnswerView =
    when (card) {
        is PermissionCard -> PermissionPane(card, context)
        is QuestionCard -> QuestionPane(card, context)
        is PlanCard -> PlanPane(card, context)
    }

/**
 * A card waiting in the detail pane. It takes the keyboard only when clicked (or when the user asks the window for the
 * next wait); its keys are the pane's ([AnswerKey]), which ask [takes] before [press].
 */
internal abstract class AnswerView(
    protected val context: AnswerContext,
) : CardPanel(ThreadStyle.pendingLine, ThreadStyle.pendingFill) {
    private val failure = JBLabel().noHtml().apply { foreground = UIUtil.getErrorForeground() }

    protected abstract val keys: Set<AnswerKey>

    init {
        layout = BorderLayout()
        isFocusable = true
        addMouseListener(
            object : MouseAdapter() {
                override fun mousePressed(e: MouseEvent) {
                    requestFocusInWindow()
                }
            },
        )
        context.ask.onFailed = {
            failure.text = ClostaBundle.message("session.answerFailed")
            failure.isVisible = true
            revalidate()
        }
    }

    /** Whether [key] is this view's with the keyboard at [owner]: Enter only while this view itself has it. */
    fun takes(
        key: AnswerKey,
        owner: Component?,
    ): Boolean = key in keys && (key != AnswerKey.ALLOW || owner === this)

    abstract fun press(key: AnswerKey)

    /** What the user put in this view so far, to give the view made again for the same request ([restore]). */
    open fun draft(): Any? = null

    open fun restore(draft: Any?) = Unit

    /** The line saying an answer could not be passed on: the CLI's state's [text], or this view's own. */
    protected fun failureRow(
        panel: Panel,
        text: String?,
    ) {
        failure.text = text.orEmpty()
        failure.isVisible = text != null
        panel.row { cell(failure) }
    }
}

/**
 * A line hidden until [open]: a sentence to go with an answer and a button sending it; Enter in the field sends too.
 */
internal class ReasonLine(
    placeholder: String,
    sendText: String,
    ask: AnswerGate.Ask,
    private val send: (String) -> Unit,
) {
    private val field = JBTextField().apply { emptyText.text = placeholder }
    private val button = cardButton(sendText) { send(field.text.trim()) }
    private lateinit var row: Row
    private var opened = false

    init {
        field.addActionListener { send(field.text.trim()) }
        ask.guard(button)
    }

    fun addTo(panel: Panel) {
        row =
            panel
                .row {
                    cell(field).align(AlignX.FILL).resizableColumn().gap(RightGap.SMALL)
                    cell(button)
                }.visible(false)
    }

    /** Shows the line and puts the keyboard in it (the user asked for it). */
    fun open(view: JComponent) {
        opened = true
        row.visible(true)
        view.revalidate()
        field.requestFocusInWindow()
    }

    /** What the user wrote, if the line was open; null when it was not. */
    fun draft(): String? = if (opened) field.text else null

    /** Opens the line again with [text], without taking the keyboard. */
    fun restore(text: String?) {
        if (text == null) return
        field.text = text
        opened = true
        row.visible(true)
    }
}

/** A label that shows its text as written, never as HTML (the text comes from the tool's input). */
internal fun JLabel.plainText() = putClientProperty("html.disable", true)

/** A button whose [mnemonic] letter is underlined while Alt is held; the key itself is the pane's, not the window's. */
internal fun keyedButton(
    text: String,
    mnemonic: Char,
    act: () -> Unit,
): JButton {
    val at = text.indexOfFirst { it.uppercaseChar() == mnemonic.uppercaseChar() }
    return object : JButton(text) {
        override fun getDisplayedMnemonicIndex(): Int = at
    }.apply {
        isFocusable = false
        addActionListener { act() }
    }
}

/**
 * A permission, or an edit with its diff: Allow (Enter) or Deny… (Alt+D), which opens a sentence to go with the
 * denial. "Don't ask again" is chosen in the conversation's card only, where its destination is.
 */
internal class PermissionPane(
    private val card: PermissionCard,
    context: AnswerContext,
) : AnswerView(context) {
    override val keys = setOf(AnswerKey.ALLOW, AnswerKey.DENY)
    private val allow = cardButton(ClostaBundle.message("sessions.window.detail.allow"), main = true) { allow() }
    private val deny = keyedButton(ClostaBundle.message("sessions.window.detail.deny"), 'D') { openDeny() }
    private val reason =
        ReasonLine(
            ClostaBundle.message("sessions.window.detail.deny.placeholder"),
            ClostaBundle.message("sessions.window.detail.deny.send"),
            context.ask,
            ::deny,
        )

    init {
        context.ask.guard(allow)
        context.ask.guard(deny)
        val headline = headlineOf(card.toolName, card.subject)
        val content =
            panel {
                row {
                    icon(headline.icon).gap(RightGap.SMALL)
                    label(headline.text).bold().gap(RightGap.SMALL).applyToComponent { plainText() }
                    headline.file?.let { file ->
                        label(file).applyToComponent {
                            plainText()
                            toolTipText = plainTip(card.subject)
                        }
                    }
                    comment(StringUtil.escapeXmlEntities(card.toolName))
                }
                card.diff?.let { diff ->
                    row { cell(diffBox(diff)).align(AlignX.FILL) }
                    row {
                        cell(diffNote(diff))
                        link(ClostaBundle.message("sessions.window.detail.openDiff")) {
                            context.approval()?.let { openEditDiff(context.project, it) }
                        }
                    }
                }
                // The headline shows a file's name only: its whole path goes in the box.
                inputRows(this, card, pathShown = false)
                // The buttons in cells of their own: a wrapping buttonLine that does not fill its row is given no
                // width and hides them (seen in the gallery), and the link goes after them.
                row {
                    cell(allow).gap(RightGap.SMALL)
                    cell(deny).gap(RightGap.COLUMNS)
                    link(ClostaBundle.message("sessions.window.detail.chooseInConversation")) {
                        context.openConversation()
                    }
                }.topGap(TopGap.SMALL)
                reason.addTo(this)
                row {
                    comment(
                        ClostaBundle.message(
                            "sessions.window.detail.permission.keys",
                            AnswerKey.ALLOW.text,
                            AnswerKey.DENY.text,
                        ),
                    )
                }
                failureRow(this, card.failure)
            }
        content.isOpaque = false
        add(content, BorderLayout.CENTER)
    }

    override fun press(key: AnswerKey) {
        when (key) {
            AnswerKey.ALLOW -> allow()
            AnswerKey.DENY -> openDeny()
            AnswerKey.ANSWER -> Unit
        }
    }

    override fun draft(): Any? = reason.draft()

    override fun restore(draft: Any?) = reason.restore(draft as? String)

    private fun allow() {
        context.ask.send {
            context.approval()?.let {
                CardAnswer(card.requestId, ApprovalDecision.Allow(card.requestId), allowPayload(it))
            }
        }
    }

    private fun openDeny() {
        if (context.ask.accepts()) reason.open(this)
    }

    private fun deny(sentence: String) {
        context.ask.send {
            context.approval()?.let { CardAnswer(card.requestId, ApprovalDecision.Deny(card.requestId), sentence) }
        }
    }
}
