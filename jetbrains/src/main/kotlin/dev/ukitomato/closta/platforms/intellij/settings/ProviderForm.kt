package dev.ukitomato.closta.platforms.intellij.settings

import com.intellij.icons.AllIcons
import com.intellij.openapi.Disposable
import com.intellij.openapi.ui.ComboBox
import com.intellij.openapi.ui.ComponentValidator
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.openapi.ui.popup.JBPopupFactory
import com.intellij.openapi.ui.popup.PopupStep
import com.intellij.openapi.ui.popup.util.BaseListPopupStep
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.util.text.HtmlChunk
import com.intellij.ui.CollectionListModel
import com.intellij.ui.JBIntSpinner
import com.intellij.ui.SimpleListCellRenderer
import com.intellij.ui.ToolbarDecorator
import com.intellij.ui.awt.RelativePoint
import com.intellij.ui.components.JBCheckBox
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBList
import com.intellij.ui.components.JBPasswordField
import com.intellij.ui.components.JBTextField
import com.intellij.util.ui.FormBuilder
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.UIUtil
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.platforms.intellij.auth.CredentialsStatus
import dev.ukitomato.closta.platforms.intellij.auth.StoredSession
import dev.ukitomato.closta.platforms.intellij.store.ProviderId
import java.awt.BorderLayout
import java.awt.CardLayout
import java.awt.Container
import java.awt.Dimension
import java.awt.Point
import java.time.ZoneId
import java.util.function.Supplier
import javax.swing.Icon
import javax.swing.JComponent
import javax.swing.JFormattedTextField
import javax.swing.JPanel
import javax.swing.ListSelectionModel
import javax.swing.event.DocumentEvent
import javax.swing.event.DocumentListener
import javax.swing.text.JTextComponent

/**
 * The Swing side of Settings | Tools | Closta: the "provider for new sessions" choice on top, the providers on
 * the left, the selected one on the right. Every edit goes straight into the bound [ProviderEditor]; the long-term key
 * fields start empty and are never filled from the store. A field shows its problem beside it once it has been typed
 * in, or at once for a saved provider; Apply still refuses every problem. EDT only.
 */
@Suppress("TooManyFunctions") // one form: its list, its fields, what it shows and what it sends to the editor
internal class ProviderForm {
    /** Owns the input checks; disposed with the settings screen's UI. */
    val disposable: Disposable = Disposer.newDisposable("Closta provider form")
    private val checks = FieldChecks(disposable) { shown != null }
    private var editor = ProviderEditor(emptyList(), null)
    private var loading = false
    private var shown: ProviderId? = null
    private val stored = mutableMapOf<ProviderId, Boolean?>()
    private var pending = emptySet<ProviderId>()

    private val listModel = CollectionListModel<ProviderRecord>()
    private val list =
        JBList(listModel).apply {
            selectionMode = ListSelectionModel.SINGLE_SELECTION
            // Short lines: the list is narrower than one long line of guidance.
            emptyText.text = EMPTY_LIST.first()
            EMPTY_LIST.drop(1).forEach { emptyText.appendLine(it) }
            cellRenderer =
                SimpleListCellRenderer.create { label, record, _ ->
                    label.putClientProperty(HTML_DISABLE, true)
                    label.text = "${record.name} — ${record.kind.displayName}"
                    label.icon = record.kind.icon
                }
        }
    private val activeChoice =
        ComboBox<ActiveChoice>().apply {
            prototypeDisplayValue = ActiveChoice(null, DEFAULT_CHOICE)
            renderer =
                SimpleListCellRenderer.create { label, choice, _ ->
                    label.putClientProperty(HTML_DISABLE, true)
                    label.text = choice?.toString().orEmpty()
                }
        }
    private val memoryOnlyNotice =
        wrappingLabel(ClostaBundle.message("settings.providers.memoryOnly")).apply { isVisible = false }

