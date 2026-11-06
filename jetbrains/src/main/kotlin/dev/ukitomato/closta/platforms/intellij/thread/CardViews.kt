package dev.ukitomato.closta.platforms.intellij.thread

import com.intellij.icons.AllIcons
import com.intellij.openapi.util.text.StringUtil
import com.intellij.ui.DocumentAdapter
import com.intellij.ui.components.DropDownLink
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBTextField
import com.intellij.ui.dsl.builder.AlignX
import com.intellij.ui.dsl.builder.MAX_LINE_LENGTH_WORD_WRAP
import com.intellij.ui.dsl.builder.Panel
import com.intellij.ui.dsl.builder.RightGap
import com.intellij.ui.dsl.builder.Row
import com.intellij.ui.dsl.builder.TopGap
import com.intellij.ui.dsl.builder.panel
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.UIUtil
import dev.ukitomato.closta.core.models.ApprovalDecision
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.presenter.view.ApprovalOutcome
import dev.ukitomato.closta.presenter.view.ApprovalRecord
import dev.ukitomato.closta.presenter.view.PassedOn
import dev.ukitomato.closta.presenter.view.PermissionCard
import dev.ukitomato.closta.presenter.view.PlanCard
import dev.ukitomato.closta.presenter.view.QuestionCard
import dev.ukitomato.closta.presenter.view.QuestionView
import dev.ukitomato.closta.presenter.view.SUGGESTION_DESTINATIONS
import dev.ukitomato.closta.presenter.view.SuggestionRecord
import dev.ukitomato.closta.presenter.view.ThreadCard
import dev.ukitomato.closta.presenter.view.allowPayload
import dev.ukitomato.closta.presenter.view.answerPayload
import dev.ukitomato.closta.presenter.view.passedOn
import dev.ukitomato.closta.presenter.view.withDestination
import java.awt.BorderLayout
import java.awt.KeyboardFocusManager
import javax.swing.AbstractButton
import javax.swing.JButton
import javax.swing.JComponent
import javax.swing.JPanel
import javax.swing.SwingUtilities
import javax.swing.event.DocumentEvent

/** An answer to a card: what is decided, the payload that goes with it, and what goes with an allow. */
data class CardAnswer(
    val requestId: String,
    val decision: ApprovalDecision,
    val payload: String,
    val passedOn: PassedOn = PassedOn(),
    /** The Permission mode to switch to once the answer is sent (a plan's yes). */
    val modeAfter: String? = null,
)

/**
 * The permission, question and plan cards, laid out with the Kotlin UI DSL. A waiting card stands out as the theme's
 * banner and says first what Claude wants to do; a permission card answers with 1, 2 or 3 (or a button), Esc for no,
 * Tab for a sentence to go with the no, and Enter for nothing ([cardKey]). Each card sends its answer once: its
 * buttons grey out the moment it is answered, and once the CLI's state says so it shrinks to one quiet line. A card
 * takes the keyboard only when the keyboard is already in this conversation, so it never takes it from the editor or
 * the composer.
 */
