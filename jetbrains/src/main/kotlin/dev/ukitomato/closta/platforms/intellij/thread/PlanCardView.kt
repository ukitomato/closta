package dev.ukitomato.closta.platforms.intellij.thread

import com.intellij.icons.AllIcons
import com.intellij.openapi.fileEditor.ex.FileEditorManagerEx
import com.intellij.openapi.fileTypes.PlainTextFileType
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Key
import com.intellij.openapi.util.text.StringUtil
import com.intellij.testFramework.LightVirtualFile
import com.intellij.ui.components.JBTextField
import com.intellij.ui.dsl.builder.AlignX
import com.intellij.ui.dsl.builder.RightGap
import com.intellij.ui.dsl.builder.Row
import com.intellij.ui.dsl.builder.TopGap
import com.intellij.ui.dsl.builder.panel
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.presenter.view.ApprovalOutcome
import dev.ukitomato.closta.presenter.view.ApprovalRecord
import dev.ukitomato.closta.presenter.view.PlanCard
import dev.ukitomato.closta.presenter.view.PlanChoice
import dev.ukitomato.closta.presenter.view.PlanGo
import dev.ukitomato.closta.presenter.view.planAnswer
import java.awt.BorderLayout
import java.util.concurrent.ConcurrentHashMap
import javax.swing.JComponent

/**
 * Opens a plan in a plain text editor tab (a read-only [LightVirtualFile], no preview) without bringing it to the front
 * or taking the keyboard: the conversation the user reads stays where it is. The same request opens one tab in the
 * project, however many screens show its card (the sidebar and an editor tab can show the same conversation).
 */
class PlanTabs(
    private val project: Project,
) {
    // Kept on the project, so every screen of the project shares them (on the EDT).
    private val opened: Opened get() = project.getUserData(OPENED) ?: Opened().also { project.putUserData(OPENED, it) }

    /** Opens [card]'s plan behind the tabs the first time the card is seen (a card made again does not reopen it). */
    fun openOnce(card: PlanCard) {
        if (card.answered == null && opened.shown.add(card.requestId)) open(card, bringToFront = false)
    }

    fun open(
        card: PlanCard,
        bringToFront: Boolean,
    ) {
        val plan = card.plan ?: return
        val file =
            opened.files.computeIfAbsent(card.requestId) {
                LightVirtualFile(
                    ClostaBundle.message("thread.plan.fileName"),
                    // Plain text, not Markdown: the Markdown editor's preview is a web view that fetches the images a
                    // plan names, and this tab opens by itself.
                    PlainTextFileType.INSTANCE,
                    plan,
                ).apply { isWritable = false }
            }
        // FileEditorOpenRequest moved in 2026.3 and its replacement is not in 2026.2: the one call both have opens
        // the tab, and a background open puts the tab that was selected back.
        val editors = FileEditorManagerEx.getInstanceEx(project)
        val before = editors.selectedEditor?.file?.let { editors.getSelectedEditorWithProvider(it) }
        editors.openFile(file, bringToFront)
        if (!bringToFront && before != null) {
            editors.setSelectedEditor(before.fileEditor.file, before.provider.editorTypeId)
        }
    }
}

/** The plans' files by request, and the requests whose plan was opened once already, in a project. */
private class Opened {
    val files = ConcurrentHashMap<String, LightVirtualFile>()
    val shown: MutableSet<String> = ConcurrentHashMap.newKeySet()
}

private val OPENED = Key.create<Opened>("closta.plan.tabs")

/** The plan's title: its first line that says something, without the Markdown heading marks. */
internal fun planTitle(plan: String?): String? =
    plan
        ?.lineSequence()
        ?.map { it.trim().trimStart('#').trim() }
        ?.firstOrNull { it.isNotEmpty() }

internal fun planOutcomeText(outcome: ApprovalOutcome): String =
    when (outcome) {
        ApprovalOutcome.APPROVED -> ClostaBundle.message("thread.plan.approved")
        ApprovalOutcome.DENIED -> ClostaBundle.message("thread.plan.keptPlanning")
        ApprovalOutcome.CANCELLED -> ClostaBundle.message("thread.card.cancelled")
        ApprovalOutcome.EXPIRED -> ClostaBundle.message("thread.card.expired")
    }

/**
 * The plan's waiting card: whether to approve the plan, with its title and a link to its tab, then approve and go on
 * in the card's mode (1), approve and review edits (2), keep planning (3), by key or button: Esc to keep planning, a
 * link for a sentence to go with it, and Enter for nothing ([cardKey]). It answers once.
 */