    private val nameField = textField()
    private val kindChoice =
        ComboBox(ProviderKind.entries.toTypedArray()).apply { renderer = kindRenderer() }
    private val kindWarning =
        wrappingLabel(ClostaBundle.message("settings.providers.kindChange")).apply { isVisible = false }
    private val modelField = textField()
    private val regionField = textField()
    private val mfaArnField = textField()
    private val durationSpinner =
        JBIntSpinner(SESSION_SECONDS.first, SESSION_SECONDS.first, SESSION_SECONDS.last, SESSION_STEP_SECONDS)
    private val durationField: JFormattedTextField = sessionSecondsField(durationSpinner)
    private val sonnetField = textField()
    private val haikuField = textField()
    private val keysStatus = JBLabel()
    private val sessionStatus = JBLabel()
    private val sessions = mutableMapOf<ProviderId, StoredSession>()
    private val accessKeyIdField = textField()
    private val secretKeyField = JBPasswordField().apply { columns = FIELD_COLUMNS }
    private val clearKeys = JBCheckBox(ClostaBundle.message("settings.providers.clearKeys")).withMnemonic('V')

    private val bedrockPanel =
        FormBuilder
            .createFormBuilder()
            .addLabeledComponent(
                mnemonicLabel(ClostaBundle.message("settings.providers.region"), 'R', regionField),
                regionField,
            ).addLabeledComponent(
                mnemonicLabel(ClostaBundle.message("settings.providers.mfaDevice"), 'F', mfaArnField),
                mfaArnField,
            ).addTooltip(ClostaBundle.message("settings.providers.mfaDevice.note"))
            .addLabeledComponent(
                mnemonicLabel(ClostaBundle.message("settings.providers.sessionDuration"), 'D', durationField),
                JPanel(BorderLayout(JBUI.scale(GAP), 0)).apply {
                    add(durationSpinner, BorderLayout.WEST)
                    add(JBLabel(SESSION_RANGE).apply { foreground = UIUtil.getContextHelpForeground() })
                },
            ).addLabeledComponent(
                mnemonicLabel(ClostaBundle.message("settings.providers.sonnetModel"), 'S', sonnetField),
                sonnetField,
            ).addLabeledComponent(
                mnemonicLabel(ClostaBundle.message("settings.providers.haikuModel"), 'H', haikuField),
                haikuField,
            ).addSeparator()
            .addLabeledComponent(ClostaBundle.message("settings.providers.longTermKey"), keysStatus)
            .addLabeledComponent(
                mnemonicLabel(ClostaBundle.message("settings.providers.accessKeyId"), 'I', accessKeyIdField),
                accessKeyIdField,
            ).addLabeledComponent(
                mnemonicLabel(ClostaBundle.message("settings.providers.secretAccessKey"), 'C', secretKeyField),
                secretKeyField,
            ).addComponent(clearKeys)
            .addComponent(wrappingLabel(ClostaBundle.message("settings.providers.keys.note")))
            .addLabeledComponent(ClostaBundle.message("settings.providers.temporaryCredentials"), sessionStatus)
            .panel

    // Cards keep the space of their largest card, so the page is as wide from the start as it gets once a Bedrock
    // provider is shown: the settings dialog is sized when it opens and would otherwise be too narrow later.
    private val bedrockCards = cards(BEDROCK_CARD to bedrockPanel, NONE_CARD to JPanel())
    private val detail =
        FormBuilder
            .createFormBuilder()
            .addLabeledComponent(
                mnemonicLabel(ClostaBundle.message("settings.providers.name"), 'N', nameField),
                nameField,
            ).addLabeledComponent(
                mnemonicLabel(ClostaBundle.message("settings.providers.kind"), 'K', kindChoice),
                kindChoice,
            ).addComponent(kindWarning)
            .addLabeledComponent(
                mnemonicLabel(ClostaBundle.message("settings.providers.model"), 'M', modelField),
                modelField,
            ).addComponent(bedrockCards)
            .addComponentFillVertically(JPanel(), 0)
            .panel

    /** The whole form, for the settings dialog and as the owner of the modal progress. */
    val root: JPanel

