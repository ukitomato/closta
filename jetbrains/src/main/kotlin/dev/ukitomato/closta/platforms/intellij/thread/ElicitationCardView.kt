package dev.ukitomato.closta.platforms.intellij.thread

import com.intellij.icons.AllIcons
import com.intellij.ide.BrowserUtil
import com.intellij.openapi.ide.CopyPasteManager
import com.intellij.openapi.ui.ComboBox
import com.intellij.openapi.util.SystemInfo
import com.intellij.ui.DocumentAdapter
import com.intellij.ui.SimpleListCellRenderer
import com.intellij.ui.components.JBCheckBox
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBRadioButton
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
import dev.ukitomato.closta.core.models.ElicitationAction
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.platforms.intellij.ui.noHtml
import dev.ukitomato.closta.platforms.intellij.ui.plainHtml
import dev.ukitomato.closta.platforms.intellij.ui.plainTip
import dev.ukitomato.closta.presenter.tree.JsonArray
import dev.ukitomato.closta.presenter.tree.JsonBool
import dev.ukitomato.closta.presenter.tree.JsonNumber
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonRead
import dev.ukitomato.closta.presenter.tree.JsonString
import dev.ukitomato.closta.presenter.tree.JsonValue
import dev.ukitomato.closta.presenter.view.ChoiceOption
import dev.ukitomato.closta.presenter.view.ElicitationCard
import dev.ukitomato.closta.presenter.view.ElicitationField
import dev.ukitomato.closta.presenter.view.ElicitationProblem
import dev.ukitomato.closta.presenter.view.ElicitationStage
import dev.ukitomato.closta.presenter.view.ElicitationValue
import dev.ukitomato.closta.presenter.view.elicitationContent
import dev.ukitomato.closta.presenter.view.elicitationProblems
import dev.ukitomato.closta.presenter.view.rebuildsElicitationCard
import java.awt.BorderLayout
import java.awt.datatransfer.StringSelection
import javax.swing.ButtonGroup
import javax.swing.JButton
import javax.swing.JComponent
import javax.swing.SwingUtilities
import javax.swing.event.DocumentEvent

/** The host's answer to a card of an MCP server's request for input: [content] is the form's values as JSON. */
data class ElicitationAnswer(
    val requestId: String,
    val action: ElicitationAction,
    val content: String?,
)

/** What the form values the user typed so far are, by the field's key. The screen keeps them only while typing. */
internal typealias ElicitationDraft = Map<String, ElicitationValue>

/**
 * How a form's host sends and guards its buttons: [send] builds the answer only when an answer can go now and tells
 * whether it went, [guard] keeps a button enabled while [ready] and the host allows an answer.
 */
internal class ElicitationHost(
    val send: (make: () -> ElicitationAnswer?) -> Boolean,
    val guard: (JButton, ready: () -> Boolean) -> Unit,
    val resized: () -> Unit = {},
)

/**
 * The inside of an elicitation card, for the conversation and the detail pane alike: what the server asks with its form
 * or its link, and the answers as buttons. What the user typed ([draft]) is given back to the body made again for the
 * same request ([restore]); the server's words go through [noHtml] and [plainHtml].
 */