internal class PlanView(
    private val card: PlanCard,
    private val approvals: (String) -> ApprovalRecord?,
    private val answer: (CardAnswer) -> Unit,
    private val tabs: PlanTabs,
    private val resized: (JComponent) -> Unit,
    private val letGo: () -> Unit,
) : CardPanel(ThreadStyle.pendingLine, ThreadStyle.pendingFill, watchesKeyboard = true) {
    private var sent = false
    private val buttons =
        listOf(
            cardButton(ClostaBundle.message(planGoKey(card.go, "thread.plan.go")), main = true) {
                decide(PlanChoice.GO)
            }.enterNeverPresses(),
            cardButton(ClostaBundle.message("thread.plan.askEdits")) {
                decide(PlanChoice.ASK_EDITS)
            }.enterNeverPresses(),
            cardButton(ClostaBundle.message("thread.plan.keepPlanning")) { decide(PlanChoice.KEEP_PLANNING) },
        )
    private val comment =
        JBTextField().apply { emptyText.text = ClostaBundle.message("thread.plan.comment.placeholder") }
    private lateinit var commentRow: Row
    private lateinit var keysRow: Row

    init {
        layout = BorderLayout()
        val content =
            panel {
                row {
                    icon(AllIcons.Actions.ListFiles).gap(RightGap.SMALL)
                    label(ClostaBundle.message("thread.plan.title")).bold().applyToComponent {
                        toolTipText = "ExitPlanMode"
                    }
                }
                if (card.plan != null) {
                    row {
                        planTitle(card.plan)?.let { text(StringUtil.escapeXmlEntities(it)).gap(RightGap.SMALL) }
                        link(ClostaBundle.message("thread.plan.open")) { tabs.open(card, bringToFront = true) }
                    }
                } else {
                    row { comment(ClostaBundle.message("thread.plan.missing")) }
                }
                row { cell(buttonLine(buttons)).align(AlignX.FILL) }.topGap(TopGap.SMALL)
                row { link(ClostaBundle.message("thread.card.addNote")) { openNote() } }
                keysRow = row { comment(ClostaBundle.message("thread.plan.keys", buttons.size)) }.visible(false)
                commentRow = row { cell(comment).align(AlignX.FILL) }.visible(false)
                failureRow(this, card.failure)
            }
        content.isOpaque = false
        add(content, BorderLayout.CENTER)
        getAccessibleContext().accessibleName =
            listOfNotNull(ClostaBundle.message("thread.plan.title"), planTitle(card.plan)).joinToString(": ")
        comment.addActionListener { decide(PlanChoice.KEEP_PLANNING) }
        noteKeys(comment, this, letGo) { showNote(false) }
        cardKeys(this, CardKind.PLAN, { buttons.size }) { key ->
            when (key) {
                is CardKey.Choose -> decide(PLAN_CHOICES[key.index])
                CardKey.Deny -> decide(PlanChoice.KEEP_PLANNING)
                CardKey.ToComposer -> letGo()
                else -> Unit
            }
        }
        onKeyboard = { inside ->
            keysRow.visible(cardHint(inside, 1) == CardHint.KEYS)
            resized(this)
        }
    }

    private fun openNote() {
        showNote(true)
        comment.requestFocusInWindow()
    }

    private fun showNote(shown: Boolean) {
        commentRow.visible(shown)
        resized(this)
    }

    private fun decide(choice: PlanChoice) {
        if (sent) return
        val approval = approvals(card.requestId) ?: return
        sent = true
        buttons.forEach { it.isEnabled = false }
        val made = planAnswer(card, approval, choice, comment.text)
        answer(CardAnswer(card.requestId, made.decision, made.payload, made.passedOn, made.modeAfter))
    }
}

/** The bundle key of the first button: [prefix] and the mode the card's yes switches to. */
internal fun planGoKey(
    go: PlanGo,
    prefix: String,
): String =
    "$prefix." +
        when (go) {
            PlanGo.AUTO -> "auto"
            PlanGo.ACCEPT_EDITS -> "acceptEdits"
            PlanGo.BYPASS -> "bypass"
        }

/** The plan's answers in the buttons' order, the order of the keys 1 to 3. */
internal val PLAN_CHOICES = listOf(PlanChoice.GO, PlanChoice.ASK_EDITS, PlanChoice.KEEP_PLANNING)