    init {
        list.addListSelectionListener { if (!it.valueIsAdjusting) showSelected() }
        activeChoice.addActionListener {
            if (!loading) (activeChoice.selectedItem as? ActiveChoice)?.let { editor.active = it.id }
        }
        kindChoice.addActionListener { pushDetail() }
        val details = listOf(nameField, modelField, regionField, mfaArnField, durationField, sonnetField, haikuField)
        details.forEach { field ->
            onChange(field) {
                if (!loading) checks.typed(field)
                pushDetail()
            }
        }
        listOf(accessKeyIdField, secretKeyField).forEach { field ->
            onChange(field) {
                // The two keys are one entry: a problem with the pair shows on the one still empty.
                if (!loading) checks.typed(accessKeyIdField, secretKeyField)
                pushKeys()
            }
        }
        installChecks()
        clearKeys.addActionListener {
            // The keys typed are dropped when the stored ones are removed, so the fields stop taking input.
            accessKeyIdField.isEnabled = !clearKeys.isSelected
            secretKeyField.isEnabled = !clearKeys.isSelected
            pushKeys()
        }

        val providers =
            ToolbarDecorator
                .createDecorator(list)
                .setAddAction { chooseKind(list, ::addProvider) }
                .setRemoveAction { removeSelected() }
                .disableUpDownActions()
                .createPanel()
                // Only the width is fixed: the list takes the page's height, however tall the dialog is made, and
                // asks for no more than a few rows so a short dialog keeps room for the fields.
                .apply { preferredSize = Dimension(JBUI.scale(LIST_WIDTH), JBUI.scale(LIST_MIN_HEIGHT)) }
        val top =
            FormBuilder
                .createFormBuilder()
                .addLabeledComponent(
                    mnemonicLabel(ClostaBundle.message("settings.providers.active"), 'P', activeChoice),
                    activeChoice,
                ).addComponent(wrappingLabel(ClostaBundle.message("settings.providers.active.note")))
                .addComponent(memoryOnlyNotice)
                .panel
        root =
            JPanel(BorderLayout(JBUI.scale(GAP), JBUI.scale(GAP))).apply {
                add(top, BorderLayout.NORTH)
                add(providers, BorderLayout.WEST)
                val none = wrappingLabel(ClostaBundle.message("settings.providers.noSelection"))
                add(cards(DETAIL_CARD to detail, NONE_CARD to none), BorderLayout.CENTER)
            }
    }

    /** The provider shown on the right, if any. */
    val selectedId: ProviderId? get() = list.selectedValue?.id

    /**
     * Shows [editor]'s providers and edits them from now on, selecting [select] when it is still there. [pending] are
     * the providers whose stored keys are being asked for: they show that they are being checked until [showStatuses];
     * any other shows that none are stored — it has none yet.
     */
    fun bind(
        editor: ProviderEditor,
        pending: Set<ProviderId>,
        select: ProviderId? = null,
    ) {
        this.editor = editor
        this.pending = pending
        stored.clear()
        sessions.clear()
        loading = true
        try {
            listModel.replaceAll(editor.records)
            refreshActiveChoice()
        } finally {
            loading = false
        }
        val index = listModel.items.indexOfFirst { it.id == select }.coerceAtLeast(0)
        if (listModel.size > 0) list.selectedIndex = index else showSelected()
    }

    /**
     * Shows whether keys are stored for each provider (null: the store did not answer), what is stored of their
     * temporary credentials, and the memory-only notice.
     */
    fun showStatuses(
        answers: Map<ProviderId, Boolean?>,
        memoryOnly: Boolean,
        temporary: Map<ProviderId, StoredSession>,
    ) {
        stored.putAll(answers)
        sessions.putAll(temporary)
        memoryOnlyNotice.isVisible = memoryOnly
        showKeysStatus()
    }

    private fun addProvider(kind: ProviderKind) {
        val record = editor.add(kind)
        listModel.add(record)
        refreshActiveChoice()
        list.selectedIndex = listModel.size - 1
    }

    private fun removeSelected() {
        val record = list.selectedValue ?: return
        val index = list.selectedIndex
        editor.remove(record.id)
        listModel.remove(record)
        refreshActiveChoice()
        if (listModel.size > 0) list.selectedIndex = index.coerceAtMost(listModel.size - 1) else showSelected()
    }