@Suppress("TooManyFunctions") // the body's parts, one function each
internal class ElicitationBody(
    private val card: ElicitationCard,
    private val host: ElicitationHost,
    private val changed: (ElicitationDraft) -> Unit = {},
) {
    private val inputs = ArrayList<FieldInput>()
    private var attempted = false
    private val sendButton = cardButton(ClostaBundle.message("thread.elicitation.send"), main = true) { submit() }
    private val openButton =
        cardButton(ClostaBundle.message("thread.elicitation.openBrowser"), main = true) { openInBrowser() }
    private val declineButton =
        cardButton(ClostaBundle.message("thread.elicitation.decline")) { answerWith(ElicitationAction.DECLINE) }
    private val closeButton =
        cardButton(ClostaBundle.message("thread.elicitation.close")) { answerWith(ElicitationAction.CANCEL) }
    private lateinit var keysRow: Row

    val component: JComponent = content()

    /** The part of the body the keyboard goes to first, null when it has no field. */
    val firstFocus: JComponent? get() = inputs.firstOrNull()?.component ?: openButton.takeIf { card.url != null }

    /** What the user typed so far. */
    fun draft(): ElicitationDraft = inputs.associate { it.field.key to it.value() }

    fun restore(values: ElicitationDraft) = inputs.forEach { input -> values[input.field.key]?.let(input::restore) }

    /** Shows whether the keys are worth saying (the keyboard is in the card). */
    fun keysShown(shown: Boolean) {
        if (card.stage == ElicitationStage.WAITING && card.answerable && !card.isUrl) keysRow.visible(shown)
    }

    /** Sends the form: a field that cannot go is marked and nothing is sent. */
    fun submit() {
        val fields = card.fields ?: return
        if (card.isUrl || !card.answerable) return
        attempted = true
        val values = draft()
        val problems = elicitationProblems(fields, values)
        inputs.forEach { it.mark(problems[it.field.key]) }
        host.resized()
        if (problems.isEmpty()) {
            host.send {
                ElicitationAnswer(
                    card.requestId,
                    ElicitationAction.ACCEPT,
                    elicitationContent(fields, values),
                )
            }
        }
    }

    /** Closes the request without an answer (Esc). */
    fun close() = answerWith(ElicitationAction.CANCEL)

    private fun answerWith(action: ElicitationAction) {
        if (card.answerable) host.send { ElicitationAnswer(card.requestId, action, null) }
    }

    private fun openInBrowser() {
        val url = card.url ?: return
        host.send {
            BrowserUtil.browse(url)
            ElicitationAnswer(card.requestId, ElicitationAction.ACCEPT, null)
        }
    }

    private fun content(): JComponent {
        val waiting = card.stage == ElicitationStage.WAITING
        val content =
            panel {
                row {
                    icon(AllIcons.Nodes.Plugin).gap(RightGap.SMALL)
                    label(card.heading).bold().applyToComponent {
                        noHtml()
                        toolTipText = plainTip(card.heading)
                    }
                }
                if (card.message.isNotBlank()) row { text(plainHtml(card.message), MAX_LINE_LENGTH_WORD_WRAP) }
                card.description?.takeIf { it.isNotBlank() }?.let { row { comment(plainHtml(it)) } }
                if (card.isUrl) linkRows(this)
                when {
                    card.stage == ElicitationStage.IN_BROWSER ->
                        row {
                            label(
                                ClostaBundle.message("thread.elicitation.inBrowser"),
                            ).applyToComponent { noHtml() }
                        }
                    card.stage == ElicitationStage.COMPLETED ->
                        row { label(ClostaBundle.message("thread.elicitation.completed")) }
                    card.stage == ElicitationStage.SENT -> sentRows(this)
                    waiting -> waitingRows(this)
                }
                failureRow(this, card.failure)
            }
        content.isOpaque = false
        return content
    }

    private fun linkRows(panel: Panel) {
        val url = card.url ?: return
        panel.row {
            card.urlHost?.let { host -> label(host).bold().applyToComponent { noHtml() }.gap(RightGap.SMALL) }
            link(ClostaBundle.message("thread.elicitation.copyLink")) {
                CopyPasteManager.getInstance().setContents(StringSelection(url))
            }
        }
        panel.row {
            comment(plainHtml(url), MAX_LINE_LENGTH_WORD_WRAP).applyToComponent { toolTipText = plainTip(url) }
        }
    }

    private fun waitingRows(panel: Panel) {
        val fields = card.fields
        when {
            card.isUrl -> Unit
            fields == null -> panel.row { label(ClostaBundle.message("thread.elicitation.unsupported")) }
            else -> fields.forEach { field -> fieldRows(panel, field) }
        }
        val buttons =
            when {
                card.isUrl -> listOfNotNull(openButton.takeIf { card.url != null }, declineButton, closeButton)
                fields == null -> listOf(declineButton, closeButton)
                else -> listOf(sendButton, declineButton, closeButton)
            }
        buttons.forEach { host.guard(it) { card.answerable } }
        panel.row { cell(buttonLine(buttons)).align(AlignX.FILL) }.topGap(TopGap.SMALL)
        if (fields != null && !card.isUrl) {
            val modifier = if (SystemInfo.isMac) "Cmd" else "Ctrl"
            keysRow = panel.row { comment(ClostaBundle.message("thread.elicitation.keys", modifier)) }.visible(false)
        } else {
            keysRow = panel.row { }.visible(false)
        }
        if (!card.answerable) panel.row { label(ClostaBundle.message("thread.card.cancelled")) }
    }

    private fun fieldRows(
        panel: Panel,
        field: ElicitationField,
    ) {
        val input = inputOf(field) { onEdited() }
        inputs += input
        panel
            .row {
                label(field.title).bold().gap(RightGap.SMALL).applyToComponent { noHtml() }
                if (field.required) comment(ClostaBundle.message("thread.elicitation.required"))
            }.topGap(TopGap.SMALL)
        field.description?.takeIf { it.isNotBlank() }?.let { panel.row { comment(plainHtml(it)) } }
        panel.row { cell(input.component).align(AlignX.FILL) }
        panel.row { cell(input.problem).align(AlignX.FILL) }
        input.component.isEnabled = card.answerable
    }

    private fun onEdited() {
        val values = draft()
        changed(values)
        if (!attempted) return
        val problems = card.fields?.let { elicitationProblems(it, values) }.orEmpty()
        inputs.forEach { it.mark(problems[it.field.key]) }
        host.resized()
    }

    private fun sentRows(panel: Panel) {
        val said =
            when (card.sentAction) {
                ElicitationAction.ACCEPT -> "thread.elicitation.sent"
                ElicitationAction.DECLINE -> "thread.elicitation.declined"
                ElicitationAction.CANCEL, null -> "thread.elicitation.closed"
            }
        panel.row {
            label(
                ClostaBundle.message(said),
            ).applyToComponent { foreground = UIUtil.getContextHelpForeground() }
        }
        val sent = (card.sentContent?.let { JsonRead.parse(it) } as? JsonObject) ?: return
        card.fields.orEmpty().forEach { field ->
            val value = sent[field.key] ?: return@forEach
            panel.row {
                label(field.title + ":").bold().gap(RightGap.SMALL).applyToComponent { noHtml() }
                label(shownValue(field, value)).applyToComponent { noHtml() }
            }
        }
    }
}

