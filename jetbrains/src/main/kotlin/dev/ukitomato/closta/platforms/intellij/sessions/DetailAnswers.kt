package dev.ukitomato.closta.platforms.intellij.sessions

import com.intellij.openapi.project.Project
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
import dev.ukitomato.closta.platforms.intellij.thread.CardKey
import dev.ukitomato.closta.platforms.intellij.thread.CardKind
import dev.ukitomato.closta.platforms.intellij.thread.CardPanel
import dev.ukitomato.closta.platforms.intellij.thread.MarkdownBlocks
import dev.ukitomato.closta.platforms.intellij.thread.ThreadStyle
import dev.ukitomato.closta.platforms.intellij.thread.cardButton
import dev.ukitomato.closta.platforms.intellij.thread.cardKeys
import dev.ukitomato.closta.platforms.intellij.thread.diffBox
import dev.ukitomato.closta.platforms.intellij.thread.diffNote
import dev.ukitomato.closta.platforms.intellij.thread.enterNeverPresses
import dev.ukitomato.closta.platforms.intellij.thread.headlineOf
import dev.ukitomato.closta.platforms.intellij.thread.inputRows
import dev.ukitomato.closta.platforms.intellij.thread.openEditDiff
import dev.ukitomato.closta.platforms.intellij.thread.pathRow
import dev.ukitomato.closta.platforms.intellij.ui.noHtml
import dev.ukitomato.closta.platforms.intellij.ui.plainTip
import dev.ukitomato.closta.presenter.view.ApprovalRecord
import dev.ukitomato.closta.presenter.view.PermissionCard
import dev.ukitomato.closta.presenter.view.PermissionChoice
import dev.ukitomato.closta.presenter.view.PlanCard
import dev.ukitomato.closta.presenter.view.QuestionCard
import dev.ukitomato.closta.presenter.view.ThreadCard
import dev.ukitomato.closta.presenter.view.allowPayload
import dev.ukitomato.closta.presenter.view.detailChoice
import java.awt.BorderLayout
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import javax.swing.JComponent

// The detail pane's answer views: a permission (or an edit, with its diff), a question, a plan. They look like the
// conversation's cards, with their keys, but use the pane's width, and they answer only through their AnswerGate.Ask.

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
 * next wait); then it hears the conversation card's keys ([cardKeys]) anywhere in it.
 */
internal abstract class AnswerView(
    protected val context: AnswerContext,
) : CardPanel(ThreadStyle.pendingLine, ThreadStyle.pendingFill, watchesKeyboard = true) {
    private val failure = JBLabel().noHtml().apply { foreground = UIUtil.getErrorForeground() }

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

    /**
     * Gives this view the conversation card's keys of [kind] ([cardKeys]). The view itself stays focusable, a
     * question's too: the window puts the keyboard in it.
     */
    protected fun keys(
        kind: CardKind,
        choices: Int,
        act: (CardKey) -> Unit,
    ) {
        cardKeys(this, kind, { choices }, act)
        isFocusable = true
    }

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
 * A line hidden until [open]: a sentence to go with an answer and a button sending it; Enter in the field sends too,
 * Esc there only closes it ([close]).
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

    /** Hides the line again and gives the keyboard back to [view]; what was written stays for the next [open]. */
    fun close(view: JComponent) {
        opened = false
        row.visible(false)
        view.revalidate()
        view.requestFocusInWindow()
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

/**
 * A permission, or an edit with its diff, with the conversation card's numbers ([detailChoice]): Allow (1), or Deny…
 * (2, or 3 when the CLI offered a rule to keep), which opens a sentence to go with the denial. Esc denies without one;
 * Enter never allows. "Don't ask again" is chosen in the conversation's card only, where its destination is.
 */
internal class PermissionPane(
    private val card: PermissionCard,
    context: AnswerContext,
) : AnswerView(context) {
    private val hasSuggestions = card.suggestions.isNotEmpty()

    /** Deny's number: the conversation's, the last of its buttons (after Always Allow when there is one). */
    private val denyNumber =
        listOfNotNull(
            PermissionChoice.ALLOW,
            PermissionChoice.ALLOW_KEEP.takeIf { hasSuggestions },
            PermissionChoice.DENY,
        ).size
    private val allow =
        cardButton(ClostaBundle.message("sessions.window.detail.allow"), main = true) { allow() }.enterNeverPresses()
    private val deny = cardButton(ClostaBundle.message("sessions.window.detail.deny", denyNumber)) { openDeny() }
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
                    label(headline.text).bold().gap(RightGap.SMALL).applyToComponent { noHtml() }
                    headline.file?.let { file ->
                        label(file).applyToComponent {
                            noHtml()
                            toolTipText = plainTip(card.subject)
                        }
                    }
                    comment(StringUtil.escapeXmlEntities(card.toolName))
                }
                pathRow(this, card)
                card.diff?.let { diff ->
                    row { cell(diffBox(diff)).align(AlignX.FILL) }
                    row {
                        cell(diffNote(diff))
                        link(ClostaBundle.message("sessions.window.detail.openDiff")) {
                            context.approval()?.let { openEditDiff(context.project, it) }
                        }
                    }
                }
                inputRows(this, card)
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
                row { comment(ClostaBundle.message("sessions.window.detail.permission.keys", denyNumber)) }
                failureRow(this, card.failure)
            }
        content.isOpaque = false
        add(content, BorderLayout.CENTER)
        keys(CardKind.PERMISSION, denyNumber) { key ->
            when (key) {
                is CardKey.Choose ->
                    when (detailChoice(key.index, hasSuggestions)) {
                        PermissionChoice.ALLOW -> allow()
                        PermissionChoice.DENY -> openDeny()
                        PermissionChoice.ALLOW_KEEP, null -> Unit
                    }
                CardKey.Deny -> deny("")
                CardKey.LeaveText -> reason.close(this)
                CardKey.Answer, CardKey.ToComposer -> Unit
            }
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