    private fun showSelected() {
        val record = list.selectedValue
        shown = record?.id
        show(detail.parent, if (record != null) DETAIL_CARD else NONE_CARD)
        if (record == null) return checks.restart(all = false)
        loading = true
        try {
            nameField.text = record.name
            kindChoice.selectedItem = record.kind
            modelField.text = record.model.orEmpty()
            val bedrock = record.bedrock ?: BedrockFields()
            regionField.text = bedrock.region
            mfaArnField.text = bedrock.mfaDeviceArn
            showDuration(bedrock.sessionDurationSeconds)
            sonnetField.text = bedrock.sonnetModelId.orEmpty()
            haikuField.text = bedrock.haikuModelId.orEmpty()
            val keys = editor.keyEdit(record.id)
            // What was typed and not applied shows again, so the fields and what Apply would store agree.
            accessKeyIdField.text = keys.accessKeyId
            secretKeyField.text = keys.typedSecretAccessKey()
            clearKeys.isSelected = keys.clear
            accessKeyIdField.isEnabled = !keys.clear
            secretKeyField.isEnabled = !keys.clear
            show(bedrockCards, if (record.kind == ProviderKind.BEDROCK) BEDROCK_CARD else NONE_CARD)
            kindWarning.isVisible = editor.forgetsSecretsOnApply(record.id)
            showKeysStatus()
        } finally {
            loading = false
        }
        // A saved provider shows what is wrong with it at once: settings saved by an older version may be.
        checks.restart(all = editor.isSaved(record.id))
    }

    // The spinner's value is set without its own clamping (JBIntSpinner.setNumber would clamp): a saved value outside
    // what STS allows shows as it is and is a problem, rather than being changed behind the user's back.
    private fun showDuration(seconds: Int) {
        if (seconds == INVALID_DURATION) {
            durationField.text = ""
        } else {
            durationSpinner.value = seconds
            durationField.text = seconds.toString()
        }
    }

    private fun installChecks() {
        fun problem(field: String): String? {
            val id = shown ?: return null
            return editor.problemsOf(id).firstOrNull { it.field == field }?.message
        }

        fun bedrockShown(): Boolean = editor.records.firstOrNull { it.id == shown }?.kind == ProviderKind.BEDROCK
        checks.add(nameField) { problem(FIELD_NAME) }
        checks.add(regionField) { problem(FIELD_REGION) }
        checks.add(mfaArnField) { problem(FIELD_MFA_DEVICE) }
        checks.add(durationSpinner, typedIn = durationField) {
            if (bedrockShown()) ProviderValidation.sessionDurationProblem(durationField.text) else null
        }
        checks.add(accessKeyIdField) {
            problem(FIELD_ACCESS_KEY_ID)
                ?: problem(FIELD_LONG_TERM_KEYS)?.takeIf { accessKeyIdField.text.isBlank() }
        }
        checks.add(secretKeyField) { problem(FIELD_LONG_TERM_KEYS)?.takeIf { secretKeyField.password.isEmpty() } }
    }

    private fun pushDetail() {
        val current = editor.records.firstOrNull { it.id == shown }
        if (loading || current == null) return
        val kind = kindChoice.selectedItem as? ProviderKind ?: current.kind
        val updated =
            current.copy(
                name = nameField.text.trim(),
                kind = kind,
                model = modelField.text.trim().ifBlank { null },
                bedrock = if (kind == ProviderKind.BEDROCK) typedBedrock() else null,
            )
        editor.update(updated)
        val index = listModel.items.indexOfFirst { it.id == updated.id }
        if (index >= 0) listModel.setElementAt(updated, index)
        show(bedrockCards, if (kind == ProviderKind.BEDROCK) BEDROCK_CARD else NONE_CARD)
        kindWarning.isVisible = editor.forgetsSecretsOnApply(updated.id)
        refreshActiveChoice()
        checks.revalidate()
    }

    private fun typedBedrock(): BedrockFields =
        BedrockFields(
            region = regionField.text.trim(),
            mfaDeviceArn = mfaArnField.text.trim(),
            sessionDurationSeconds = durationField.text.trim().toIntOrNull() ?: INVALID_DURATION,
            sonnetModelId = sonnetField.text.trim().ifBlank { null },
            haikuModelId = haikuField.text.trim().ifBlank { null },
        )