// A value the form sent, as the user reads it: an option by its label, a flag as a check mark.
private fun shownValue(
    field: ElicitationField,
    value: JsonValue,
): String =
    when (value) {
        is JsonString -> labelOf(field, value.value)
        is JsonNumber -> value.text
        is JsonBool -> if (value.value) "✓" else "✗"
        is JsonArray ->
            value.items.joinToString(", ") {
                (it as? JsonString)?.let { s ->
                    labelOf(field, s.value)
                } ?: ""
            }
        else -> ""
    }

private fun labelOf(
    field: ElicitationField,
    value: String,
): String = (field as? ElicitationField.Choice)?.options?.firstOrNull { it.value == value }?.label ?: value

/** One field's component, its value, and the line that says what is wrong with it. */
private abstract class FieldInput(
    val field: ElicitationField,
) {
    abstract val component: JComponent
    val problem: JBLabel =
        JBLabel().apply {
            foreground = UIUtil.getErrorForeground()
            font = JBUI.Fonts.smallFont()
            isVisible = false
        }

    abstract fun value(): ElicitationValue

    abstract fun restore(value: ElicitationValue)

    fun mark(found: ElicitationProblem?) {
        problem.text = found?.let { ClostaBundle.message(it.key) }
        problem.isVisible = found != null
        component.putClientProperty("JComponent.outline", if (found != null) "error" else null)
    }
}

private val ElicitationProblem.key: String
    get() =
        when (this) {
            ElicitationProblem.REQUIRED -> "thread.elicitation.problem.required"
            ElicitationProblem.TOO_SHORT -> "thread.elicitation.problem.tooShort"
            ElicitationProblem.TOO_LONG -> "thread.elicitation.problem.tooLong"
            ElicitationProblem.NOT_A_NUMBER -> "thread.elicitation.problem.notANumber"
            ElicitationProblem.NOT_AN_INTEGER -> "thread.elicitation.problem.notAnInteger"
            ElicitationProblem.BELOW_MINIMUM -> "thread.elicitation.problem.belowMinimum"
            ElicitationProblem.ABOVE_MAXIMUM -> "thread.elicitation.problem.aboveMaximum"
            ElicitationProblem.NOT_EMAIL -> "thread.elicitation.problem.notEmail"
            ElicitationProblem.NOT_URI -> "thread.elicitation.problem.notUri"
            ElicitationProblem.NOT_DATE -> "thread.elicitation.problem.notDate"
            ElicitationProblem.NOT_DATE_TIME -> "thread.elicitation.problem.notDateTime"
        }

