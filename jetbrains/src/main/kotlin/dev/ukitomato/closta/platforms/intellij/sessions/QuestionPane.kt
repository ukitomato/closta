package dev.ukitomato.closta.platforms.intellij.sessions

import com.intellij.icons.AllIcons
import com.intellij.openapi.keymap.KeymapUtil
import com.intellij.openapi.util.SystemInfo
import com.intellij.openapi.util.text.StringUtil
import com.intellij.ui.DocumentAdapter
import com.intellij.ui.components.JBTextField
import com.intellij.ui.dsl.builder.AlignX
import com.intellij.ui.dsl.builder.MAX_LINE_LENGTH_WORD_WRAP
import com.intellij.ui.dsl.builder.Panel
import com.intellij.ui.dsl.builder.RightGap
import com.intellij.ui.dsl.builder.RowLayout
import com.intellij.ui.dsl.builder.TopGap
import com.intellij.ui.dsl.builder.panel
import dev.ukitomato.closta.core.models.ApprovalDecision
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.platforms.intellij.thread.CardAnswer
import dev.ukitomato.closta.platforms.intellij.thread.CardKey
import dev.ukitomato.closta.platforms.intellij.thread.CardKind
import dev.ukitomato.closta.platforms.intellij.thread.WrappingCheckBox
import dev.ukitomato.closta.platforms.intellij.thread.WrappingRadioButton
import dev.ukitomato.closta.platforms.intellij.thread.buttonLine
import dev.ukitomato.closta.platforms.intellij.thread.cardButton
import dev.ukitomato.closta.presenter.view.QuestionCard
import dev.ukitomato.closta.presenter.view.QuestionPick
import dev.ukitomato.closta.presenter.view.QuestionView
import dev.ukitomato.closta.presenter.view.answerPayload
import dev.ukitomato.closta.presenter.view.questionAnswers
import dev.ukitomato.closta.presenter.view.questionsComplete
import java.awt.BorderLayout
import java.awt.event.InputEvent
import java.awt.event.KeyEvent
import javax.swing.AbstractButton
import javax.swing.KeyStroke
import javax.swing.event.DocumentEvent

/**
 * A question in the detail pane: each question with its options (radio buttons, or check boxes when several may be
 * chosen) and their descriptions, and Other with a line of one's own. Answer (Ctrl+Enter) is pressable once every
 * question has an answer; Skip (Esc) answers none. Esc in the Other line only leaves the line, as in the conversation.
 */