    private fun pushKeys() {
        val id = shown
        if (loading || id == null) return
        editor.editKeys(id, KeyEdit(accessKeyIdField.text, String(secretKeyField.password), clearKeys.isSelected))
        showKeysStatus()
        checks.revalidate()
    }

    private fun refreshActiveChoice() {
        val wasLoading = loading
        loading = true
        try {
            val choices =
                listOf(ActiveChoice(null, DEFAULT_CHOICE)) +
                    editor.records.map { ActiveChoice(it.id, "${it.name} (${it.kind.displayName})") }
            activeChoice.removeAllItems()
            choices.forEach(activeChoice::addItem)
            activeChoice.selectedItem = choices.first { it.id == editor.active }
        } finally {
            loading = wasLoading
        }
    }

    private fun showKeysStatus() {
        val id = shown ?: return
        val typed = editor.keyEdit(id)
        sessionStatus.text = temporaryCredentialsText(typed, sessions[id], id in pending)
        keysStatus.text =
            when {
                typed.clear -> ClostaBundle.message("settings.providers.keys.removed")
                typed.complete -> ClostaBundle.message("settings.providers.keys.new")
                id in stored && stored[id] == true -> ClostaBundle.message("settings.providers.keys.stored")
                id in stored && stored[id] == null -> ClostaBundle.message("settings.providers.keys.unknown")
                id in pending && id !in stored -> ClostaBundle.message("settings.providers.checking")
                else -> ClostaBundle.message("settings.providers.keys.notStored")
            }
    }

    /** One entry of the "provider for new sessions" choice; null is the default Anthropic. */
    private class ActiveChoice(
        val id: ProviderId?,
        private val label: String,
    ) {
        override fun toString(): String = label
    }

    private companion object {
        const val LIST_WIDTH = 220
        const val LIST_MIN_HEIGHT = 120
        const val GAP = 10
        const val INVALID_DURATION = -1
        const val SESSION_STEP_SECONDS = 900
        val SESSION_SECONDS = ProviderValidation.SESSION_SECONDS

        // STS's range for an IAM user, 900 to 129600 seconds, in the units the user thinks in.
        val SESSION_RANGE: String get() = ClostaBundle.message("settings.bedrock.sessionRange")
        val FIELD_NAME: String get() = ClostaBundle.message("settings.validation.field.name")
        val FIELD_REGION: String get() = ClostaBundle.message("settings.validation.field.region")
        val FIELD_MFA_DEVICE: String get() = ClostaBundle.message("settings.validation.field.mfaDevice")
        val FIELD_ACCESS_KEY_ID: String get() = ClostaBundle.message("settings.validation.field.accessKeyId")
        val FIELD_LONG_TERM_KEYS: String get() = ClostaBundle.message("settings.validation.field.longTermKeys")
        val DEFAULT_CHOICE: String get() = ClostaBundle.message("settings.providers.defaultChoice")
        val EMPTY_LIST: List<String>
            get() =
                listOf(
                    ClostaBundle.message("settings.providers.empty.add"),
                    ClostaBundle.message("settings.providers.empty.anthropic"),
                    ClostaBundle.message("settings.providers.empty.bedrock"),
                )
        const val DETAIL_CARD = "detail"
        const val BEDROCK_CARD = "bedrock"
        const val NONE_CARD = "none"
    }
}

private fun cards(vararg named: Pair<String, JComponent>): JPanel =
    JPanel(CardLayout()).apply { named.forEach { (name, card) -> add(card, name) } }

private fun show(
    cards: Container,
    name: String,
) = (cards.layout as CardLayout).show(cards, name)

// The kinds a provider can be added as, offered where the list starts; the chosen kind names the new provider. The
// provider is added once the popup has closed (doFinalStep), so the list it lands in is not under the popup.
private fun chooseKind(
    anchor: JComponent,
    chosen: (ProviderKind) -> Unit,
) {
    val step =
        object : BaseListPopupStep<ProviderKind>(ClostaBundle.message("settings.providers.add"), ProviderKind.entries) {
            override fun getTextFor(value: ProviderKind): String = value.displayName

            override fun getIconFor(value: ProviderKind): Icon = value.icon

            override fun onChosen(
                selectedValue: ProviderKind,
                finalChoice: Boolean,
            ): PopupStep<*>? = doFinalStep { chosen(selectedValue) }
        }
    JBPopupFactory.getInstance().createListPopup(step).show(RelativePoint(anchor, Point(0, 0)))
}