private fun inputOf(
    field: ElicitationField,
    edited: () -> Unit,
): FieldInput =
    when (field) {
        is ElicitationField.Text -> TextInput(field, field.default.orEmpty(), edited)
        is ElicitationField.Number -> TextInput(field, field.default?.let(::numberText).orEmpty(), edited)
        is ElicitationField.Toggle -> ToggleInput(field, edited)
        is ElicitationField.Choice ->
            when {
                field.multi -> MultiInput(field, edited)
                field.options.size <= RADIO_MAX -> RadioInput(field, edited)
                else -> ComboInput(field, edited)
            }
    }

// A choice of this many options or fewer is shown as radio buttons, more as a drop-down.
private const val RADIO_MAX = 4

private fun numberText(number: Double): String =
    if (number == Math.floor(number) &&
        Math.abs(number) < WHOLE_LIMIT
    ) {
        number.toLong().toString()
    } else {
        number.toString()
    }

private const val WHOLE_LIMIT = 1e15

private class TextInput(
    field: ElicitationField,
    initial: String,
    edited: () -> Unit,
) : FieldInput(field) {
    private val text =
        JBTextField(initial).apply {
            name = "elicitation.${field.key}"
            document.addDocumentListener(
                object : DocumentAdapter() {
                    override fun textChanged(e: DocumentEvent) = edited()
                },
            )
        }
    override val component: JComponent get() = text

    override fun value() = ElicitationValue.Text(text.text)

    override fun restore(value: ElicitationValue) {
        (value as? ElicitationValue.Text)?.let { text.text = it.text }
    }
}

private class ToggleInput(
    field: ElicitationField.Toggle,
    edited: () -> Unit,
) : FieldInput(field) {
    private val box =
        JBCheckBox(null, field.default ?: false).apply {
            name = "elicitation.${field.key}"
            isOpaque = false
            addItemListener { edited() }
        }
    override val component: JComponent get() = box

    override fun value() = ElicitationValue.Flag(box.isSelected)

    override fun restore(value: ElicitationValue) {
        (value as? ElicitationValue.Flag)?.let { box.isSelected = it.on }
    }
}

private class RadioInput(
    field: ElicitationField.Choice,
    edited: () -> Unit,
) : FieldInput(field) {
    private val buttons =
        field.options.map { option ->
            JBRadioButton(option.label, option.value in field.default).apply {
                name = "elicitation.${field.key}.${option.value}"
                isOpaque = false
                noHtml()
                addItemListener { edited() }
            } to option
        }
    override val component: JComponent =
        javax.swing.JPanel(java.awt.GridLayout(0, 1)).apply {
            isOpaque = false
            val group = ButtonGroup()
            buttons.forEach { (button, _) ->
                group.add(button)
                add(button)
            }
        }

    override fun value() = ElicitationValue.Choices(buttons.filter { it.first.isSelected }.map { it.second.value })

    override fun restore(value: ElicitationValue) {
        val chosen = (value as? ElicitationValue.Choices)?.values.orEmpty()
        buttons.forEach { (button, option) -> button.isSelected = option.value in chosen }
    }
}

private class MultiInput(
    field: ElicitationField.Choice,
    edited: () -> Unit,
) : FieldInput(field) {
    private val boxes =
        field.options.map { option ->
            JBCheckBox(option.label, option.value in field.default).apply {
                name = "elicitation.${field.key}.${option.value}"
                isOpaque = false
                noHtml()
                addItemListener { edited() }
            } to option
        }
    override val component: JComponent =
        javax.swing.JPanel(java.awt.GridLayout(0, 1)).apply {
            isOpaque = false
            boxes.forEach { (box, _) -> add(box) }
        }

    override fun value() = ElicitationValue.Choices(boxes.filter { it.first.isSelected }.map { it.second.value })

    override fun restore(value: ElicitationValue) {
        val chosen = (value as? ElicitationValue.Choices)?.values.orEmpty()
        boxes.forEach { (box, option) -> box.isSelected = option.value in chosen }
    }
}

