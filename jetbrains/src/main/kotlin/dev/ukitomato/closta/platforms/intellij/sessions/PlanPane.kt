package dev.ukitomato.closta.platforms.intellij.sessions

import com.intellij.icons.AllIcons
import com.intellij.ui.dsl.builder.AlignX
import com.intellij.ui.dsl.builder.RightGap
import com.intellij.ui.dsl.builder.TopGap
import com.intellij.ui.dsl.builder.panel
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.platforms.intellij.thread.CardAnswer
import dev.ukitomato.closta.platforms.intellij.thread.buttonLine
import dev.ukitomato.closta.platforms.intellij.thread.cardButton
import dev.ukitomato.closta.presenter.view.PlanCard
import dev.ukitomato.closta.presenter.view.PlanChoice
import dev.ukitomato.closta.presenter.view.planAnswer
import java.awt.BorderLayout
import javax.swing.JComponent

/**
 * A plan: its Markdown in a box that scrolls, and the three answers as buttons only (no key: the strongest answer is
 * never one keystroke away from a plan not read). Keep Planning… opens a sentence to go with it.
 */
internal class PlanPane(
    private val card: PlanCard,
    context: AnswerContext,
) : AnswerView(context) {
    override val keys = emptySet<AnswerKey>()
    private val reason =
        ReasonLine(
            ClostaBundle.message("sessions.window.detail.plan.placeholder"),
            ClostaBundle.message("sessions.window.detail.plan.keepSend"),
            context.ask,
        ) { decide(PlanChoice.KEEP_PLANNING, it) }

    init {
        val buttons =
            listOf(
                cardButton(ClostaBundle.message("sessions.window.detail.plan.autoEdits")) {
                    decide(PlanChoice.AUTO_EDITS, "")
                },
                cardButton(ClostaBundle.message("sessions.window.detail.plan.askEdits")) {
                    decide(PlanChoice.ASK_EDITS, "")
                },
                cardButton(ClostaBundle.message("sessions.window.detail.plan.keepPlanning")) {
                    if (context.ask.accepts()) reason.open(this)
                },
            )
        buttons.forEach { context.ask.guard(it) }
        val title =
            panel {
                row {
                    icon(AllIcons.Actions.ListFiles).gap(RightGap.SMALL)
                    label(ClostaBundle.message("thread.plan.title")).bold().gap(RightGap.SMALL)
                    comment("ExitPlanMode")
                }
            }
        val answers =
            panel {
                row { cell(buttonLine(buttons)).align(AlignX.FILL) }.topGap(TopGap.SMALL)
                reason.addTo(this)
                failureRow(this, card.failure)
            }
        listOf(title, answers).forEach { it.isOpaque = false }
        add(title, BorderLayout.NORTH)
        add(planText(), BorderLayout.CENTER)
        add(answers, BorderLayout.SOUTH)
    }

    private fun planText(): JComponent {
        val plan = card.plan ?: return greyLine(ClostaBundle.message("thread.plan.missing"))
        return markdownBox(context.markdown.of(plan))
    }

    override fun press(key: AnswerKey) = Unit

    override fun draft(): Any? = reason.draft()

    override fun restore(draft: Any?) = reason.restore(draft as? String)

    private fun decide(
        choice: PlanChoice,
        sentence: String,
    ) {
        context.ask.send {
            context.approval()?.let {
                val made = planAnswer(card, it, choice, sentence)
                CardAnswer(card.requestId, made.decision, made.payload, made.passedOn, made.modeAfter)
            }
        }
    }
}
