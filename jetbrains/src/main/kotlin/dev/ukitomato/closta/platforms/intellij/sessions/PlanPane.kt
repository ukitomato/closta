package dev.ukitomato.closta.platforms.intellij.sessions

import com.intellij.icons.AllIcons
import com.intellij.ui.dsl.builder.AlignX
import com.intellij.ui.dsl.builder.RightGap
import com.intellij.ui.dsl.builder.TopGap
import com.intellij.ui.dsl.builder.panel
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.platforms.intellij.thread.CardAnswer
import dev.ukitomato.closta.platforms.intellij.thread.CardKey
import dev.ukitomato.closta.platforms.intellij.thread.CardKind
import dev.ukitomato.closta.platforms.intellij.thread.PLAN_CHOICES
import dev.ukitomato.closta.platforms.intellij.thread.buttonLine
import dev.ukitomato.closta.platforms.intellij.thread.cardButton
import dev.ukitomato.closta.platforms.intellij.thread.enterNeverPresses
import dev.ukitomato.closta.presenter.view.PlanCard
import dev.ukitomato.closta.presenter.view.PlanChoice
import dev.ukitomato.closta.presenter.view.planAnswer
import java.awt.BorderLayout
import javax.swing.JComponent

/**
 * A plan: its Markdown in a box that scrolls, and the three answers with the conversation card's keys: approve with
 * auto edits (1), approve and review edits (2), keep planning (3), which opens a sentence to go with it. Esc keeps
 * planning without one; Enter never approves.
 */
internal class PlanPane(
    private val card: PlanCard,
    context: AnswerContext,
) : AnswerView(context) {
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
                    choose(PlanChoice.AUTO_EDITS)
                }.enterNeverPresses(),
                cardButton(ClostaBundle.message("sessions.window.detail.plan.askEdits")) {
                    choose(PlanChoice.ASK_EDITS)
                }.enterNeverPresses(),
                cardButton(ClostaBundle.message("sessions.window.detail.plan.keepPlanning")) {
                    choose(PlanChoice.KEEP_PLANNING)
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
                row { comment(ClostaBundle.message("sessions.window.detail.plan.keys", buttons.size)) }
                failureRow(this, card.failure)
            }
        listOf(title, answers).forEach { it.isOpaque = false }
        add(title, BorderLayout.NORTH)
        add(planText(), BorderLayout.CENTER)
        add(answers, BorderLayout.SOUTH)
        keys(CardKind.PLAN, buttons.size) { key ->
            when (key) {
                is CardKey.Choose -> choose(PLAN_CHOICES[key.index])
                CardKey.Deny -> decide(PlanChoice.KEEP_PLANNING, reason.draft().orEmpty())
                CardKey.LeaveText -> reason.close(this)
                CardKey.Answer, CardKey.ToComposer -> Unit
            }
        }
    }

    /** Approves at once; keeping planning first opens the line for a sentence to go with it. */
    private fun choose(choice: PlanChoice) {
        if (choice != PlanChoice.KEEP_PLANNING) {
            decide(choice, "")
        } else if (context.ask.accepts()) {
            reason.open(this)
        }
    }

    private fun planText(): JComponent {
        val plan = card.plan ?: return greyLine(ClostaBundle.message("thread.plan.missing"))
        return markdownBox(context.markdown.of(plan))
    }

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