// The drop-down's entry for no choice, which a field that is not required starts at.
private val NOTHING = ChoiceOption("", "")

private class ComboInput(
    field: ElicitationField.Choice,
    edited: () -> Unit,
) : FieldInput(field) {
    private val combo =
        ComboBox(arrayOf(NOTHING) + field.options.toTypedArray()).apply {
            name = "elicitation.${field.key}"
            renderer =
                SimpleListCellRenderer.create { label, option, _ ->
                    label.putClientProperty("html.disable", true)
                    label.text = option?.label.orEmpty()
                }
            selectedItem = field.options.firstOrNull { it.value in field.default } ?: NOTHING
            addActionListener { edited() }
        }
    override val component: JComponent get() = combo

    override fun value() =
        ElicitationValue.Choices(
            listOfNotNull((combo.selectedItem as? ChoiceOption)?.value?.takeIf { it.isNotEmpty() }),
        )

    override fun restore(value: ElicitationValue) {
        val chosen = (value as? ElicitationValue.Choices)?.values?.firstOrNull()
        combo.selectedItem = (field as ElicitationField.Choice).options.firstOrNull { it.value == chosen } ?: NOTHING
    }
}

/**
 * An elicitation card in the conversation. It waits as a banner with its form or link; once answered it shows what was
 * sent, or that the user goes on in the browser, or that it is done. [show] gives it the card as it is now: the body is
 * made again only when [rebuildsElicitationCard] says so, and what was typed stays; any other change leaves the fields
 * alone.
 */
internal class ElicitationCardView(
    private var card: ElicitationCard,
    private val answer: (ElicitationAnswer) -> Unit,
    private val resized: (JComponent) -> Unit = {},
    private val letGo: () -> Unit = {},
    private var typed: ElicitationDraft = emptyMap(),
    private val keep: (String, ElicitationDraft) -> Unit = { _, _ -> },
) : CardPanel(ThreadStyle.pendingLine, ThreadStyle.pendingFill, watchesKeyboard = true) {
    private var sent = false
    private val guarded = ArrayList<Pair<JButton, () -> Boolean>>()
    private lateinit var body: ElicitationBody

    // The card is a waiting one only while it can be answered: another card never takes the keyboard from it then.
    override val waiting: Boolean get() = card.answerable

    init {
        layout = BorderLayout()
        cardKeys(this, CardKind.ELICITATION, { 0 }) { key ->
            when (key) {
                CardKey.Answer -> body.submit()
                CardKey.Deny -> body.close()
                CardKey.LeaveText -> requestFocusInWindow()
                CardKey.ToComposer -> letGo()
                else -> Unit
            }
        }
        onKeyboard = { inside ->
            body.keysShown(cardHint(inside, 1) == CardHint.KEYS)
            resized(this)
        }
        build()
        body.firstFocus?.let(::takeFocusIfHere)
    }

    /** The card as it is now; the body is made again only when it has to be. */
    fun show(next: ElicitationCard) {
        val rebuild = rebuildsElicitationCard(card, next)
        if (rebuild) typed = body.draft()
        card = next
        if (!rebuild) return
        sent = false
        build()
        resized(this)
    }

    private fun build() {
        guarded.clear()
        removeAll()
        line = if (card.answerable) ThreadStyle.pendingLine else ThreadStyle.cardBorder
        body =
            ElicitationBody(
                card,
                ElicitationHost(::send, { button, ready -> guard(button, ready) }, { resized(this) }),
            ) { values -> keep(card.requestId, values) }
        if (card.stage == ElicitationStage.WAITING) body.restore(typed)
        add(body.component, BorderLayout.CENTER)
        getAccessibleContext().accessibleName = card.heading
        revalidate()
        repaint()
    }

    private fun guard(
        button: JButton,
        ready: () -> Boolean,
    ) {
        guarded += button to ready
        button.isEnabled = !sent && ready()
    }

    private fun send(make: () -> ElicitationAnswer?): Boolean {
        val made = if (sent || !card.answerable) null else make()
        if (made == null) return false
        sent = true
        guarded.forEach { (button, _) -> button.isEnabled = false }
        answer(made)
        return true
    }

    private fun takeFocusIfHere(target: JComponent) {
        SwingUtilities.invokeLater {
            if (target.isShowing && card.answerable) target.requestFocusInWindow()
        }
    }
}