internal class QuestionPane(
    private val card: QuestionCard,
    context: AnswerContext,
) : AnswerView(context) {
    private val picks = ArrayList<Pick>()
    private val answer = cardButton(ClostaBundle.message("thread.question.answer"), main = true) { send() }
    private val skip = cardButton(ClostaBundle.message("thread.question.skip")) { skip() }

    private class Pick(
        val question: String,
        val options: List<Pair<String, AbstractButton>>,
        val other: AbstractButton,
        val otherText: JBTextField,
    ) {
        fun gathered(): QuestionPick =
            QuestionPick(
                question,
                options.filter { it.second.isSelected }.map { it.first },
                otherText.text.takeIf { other.isSelected },
            )
    }

    init {
        val content =
            panel {
                row {
                    icon(AllIcons.General.QuestionDialog).gap(RightGap.SMALL)
                    label(
                        if (card.questions.size > 1) {
                            ClostaBundle.message("thread.question.titleMany", card.questions.size)
                        } else {
                            ClostaBundle.message("thread.question.title")
                        },
                    ).bold()
                        .gap(RightGap.SMALL)
                    comment("AskUserQuestion")
                }
                card.questions.forEach { question(this, it) }
                row { cell(buttonLine(listOf(answer, skip))).align(AlignX.FILL) }.topGap(TopGap.SMALL)
                row {
                    comment(ClostaBundle.message("sessions.window.detail.question.keys", answerKeyText()))
                }
                failureRow(this, card.failure)
            }
        content.isOpaque = false
        add(content, BorderLayout.CENTER)
        context.ask.guard(answer, ::complete)
        context.ask.guard(skip)
        keys(CardKind.QUESTION, 0) { key ->
            when (key) {
                CardKey.Answer -> send()
                CardKey.Deny -> skip()
                CardKey.LeaveText -> firstOption()?.requestFocusInWindow()
                is CardKey.Choose, CardKey.ToComposer -> Unit
            }
        }
    }

    private fun firstOption(): AbstractButton? =
        picks
            .firstOrNull()
            ?.options
            ?.firstOrNull()
            ?.second

    // Per question: which options are chosen, whether Other is, and Other's text.
    private data class Picked(
        val options: List<Boolean>,
        val other: Boolean,
        val otherText: String,
    )

    override fun draft(): Any? =
        picks.map { pick ->
            Picked(pick.options.map { it.second.isSelected }, pick.other.isSelected, pick.otherText.text)
        }

    override fun restore(draft: Any?) {
        val picked = (draft as? List<*>)?.filterIsInstance<Picked>() ?: return
        if (picked.size != picks.size) return
        picks.zip(picked).forEach { (pick, was) ->
            if (was.options.size != pick.options.size) return@forEach
            pick.otherText.text = was.otherText
            pick.options.zip(was.options).forEach { (option, on) -> option.second.isSelected = on }
            pick.other.isSelected = was.other
        }
        context.ask.refresh()
    }

    private fun complete(): Boolean = questionsComplete(picks.map { it.gathered() })

    private fun question(
        panel: Panel,
        question: QuestionView,
    ) {
        fun choice(label: String): AbstractButton =
            (if (question.multiSelect) WrappingCheckBox(label) else WrappingRadioButton(label)).apply {
                isOpaque = false
                addItemListener { context.ask.refresh() }
            }
        val options = question.options.map { it.label to choice(it.label) }
        val other = choice(ClostaBundle.message("thread.question.other"))
        val otherText =
            JBTextField().apply {
                emptyText.text = ClostaBundle.message("thread.question.other.placeholder")
                document.addDocumentListener(
                    object : DocumentAdapter() {
                        override fun textChanged(e: DocumentEvent) {
                            if (text.isNotBlank()) other.isSelected = true
                            context.ask.refresh()
                        }
                    },
                )
            }
        val header = question.header?.let { header -> panel.row { comment(StringUtil.escapeXmlEntities(header)) } }
        panel
            .row { text(StringUtil.escapeXmlEntities(question.text)).bold() }
            .topGap(if (header == null) TopGap.MEDIUM else TopGap.NONE)
        header?.topGap(TopGap.MEDIUM)
        // The radio buttons' group is the DSL's. Each row is laid out on its own, not in the columns of the rows above
        // (the title's icon, label and comment): so an option takes the pane's width and wraps only when it is narrow.
        panel.buttonsGroup {
            question.options.zip(options).forEach { (option, pair) ->
                row {
                    cell(pair.second).align(AlignX.FILL).resizableColumn().apply {
                        option.description?.takeIf { it.isNotBlank() }?.let {
                            comment(StringUtil.escapeXmlEntities(it), MAX_LINE_LENGTH_WORD_WRAP)
                        }
                    }
                }.layout(RowLayout.INDEPENDENT)
            }
            row {
                cell(other).gap(RightGap.SMALL)
                cell(otherText).align(AlignX.FILL).resizableColumn()
            }.layout(RowLayout.INDEPENDENT)
        }
        picks += Pick(question.text, options, other, otherText)
    }

    private fun send() {
        if (!complete()) return
        context.ask.send {
            val answers = questionAnswers(picks.map { it.gathered() })
            context.approval()?.let {
                CardAnswer(card.requestId, ApprovalDecision.Answered(card.requestId), answerPayload(it, answers))
            }
        }
    }

    private fun skip() {
        context.ask.send { CardAnswer(card.requestId, ApprovalDecision.Deny(card.requestId), "") }
    }
}

/** Ctrl+Enter (Cmd+Enter on macOS) as the IDE writes it, the key that answers ([CardKey.Answer]). */
private fun answerKeyText(): String =
    KeymapUtil.getKeystrokeText(
        KeyStroke.getKeyStroke(
            KeyEvent.VK_ENTER,
            if (SystemInfo.isMac) InputEvent.META_DOWN_MASK else InputEvent.CTRL_DOWN_MASK,
        ),
    )