@Suppress("LongParameterList") // what the cards ask of the surface, one function each
class CardViews(
    private val approvals: (String) -> ApprovalRecord?,
    private val answer: (CardAnswer) -> Unit,
    private val focusScope: () -> JComponent?,
    private val openDiff: (ApprovalRecord) -> Unit = {},
    private val plans: PlanTabs? = null,
    private val openFile: (String) -> Unit = {},
    /** A card's height changed (its comment line opened); the column measures the row holding it again. */
    private val resized: (JComponent) -> Unit = {},
    /** The card that had the keyboard was answered, or its key to go back pressed: the keyboard goes back. */
    private val letGo: () -> Unit = {},
) {
    // The card that had the keyboard when it was made again (its answer failed, or it was answered), by request, and
    // the part of it that had it ([focusRole]): the card made next for that request takes it back, or lets it go.
    private var refocus: Pair<String, String>? = null

    fun create(card: ThreadCard): JComponent {
        val outcome = card.answered
        val again = refocus?.takeIf { it.first == card.requestId }
        if (again != null) refocus = null
        val made =
            when {
                card is PlanCard -> plan(card)
                outcome != null -> answeredLine(outcome, outcomeText(card, outcome), about(card))
                card is PermissionCard -> PermissionView(card)
                card is QuestionCard -> QuestionCardView(card)
                else -> JPanel()
            }
        when {
            again == null -> Unit
            outcome != null -> letGo()
            // Later, once the column has put the new card where the old one was.
            else -> SwingUtilities.invokeLater { partFor(again.second, made)?.requestFocusInWindow() }
        }
        return made
    }

    private fun about(card: ThreadCard): String? =
        when (card) {
            is PermissionCard ->
                card.diff?.let { "${card.subject?.substringAfterLast('/')} +${it.added} −${it.removed}" }
                    ?: card.subject
            is QuestionCard -> card.questions.firstOrNull()?.text
            is PlanCard -> null
        }

    /**
     * Whether [component] can show [card] as it is. A card changes only when it is answered or its answer fails, and is
     * then made again, so this is never; it is the place to keep one if a card ever changes while it is read. When the
     * keyboard is in the card going away, the one made for it next takes it back ([create]).
     */
    @Suppress("FunctionOnlyReturningConstant")
    fun update(
        component: JComponent,
        card: ThreadCard,
    ): Boolean {
        focusRole(KeyboardFocusManager.getCurrentKeyboardFocusManager().focusOwner, component)?.let { role ->
            refocus = card.requestId to role
        }
        return false
    }

    private fun plan(card: PlanCard): JComponent {
        val tabs = plans ?: return JBLabel(ClostaBundle.message("thread.plan.inMainConversation"))
        // Later, not while the column makes the row: opening a tab lays the window out, and the column would make the
        // same row a second time inside this one.
        SwingUtilities.invokeLater { tabs.openOnce(card) }
        val outcome = card.answered
        return if (outcome != null) {
            answeredLine(outcome, planOutcomeText(outcome), planTitle(card.plan))
        } else {
            PlanView(card, approvals, answer, tabs, resized, letGo).also { takeFocusIfHere(it) }
        }
    }

    private fun outcomeText(
        card: ThreadCard,
        outcome: ApprovalOutcome,
    ): String =
        when (outcome) {
            ApprovalOutcome.APPROVED ->
                ClostaBundle.message(if (card is QuestionCard) "thread.card.answered" else "thread.card.allowed")
            ApprovalOutcome.DENIED ->
                ClostaBundle.message(if (card is QuestionCard) "thread.card.notAnswered" else "thread.card.denied")
            ApprovalOutcome.CANCELLED -> ClostaBundle.message("thread.card.cancelled")
            ApprovalOutcome.EXPIRED -> ClostaBundle.message("thread.card.expired")
        }

    private fun takeFocusIfHere(target: JComponent) {
        SwingUtilities.invokeLater {
            val owner = KeyboardFocusManager.getCurrentKeyboardFocusManager().focusOwner
            val scope = focusScope() ?: return@invokeLater
            if (target.isShowing && cardMayTakeFocus(owner, scope)) target.requestFocusInWindow()
        }
    }

    /**
     * A waiting permission card: what Claude wants to do with the tool's icon, what it runs on (the command, or the
     * file and its diff), and the answers as buttons: Allow (1), Always Allow (2) when the CLI offers a rule to keep,
     * Deny (3). Esc denies, Tab opens a sentence to go with the denial, Shift+Tab moves on.
     */
    private inner class PermissionView(
        private val card: PermissionCard,
    ) : CardPanel(ThreadStyle.pendingLine, ThreadStyle.pendingFill, watchesKeyboard = true) {
        private var sent = false
        private var destination: String? = card.suggestions.firstOrNull()?.destination
        private val buttons = ArrayList<JButton>()
        private val comment =
            JBTextField().apply { emptyText.text = ClostaBundle.message("thread.permission.comment.placeholder") }
        private lateinit var commentRow: Row
        private lateinit var keysRow: Row

        init {
            layout = BorderLayout()
            val headline = headlineOf(card.toolName, card.subject)
            val yes = cardButton(ClostaBundle.message("thread.permission.allow"), main = true) { decide(Choice.YES) }
            val keep =
                card.suggestions.firstOrNull()?.let { first ->
                    cardButton(keepLabel(), act = { decide(Choice.KEEP) }).apply {
                        toolTipText = first.detail.ifEmpty { first.kind }
                    }
                }
            val no =
                cardButton(ClostaBundle.message("thread.permission.deny", listOfNotNull(yes, keep).size + 1)) {
                    decide(Choice.NO)
                }
            buttons += listOfNotNull(yes, keep, no)
            val content =
                panel {
                    row {
                        icon(headline.icon).gap(RightGap.SMALL)
                        // The tool's own name is for who wants it: in the tooltip, not on the line.
                        label(headline.text).bold().gap(RightGap.SMALL).applyToComponent { toolTipText = card.toolName }
                        val path = card.subject
                        if (headline.file != null && path != null) {
                            cell(fileLink(headline.file, path) { openFile(path) })
                        }
                    }
                    val diff = card.diff
                    when {
                        diff != null -> {
                            row { cell(diffBox(diff)).align(AlignX.FILL) }
                            row {
                                cell(diffNote(diff))
                                link(ClostaBundle.message("thread.permission.openDiff")) {
                                    approvals(card.requestId)?.let(openDiff)
                                }
                            }
                        }
                        // A file's path is the headline's link already (Read): it is not shown a second time.
                        headline.file == null ->
                            card.subject?.let { subject -> row { cell(subjectBox(subject)).align(AlignX.FILL) } }
                    }
                    row { cell(buttonLine(buttons)).align(AlignX.FILL) }.topGap(TopGap.SMALL)
                    if (keep != null) {
                        // The words and the drop-down wrap like the buttons, so the drop-down stays in a narrow card.
                        val where =
                            DropDownLink(Destination(destination), SUGGESTION_DESTINATIONS.map(::Destination)) {
                                destination = it.id
                                keep.text = keepLabel()
                            }
                        val words =
                            JBLabel(ClostaBundle.message("thread.permission.destination")).apply {
                                foreground = UIUtil.getContextHelpForeground()
                                font = JBUI.Fonts.smallFont()
                            }
                        row { cell(buttonLine(listOf(words, where))).align(AlignX.FILL) }
                    }
                    keysRow = row { comment(ClostaBundle.message("thread.permission.keys")) }.visible(false)
                    commentRow = row { cell(comment).align(AlignX.FILL) }.visible(false)
                    failureRow(this, card.failure)
                }
            content.isOpaque = false
            add(content, BorderLayout.CENTER)
            getAccessibleContext().accessibleName =
                listOfNotNull(headline.text.removeSuffix(":"), card.subject).joinToString(": ")
            comment.addActionListener { decide(Choice.NO) }
            noteKeys(comment, this, letGo) { showNote(false) }
            cardKeys(this, CardKind.PERMISSION, { buttons.size }) { key ->
                when (key) {
                    is CardKey.Choose -> decide(choiceAt(key.index))
                    CardKey.Deny -> decide(Choice.NO)
                    CardKey.OpenNote -> {
                        showNote(true)
                        comment.requestFocusInWindow()
                    }
                    CardKey.ToComposer -> letGo()
                    else -> Unit
                }
            }
            onKeyboard = { inside ->
                keysRow.visible(cardHint(inside, 1) == CardHint.KEYS)
                resized(this)
            }
            takeFocusIfHere(this)
        }

        private fun showNote(shown: Boolean) {
            commentRow.visible(shown)
            resized(this)
        }

        // The buttons' order: Allow, Always Allow when offered, Deny.
        private fun choiceAt(index: Int): Choice =
            when {
                index == 0 -> Choice.YES
                index == 1 && card.suggestions.isNotEmpty() -> Choice.KEEP
                else -> Choice.NO
            }

        private fun keepLabel(): String =
            ClostaBundle.message(
                if (destination == "session") "thread.permission.allowSession" else "thread.permission.allowAlways",
            )

        private fun decide(choice: Choice) {
            if (sent) return
            val approval = approvals(card.requestId) ?: return
            sent = true
            buttons.forEach { it.isEnabled = false }
            when (choice) {
                Choice.YES ->
                    answer(CardAnswer(card.requestId, ApprovalDecision.Allow(card.requestId), allowPayload(approval)))
                Choice.KEEP -> {
                    val kept = card.suggestions.map { kept(it) }
                    answer(
                        CardAnswer(
                            card.requestId,
                            ApprovalDecision.Allow(card.requestId),
                            allowPayload(approval),
                            passedOn(approval, kept),
                        ),
                    )
                }
                Choice.NO ->
                    answer(
                        CardAnswer(card.requestId, ApprovalDecision.Deny(card.requestId), comment.text.trim()),
                    )
            }
        }

        private fun kept(suggestion: SuggestionRecord): SuggestionRecord {
            val where = destination ?: return suggestion
            return if (where == suggestion.destination) suggestion else withDestination(suggestion, where)
        }
    }

    private enum class Choice { YES, KEEP, NO }

    /**
     * A waiting question card: each question with its options, each option's description under it, and Other with a
     * line to write an answer of one's own. Answer is pressable once every question has an answer (its tooltip says so
     * until then); Ctrl+Enter answers, Esc leaves the questions unanswered.
     */
    private inner class QuestionCardView(
        private val card: QuestionCard,
    ) : CardPanel(ThreadStyle.pendingLine, ThreadStyle.pendingFill, watchesKeyboard = true) {
        private var sent = false
        private val picks = ArrayList<Pick>()
        private val send = cardButton(ClostaBundle.message("thread.question.answer"), main = true) { send() }

        private inner class Pick(
            val question: String,
            val options: List<Pair<String, AbstractButton>>,
            val other: AbstractButton,
            val otherText: JBTextField,
        ) {
            fun answer(): List<String> =
                options.filter { it.second.isSelected }.map { it.first } +
                    listOfNotNull(otherText.text.trim().takeIf { other.isSelected && it.isNotEmpty() })
        }

        init {
            layout = BorderLayout()
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
                            .applyToComponent { toolTipText = "AskUserQuestion" }
                    }
                    card.questions.forEach { question -> question(this, question) }
                    val skipButton = cardButton(ClostaBundle.message("thread.question.skip")) { skip() }
                    row { cell(buttonLine(listOf(send, skipButton))).align(AlignX.FILL) }
                        .topGap(TopGap.SMALL)
                    failureRow(this, card.failure)
                }
            content.isOpaque = false
            add(content, BorderLayout.CENTER)
            getAccessibleContext().accessibleName =
                listOfNotNull(
                    ClostaBundle.message("thread.question.title"),
                    card.questions.firstOrNull()?.text,
                ).joinToString(": ")
            cardKeys(this, CardKind.QUESTION, { 0 }) { key ->
                when (key) {
                    CardKey.Deny -> skip()
                    CardKey.Answer -> send()
                    CardKey.ToComposer -> letGo()
                    else -> Unit
                }
            }
            refresh()
            picks
                .firstOrNull()
                ?.options
                ?.firstOrNull()
                ?.second
                ?.let(::takeFocusIfHere)
        }

        private fun question(
            panel: Panel,
            question: QuestionView,
        ) {
            // The radio buttons' group is the DSL's (buttonsGroup below).
            fun choice(label: String): AbstractButton =
                (if (question.multiSelect) WrappingCheckBox(label) else WrappingRadioButton(label))
                    .apply {
                        isOpaque = false
                        addItemListener { refresh() }
                    }
            val options = question.options.map { it.label to choice(it.label) }
            val other = choice(ClostaBundle.message("thread.question.other"))
            val otherText =
                JBTextField().apply {
                    // Its role when the card is made again: the questions' lines are told apart by their place.
                    name = "other.${picks.size}"
                    emptyText.text = ClostaBundle.message("thread.question.other.placeholder")
                    document.addDocumentListener(
                        object : DocumentAdapter() {
                            override fun textChanged(e: DocumentEvent) {
                                if (text.isNotBlank()) other.isSelected = true
                                refresh()
                            }
                        },
                    )
                }
            val header = question.header?.let { header -> panel.row { comment(StringUtil.escapeXmlEntities(header)) } }
            panel
                .row { text(StringUtil.escapeXmlEntities(question.text)).bold() }
                .topGap(if (header == null) TopGap.MEDIUM else TopGap.NONE)
            header?.topGap(TopGap.MEDIUM)
            panel.buttonsGroup {
                question.options.zip(options).forEach { (option, pair) ->
                    row {
                        cell(pair.second).align(AlignX.FILL).apply {
                            option.description?.takeIf { it.isNotBlank() }?.let {
                                comment(StringUtil.escapeXmlEntities(it), MAX_LINE_LENGTH_WORD_WRAP)
                            }
                        }
                    }
                }
                row {
                    cell(other).gap(RightGap.SMALL)
                    cell(otherText).align(AlignX.FILL).resizableColumn()
                }
            }
            picks += Pick(question.text, options, other, otherText)
        }

        private fun refresh() {
            val complete = picks.all { it.answer().isNotEmpty() }
            send.isEnabled = !sent && complete
            send.toolTipText = if (sent || complete) null else ClostaBundle.message("thread.question.answerAll")
        }

        private fun send() {
            val approval = approvals(card.requestId)
            val answers = picks.associate { it.question to it.answer() }
            // Every question needs an answer before the answer goes.
            if (sent || approval == null || answers.values.any { it.isEmpty() }) return
            sent = true
            refresh()
            answer(
                CardAnswer(card.requestId, ApprovalDecision.Answered(card.requestId), answerPayload(approval, answers)),
            )
        }

        private fun skip() {
            if (sent) return
            sent = true
            refresh()
            answer(CardAnswer(card.requestId, ApprovalDecision.Deny(card.requestId), ""))
        }
    }

    /** A place to keep an allow rule, as the drop-down shows it. */
    private data class Destination(
        val id: String?,
    ) {
        override fun toString(): String = destinationLabel(id)
    }

    private companion object {
        fun destinationLabel(destination: String?): String =
            when (destination) {
                "localSettings" -> ClostaBundle.message("thread.destination.localSettings")
                "projectSettings" -> ClostaBundle.message("thread.destination.projectSettings")
                "userSettings" -> ClostaBundle.message("thread.destination.userSettings")
                "session" -> ClostaBundle.message("thread.destination.session")
                null -> ClostaBundle.message("thread.destination.none")
                else -> destination
            }
    }
}