// A long note wraps the way the IDE's own comments do: a copyable JBLabel (auto-wrapping applies only to the editor
// pane a copyable label renders with) whose text sits in a div as wide as its first MAX_LINE_CHARS characters, so the
// note never widens the page.
private fun wrappingLabel(text: String): JBLabel =
    JBLabel().apply {
        setCopyable(true)
        setAllowAutoWrapping(true)
        val width = getFontMetrics(font).stringWidth(text.take(MAX_LINE_CHARS))
        this.text =
            HtmlChunk
                .text(text)
                .wrapWith(HtmlChunk.div().attr("width", width))
                .wrapWith(HtmlChunk.body())
                .wrapWith(HtmlChunk.html())
                .toString()
    }

/** The temporary credentials' line: new or removed keys forget them at Apply; else what is stored. */
private fun temporaryCredentialsText(
    typed: KeyEdit,
    stored: StoredSession?,
    asking: Boolean,
): String =
    when {
        typed.clear || typed.complete -> ClostaBundle.message("settings.providers.temporary.forgotten")
        stored == null && asking -> ClostaBundle.message("settings.providers.checking")
        else ->
            CredentialsStatus.describe(
                stored ?: StoredSession.None,
                System.currentTimeMillis(),
                ZoneId.systemDefault(),
            )
    }

// Swing draws a label's text that starts with an html tag as HTML; a provider's name is shown as typed.
private const val HTML_DISABLE = "html.disable"

// The width the IDE's own comments under a field wrap at (ComponentPanelBuilder.MAX_COMMENT_WIDTH).
private const val MAX_LINE_CHARS = 70

// A text field asks for room by a fixed number of columns, not by its text, and stretches over the rest of the row; a
// long name or ARN would otherwise widen the page past the dialog.
private const val FIELD_COLUMNS = 10

private fun textField() = JBTextField(FIELD_COLUMNS)

private fun kindRenderer() =
    SimpleListCellRenderer.create<ProviderKind> { label, kind, _ ->
        label.text = kind?.displayName.orEmpty()
        label.icon = kind?.icon
    }

// Anthropic is reached over the web; Bedrock through an AWS endpoint.
private val ProviderKind.icon: Icon
    get() =
        when (this) {
            ProviderKind.ANTHROPIC -> AllIcons.General.Web
            ProviderKind.BEDROCK -> AllIcons.Webreferences.Server
        }

private fun onChange(
    field: JTextComponent,
    action: () -> Unit,
) {
    field.document.addDocumentListener(
        object : DocumentListener {
            override fun insertUpdate(event: DocumentEvent) = action()

            override fun removeUpdate(event: DocumentEvent) = action()

            override fun changedUpdate(event: DocumentEvent) = action()
        },
    )
}

/**
 * The form's checks as the user types: each field shows its problem beside it once it has been typed in since the
 * provider was shown, or at once after [restart] with `all`. They check nothing while [active] is false.
 */
private class FieldChecks(
    private val disposable: Disposable,
    private val active: () -> Boolean,
) {
    private val validators = mutableListOf<ComponentValidator>()
    private val fields = mutableListOf<JComponent>()
    private val touched = mutableSetOf<JComponent>()

    /** [component] shows [message] once [typedIn] has been typed in. */
    fun add(
        component: JComponent,
        typedIn: JComponent = component,
        message: () -> String?,
    ) {
        fields += typedIn
        validators +=
            ComponentValidator(disposable)
                .withValidator(
                    Supplier {
                        if (!active() || typedIn !in touched) return@Supplier null
                        message()?.let { ValidationInfo(it, component) }
                    },
                ).installOn(component)
    }

    fun typed(vararg typedIn: JComponent) {
        touched += typedIn
    }

    /** Starts over for the provider just shown: no field typed in yet, or every one when [all]. */
    fun restart(all: Boolean) {
        touched.clear()
        if (all) touched += fields
        revalidate()
    }

    fun revalidate() = validators.forEach(ComponentValidator::revalidate)
}
