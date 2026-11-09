package dev.ukitomato.closta.platforms.intellij.composer

import com.intellij.codeInsight.AutoPopupController
import com.intellij.codeInsight.lookup.LookupManager
import com.intellij.icons.AllIcons
import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CustomShortcutSet
import com.intellij.openapi.application.EDT
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.editor.EditorModificationUtil
import com.intellij.openapi.editor.event.DocumentEvent
import com.intellij.openapi.editor.event.DocumentListener
import com.intellij.openapi.editor.ex.EditorEx
import com.intellij.openapi.editor.impl.EditorImpl
import com.intellij.openapi.fileChooser.FileChooser
import com.intellij.openapi.fileChooser.FileChooserDescriptorFactory
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.FileEditorManagerEvent
import com.intellij.openapi.fileEditor.FileEditorManagerListener
import com.intellij.openapi.ide.CopyPasteManager
import com.intellij.openapi.keymap.KeymapUtil
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.guessProjectDir
import com.intellij.openapi.ui.popup.JBPopupFactory
import com.intellij.openapi.util.IconLoader
import com.intellij.openapi.vfs.VfsUtilCore
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.util.textCompletion.TextFieldWithCompletion
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.WrapLayout
import com.intellij.util.ui.accessibility.AccessibleAnnouncerUtil
import dev.ukitomato.closta.core.interfaces.IdeResult
import dev.ukitomato.closta.core.models.Attachment
import dev.ukitomato.closta.core.models.AttachmentKind
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.platforms.intellij.chat.ChatVirtualFile
import dev.ukitomato.closta.platforms.intellij.chat.effortText
import dev.ukitomato.closta.platforms.intellij.chat.modeText
import dev.ukitomato.closta.platforms.intellij.chat.shortModeText
import dev.ukitomato.closta.platforms.intellij.ide.IdeEditorSelections
import dev.ukitomato.closta.platforms.intellij.thread.CardHint
import dev.ukitomato.closta.platforms.intellij.thread.JUMP_KEY
import dev.ukitomato.closta.platforms.intellij.thread.ThreadStyle
import dev.ukitomato.closta.platforms.intellij.thread.cardHint
import dev.ukitomato.closta.presenter.view.AttachmentFault
import dev.ukitomato.closta.presenter.view.AttachmentLimits
import dev.ukitomato.closta.presenter.view.AttachmentVerdict
import dev.ukitomato.closta.presenter.view.ComposerState
import dev.ukitomato.closta.presenter.view.SwitchKind
import dev.ukitomato.closta.presenter.view.SwitchRecord
import dev.ukitomato.closta.presenter.view.checkAttachment
import dev.ukitomato.closta.presenter.view.shortLabel
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.awt.BorderLayout
import java.awt.Dimension
import java.awt.FlowLayout
import java.awt.Image
import java.awt.datatransfer.DataFlavor
import java.awt.dnd.DnDConstants
import java.awt.dnd.DropTarget
import java.awt.dnd.DropTargetAdapter
import java.awt.dnd.DropTargetDropEvent
import java.awt.event.InputEvent
import java.awt.event.KeyEvent
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import javax.imageio.ImageIO
import javax.swing.JComponent
import javax.swing.JPanel
import javax.swing.KeyStroke
import javax.swing.Timer

/** The attach button's name: the gallery finds the button by it. */
const val ATTACH_BUTTON = "closta.composer.attach"

/**
 * The composer: the chips of what goes with the message, the input (the IDE's editor, so typing is the
 * editor's), and under it the attach button, the permission mode, the model with its effort, the context used and
 * send or stop; a fixed-height line under the box says what happened. It shows a [ComposerState] and calls back; it
 * keeps only what is being written (the text, the chips, the messages sent before for ↑), and that in its [draft],
 * which outlives it when the conversation moves.
 */
@Suppress("TooManyFunctions", "LargeClass") // one composer, its keys and its chips
class ComposerPanel(
    private val project: Project,
    private val scope: CoroutineScope,
    private val parent: Disposable,
    private val draft: ComposerDraft = ComposerDraft(PromptHistory(emptyList())),
) {
    var onSend: (String, List<Attachment>, Outgoing) -> Unit = { _, _, _ -> }
    var onStop: () -> Unit = {}
    var onModel: (String) -> Unit = {}
    var onEffort: (String) -> Unit = {}
    var onMode: (String) -> Unit = {}

    /** The Bypass bar was answered and went: the keyboard goes back to the input. */
    var onLetGo: () -> Unit = {}

    /** [JUMP_KEY] was pressed: the waiting card at the top takes the keyboard; false when no card waits. */
    var onJump: () -> Boolean = { false }

    // How many cards wait for an answer: the line says the key to go to them meanwhile.
    private var cardsWaiting = 0

    private var state: ComposerState? = null
    private var sendable = false
    private var announced: String? = null
    private var rewinding = false
    private val canSend get() = sendable && !rewinding
    private val attached get() = draft.attached
    private val selections get() = draft.selections
    private var currentFile: VirtualFile? = null
    private val chipKinds = ArrayList<ChipKind>()
    private var switchingSince: Pair<String, Long>? = null
    private var shownBlock = SendBlock.NONE
    private val block get() = if (rewinding) SendBlock.REWINDING else shownBlock
    private val messages = StatusMessages()

    /** The switch whose missing answer was already said: it is said once, then the line goes back to the base. */
    private var saidLate: String? = null

    private val field = Field(project, ComposerCompletion(project) { state?.commands.orEmpty() })
    private val chips = JPanel(WrapLayout(FlowLayout.LEFT, JBUI.scale(GAP), JBUI.scale(2))).apply { isOpaque = false }
    private val attach =
        ToolbarButton(null, AllIcons.General.Add, false) { showAttachMenu(it) }
            .tip(ClostaBundle.message("composer.attach.tooltip"))
            .apply {
                name = ATTACH_BUTTON
                hint = ClostaBundle.message("composer.attach.hint.files")
            }
    private val mode = ToolbarButton("", null, true) { button -> state?.let { showModes(it, button) } }
    private val model = ToolbarButton("", null, true) { button -> state?.let { showModels(it, button) } }
    private val context = ContextUse()
    private val send =
        ToolbarButton(null, SEND_IDLE, false) { sendNow() }
            .tip(ClostaBundle.message("composer.send.tooltip"))
    private val stop =
        ToolbarButton(null, AllIcons.Actions.Suspend, false) { onStop() }
            .tip(ClostaBundle.message("composer.stop.tooltip"))
    private val status = StatusLine()
    private val confirm = JPanel(BorderLayout()).apply { isVisible = false }
    private val box = ComposerBox()
    private val ticker = Timer(TICK_MS) { showStatus() }

    val component: JComponent =
        JPanel(BorderLayout()).apply {
            border = JBUI.Borders.empty(ThreadStyle.INSET, ThreadStyle.INSET, 0, ThreadStyle.INSET)
            isOpaque = false
            add(confirm, BorderLayout.NORTH)
            add(box, BorderLayout.CENTER)
            add(status, BorderLayout.SOUTH)
        }

    /**
     * What is wired to the composer's current editor: the field makes a new editor each time it is shown again, so the
     * last one's listeners and shortcuts are let go here rather than piling up under [parent].
     */
    private var wiring: Disposable? = null

    /** The file the editor last showed, so a dismissed chip stays away until another file is shown. */
    private var selectedFile: VirtualFile? = null

    init {
        box.layout = BorderLayout(0, JBUI.scale(GAP))
        box.add(chips, BorderLayout.NORTH)
        box.add(field, BorderLayout.CENTER)
        box.add(bar(), BorderLayout.SOUTH)
        field.text = draft.text
        field.addSettingsProvider { editor -> wire(editor) }
        project.messageBus.connect(parent).subscribe(
            FileEditorManagerListener.FILE_EDITOR_MANAGER,
            object : FileEditorManagerListener {
                override fun selectionChanged(event: FileEditorManagerEvent) = follow(event.newFile)
            },
        )
        follow(FileEditorManager.getInstance(project).selectedFiles.firstOrNull())
        DropTarget(component, DnDConstants.ACTION_COPY, dropFiles())
        component.addComponentListener(
            object : java.awt.event.ComponentAdapter() {
                override fun componentResized(e: java.awt.event.ComponentEvent) = state?.let(::showBar) ?: Unit
            },
        )
        com.intellij.openapi.util.Disposer
            .register(parent) { ticker.stop() }
        // Esc on the Bypass bar's own links says no too.
        object : DumbAwareAction() {
            override fun actionPerformed(e: AnActionEvent) = closeBypass()

            override fun update(e: AnActionEvent) {
                e.presentation.isEnabled = confirm.isVisible
            }

            override fun getActionUpdateThread() = ActionUpdateThread.EDT
        }.registerCustomShortcutSet(CustomShortcutSet(KeyStroke.getKeyStroke(KeyEvent.VK_ESCAPE, 0)), confirm, parent)
    }

    fun focusTarget(): JComponent = field

    /** Tells the composer how many cards wait for an answer (on the EDT). */
    fun cardsWaiting(count: Int) {
        if (count == cardsWaiting) return
        cardsWaiting = count
        showStatus()
    }

    /** Says [text] in the line under the box, as a refusal (a rewind the CLI turned down). */
    fun refused(text: String) = say(text, StatusSource.REFUSAL, error = true)

    /**
     * Shows [next] (on the EDT): the buttons' names, send or stop, the context used, a switch waiting. [blocked] says
     * why nothing can be sent when [sendable] is false.
     */
    fun show(
        next: ComposerState,
        sendable: Boolean,
        blocked: SendBlock = if (sendable) SendBlock.NONE else SendBlock.CLOSED,
    ) {
        state = next
        this.sendable = sendable
        shownBlock = if (sendable) SendBlock.NONE else blocked
        showBar(next)
        val switching = next.switching
        if (switching == null) {
            switchingSince = null
            ticker.stop()
        } else if (switchingSince?.first != switching.id) {
            switchingSince = switching.id to System.currentTimeMillis()
        }
        showStatus()
    }

    /** Holds sending while a rewind opens the copy: the message would go to the session that is then stopped. */
    fun rewinding(on: Boolean) {
        if (rewinding == on) return
        rewinding = on
        state?.let(::showBar)
        showStatus()
    }

    private fun bar(): JComponent {
        val left = JPanel(WrapLayout(FlowLayout.LEFT, 0, 0)).apply { isOpaque = false }
        left.add(attach)
        left.add(mode)
        left.add(model)
        val right = JPanel(FlowLayout(FlowLayout.RIGHT, 0, 0)).apply { isOpaque = false }
        right.add(context)
        right.add(send)
        right.add(stop)
        return JPanel(BorderLayout()).apply {
            isOpaque = false
            add(left, BorderLayout.CENTER)
            add(right, BorderLayout.EAST)
        }
    }

    private fun showBar(next: ComposerState) {
        val narrow = component.width in 1 until JBUI.scale(NARROW)
        val modeName = next.mode ?: "default"
        mode.text = if (narrow) shortModeText(modeName) else modeText(modeName)
        mode.normal =
            com.intellij.util.ui.UIUtil
                .getLabelForeground()
        // Bypass is said by an icon too, not by the colour alone.
        mode.icon = if (modeName == ComposerPopups.BYPASS) AllIcons.General.Warning else null
        mode.toolTipText = ClostaBundle.message("composer.mode.tooltip")
        mode.accessibleLabel = ClostaBundle.message("composer.mode.accessible", modeText(modeName))
        val effort = next.effort?.takeIf { next.effortLevels.isNotEmpty() }
        val modelName = shortModel(if (narrow) shortLabel(next.model) else next.model.label, MODEL_SHOWN)
        val effortName = effort?.takeUnless { narrow }?.let(::effortText)
        model.text = listOfNotNull(modelName, effortName).joinToString(" · ")
        // The whole name and level, and the model's full id when the CLI gave one.
        val whole = listOfNotNull(next.model.label, effort?.let(::effortText)).joinToString(" · ")
        model.accessibleLabel = ClostaBundle.message("composer.model.accessible", whole)
        model.toolTipText = listOfNotNull(whole, next.model.resolved?.takeIf { it != whole }).joinToString(" — ")
        val used = next.context
        context.isVisible = used != null
        if (used != null) {
            context.show(used.percentage)
            context.toolTipText = contextTip(next)
        }
        send.isVisible = true
        send.toolTipText =
            ClostaBundle.message(if (next.running) "composer.send.queue" else "composer.send.tooltip")
        send.enabledToClick = canSend
        send.disabledReason = sendBlockReason(block)
        showSendReady()
        val waiting = if (block == SendBlock.STARTING) WAITING_FOR_CLI else sendBlockReason(block)
        model.isVisible = block == SendBlock.NONE || next.models.isNotEmpty() || next.model.resolved != null
        for (button in listOf(mode, model)) {
            button.enabledToClick = block == SendBlock.NONE
            button.disabledReason = waiting
        }
        stop.isVisible = next.running
        stop.enabledToClick = !next.stopping
        stop.disabledReason = ClostaBundle.message("composer.status.stopping")
    }

    private fun contextTip(next: ComposerState): String =
        buildString {
            val line = { key: String, a: Any, b: Any -> append(ClostaBundle.message(key, "$a", "$b")).append("<br>") }
            append("<html>")
            next.context?.let { line("composer.context.tokens", it.totalTokens, it.maxTokens) }
            next.tokens?.let {
                line("composer.context.io", it.input, it.output)
                line("composer.context.cache", it.cacheRead, it.cacheCreation)
            }
            next.costUsd?.let { append(ClostaBundle.message("composer.context.cost", "%.4f".format(it))) }
            append("</html>")
        }

    private fun showStatus() {
        val next = state ?: return
        val now = System.currentTimeMillis()
        val shown = messages.shown(now, baseMessage(next, now))
        status.say(shown?.text, shown?.error == true)
        if (shown != null &&
            shown.text != announced &&
            shown.source in setOf(StatusSource.REFUSAL, StatusSource.SESSION)
        ) {
            AccessibleAnnouncerUtil.announce(status, shown.text, true)
        }
        announced = shown?.text
        val watching = messages.pending || switchingSince != null
        if (watching && !ticker.isRunning) {
            ticker.start()
        } else if (!watching) {
            ticker.stop()
        }
    }

    /**
     * What the line says when nothing was posted: the switch waiting, "Esc to stop" while a reply runs, why nothing
     * can be sent. A switch with no answer in time is said once, in red for a while, and then the line goes on.
     */
    private fun baseMessage(
        next: ComposerState,
        now: Long,
    ): StatusMessage? {
        val switching = next.switching
        val since = switchingSince
        val waited = since?.let { now - it.second }
        var waitingFor: String? = null
        if (switching != null && waited != null) {
            val what = switchedTo(next, switching)
            if (waited <= SWITCH_WAIT_MS) {
                waitingFor = ClostaBundle.message("composer.switch.switching", what)
            } else if (saidLate != switching.id) {
                saidLate = switching.id
                val late = ClostaBundle.message("composer.switch.noAnswer", what)
                messages.post(StatusMessage(late, StatusSource.SWITCH, true, now, ERROR_TTL_MS, untilKeystroke = true))
            }
        }
        val text =
            when {
                waitingFor != null -> waitingFor
                cardHint(focusInCard = false, waiting = cardsWaiting) == CardHint.JUMP ->
                    ClostaBundle.message("composer.status.jump", KeymapUtil.getKeystrokeText(JUMP_KEY))
                next.stopping -> ClostaBundle.message("composer.status.stopping")
                next.running -> ClostaBundle.message("composer.status.escToStop")
                block == SendBlock.STARTING || block == SendBlock.REWINDING -> sendBlockReason(block)
                else -> null
            }
        return text?.let { StatusMessage(it, StatusSource.SESSION, false, now, null, false) }
    }

    /** The name of what [switching] switches to, as the buttons say it. */
    private fun switchedTo(
        next: ComposerState,
        switching: SwitchRecord,
    ): String =
        when (switching.kind) {
            SwitchKind.MODEL -> next.models.firstOrNull { it.value == switching.value }?.label ?: switching.value
            SwitchKind.MODE -> modeText(switching.value)
            else -> effortText(switching.value)
        }

    /** Posts [text] to the status line: a refusal stays [ERROR_TTL_MS], a hint [HINT_TTL_MS], or until a key. */
    private fun say(
        text: String,
        source: StatusSource,
        error: Boolean = false,
    ) {
        val ttl = if (error) ERROR_TTL_MS else HINT_TTL_MS
        messages.post(StatusMessage(text, source, error, System.currentTimeMillis(), ttl, untilKeystroke = true))
        showStatus()
    }

    private fun showModes(
        next: ComposerState,
        under: JComponent,
    ) {
        ComposerPopups.showAbove(ComposerPopups.modes(next) { chosen -> chooseMode(chosen) }, under)
    }

    private fun showModels(
        next: ComposerState,
        under: JComponent,
    ) {
        ComposerPopups.showAbove(ComposerPopups.models(next, onModel, onEffort), under)
    }

    private fun chooseMode(chosen: String) {
        if (chosen == state?.mode) return
        if (chosen == ComposerPopups.BYPASS) askBypass() else onMode(chosen)
    }

    /**
     * Bypass is asked for above the box (never in a dialog); Esc (in the input or on the bar) or the second button
     * says no. Either answer gives the keyboard back to the input.
     */
    private fun askBypass() {
        confirm.removeAll()
        val panel =
            com.intellij.ui.EditorNotificationPanel(com.intellij.ui.EditorNotificationPanel.Status.Warning).apply {
                text = ClostaBundle.message("composer.bypass.confirm")
                createActionLabel(ClostaBundle.message("composer.bypass.switch")) {
                    closeBypass()
                    onMode(ComposerPopups.BYPASS)
                }
                createActionLabel(ClostaBundle.message("composer.bypass.cancel")) { closeBypass() }
            }
        confirm.add(panel, BorderLayout.CENTER)
        confirm.isVisible = true
        component.revalidate()
    }

    private fun escapes(): Boolean = confirm.isVisible || state?.running == true

    private fun escape() = if (confirm.isVisible) closeBypass() else onStop()

    private fun closeBypass() {
        onLetGo()
        confirm.isVisible = false
        component.revalidate()
    }

    private fun cycleMode() {
        val next = state ?: return
        if (block != SendBlock.NONE) {
            sendBlockReason(block)?.let { say(it, StatusSource.REFUSAL) }
            return
        }
        nextMode(next.modes, next.mode)?.let(::chooseMode)
    }

    // --- the input -----------------------------------------------------------------------------------------------

    private fun wire(editor: EditorEx) {
        wiring?.let(com.intellij.openapi.util.Disposer::dispose)
        val forEditor =
            com.intellij.openapi.util.Disposer
                .newDisposable(parent, "Closta composer editor")
        wiring = forEditor
        dropOnText(editor.contentComponent, forEditor)
        editor.settings.isUseSoftWraps = true
        editor.setPlaceholder(ClostaBundle.message("composer.placeholder"))
        editor.setShowPlaceholderWhenFocused(true)
        editor.setVerticalScrollbarVisible(true)
        // The box draws the one frame; the editor inside has none of its own.
        editor.setBorder(JBUI.Borders.empty())
        editor.contentComponent.accessibleContext.accessibleName = ClostaBundle.message("composer.editor.name")
        editor.contentComponent.addFocusListener(
            object : java.awt.event.FocusAdapter() {
                override fun focusGained(e: java.awt.event.FocusEvent) {
                    box.focused = true
                }

                override fun focusLost(e: java.awt.event.FocusEvent) {
                    box.focused = false
                }
            },
        )
        val composing = { (editor as? EditorImpl)?.composedTextRange != null }
        val lookupOpen = { LookupManager.getActiveLookup(editor) != null }
        val ours = { !composing() && !lookupOpen() }
        // Enter is taken even when nothing can be sent, so it never falls through to the editor as a new line.
        key(editor, KeyEvent.VK_ENTER, 0, { ours() }) { sendNow() }
        key(editor, KeyEvent.VK_ENTER, InputEvent.SHIFT_DOWN_MASK, { true }) { newLine(editor) }
        // Esc says no to the Bypass bar first, and only then stops the reply.
        key(editor, KeyEvent.VK_ESCAPE, 0, { ours() && escapes() }, ::escape)
        key(editor, KeyEvent.VK_TAB, InputEvent.SHIFT_DOWN_MASK, { ours() }) { cycleMode() }
        val firstLine = { editor.caretModel.visualPosition.line == 0 }
        val lastLine = {
            editor.caretModel.visualPosition.line >= editor.offsetToVisualPosition(editor.document.textLength).line
        }
        key(editor, KeyEvent.VK_UP, 0, { ours() && firstLine() && draft.history.canUp }) {
            draft.history.up(field.text)?.let { recall(editor, it) }
        }
        key(editor, KeyEvent.VK_DOWN, 0, { ours() && lastLine() && draft.history.canDown }) {
            draft.history.down(field.text)?.let { recall(editor, it) }
        }
        key(editor, KeyEvent.VK_K, InputEvent.ALT_DOWN_MASK, { true }) { insertSelection() }
        key(editor, JUMP_KEY.keyCode, JUMP_KEY.modifiers, { true }) {
            if (!onJump()) say(ClostaBundle.message("composer.status.noneWaiting"), StatusSource.HINT)
        }
        val atStart = { field.text.isEmpty() && editor.caretModel.offset == 0 }
        val removable = { lastRemovable(chipKinds)?.let { chips.getComponent(it) as? Chip } }
        key(editor, KeyEvent.VK_BACK_SPACE, 0, { ours() && atStart() && removable() != null }) {
            removable()?.remove?.invoke()
        }
        pasteImage(editor)
        editor.document.addDocumentListener(
            object : DocumentListener {
                override fun documentChanged(event: DocumentEvent) {
                    draft.text = editor.document.text
                    showSendReady()
                    if (messages.pending) {
                        messages.keystroke()
                        showStatus()
                    }
                    val typed = event.newFragment
                    if (typed.length == 1 && (typed[0] == '@' || typed[0] == '/')) {
                        AutoPopupController.getInstance(project).scheduleAutoPopup(editor)
                    }
                }
            },
            forEditor,
        )
    }

    private fun key(
        editor: EditorEx,
        code: Int,
        modifiers: Int,
        enabled: () -> Boolean,
        act: () -> Unit,
    ) {
        object : DumbAwareAction() {
            override fun actionPerformed(e: AnActionEvent) = act()

            override fun update(e: AnActionEvent) {
                e.presentation.isEnabled = enabled()
            }

            override fun getActionUpdateThread() = ActionUpdateThread.EDT
        }.registerCustomShortcutSet(
            CustomShortcutSet(KeyStroke.getKeyStroke(code, modifiers)),
            editor.contentComponent,
            wiring ?: parent,
        )
    }

    private fun newLine(editor: EditorEx) =
        WriteCommandAction.runWriteCommandAction(project) { EditorModificationUtil.insertStringAtCaret(editor, "\n") }

    /** Puts [text] from the history in the input, the caret at its end. */
    private fun recall(
        editor: EditorEx,
        text: String,
    ) {
        field.text = text
        editor.caretModel.moveToOffset(editor.document.textLength)
    }

    /** The send button is drawn strong only when pressing it would send something, and faint otherwise. */
    private fun showSendReady() {
        val ready = canSend && (field.text.isNotBlank() || attached.isNotEmpty())
        send.icon = if (ready) SEND_READY else SEND_IDLE
    }

    private fun sendNow() {
        val words = field.text.trim()
        if (!canSend) {
            sendBlockReason(block)?.let { say(it, StatusSource.REFUSAL) }
            return
        }
        if (words.isEmpty() && attached.isEmpty()) return
        val files = attached.toList()
        val file = currentFile?.let { relative(it) }
        val outgoing = Outgoing(words, selections.toList(), file, files, draft.thumbnails.toMap())
        val text = outgoingText(outgoing) { rangeLabel(it.path, it.start, it.end, forChip = false) }
        val queued = state?.running == true
        field.text = ""
        attached.clear()
        draft.thumbnails.clear()
        selections.clear()
        messages.clear()
        if (queued) say(ClostaBundle.message("composer.status.queued"), StatusSource.HINT) else showStatus()
        showChips()
        onSend(text, files, outgoing)
    }

    /** The message was handed to the CLI (on the EDT): only now does it join the history for ↑. */
    fun sent(outgoing: Outgoing) {
        if (outgoing.words.isNotEmpty()) draft.history.add(outgoing.words)
    }

    /** The message was not handed over (on the EDT): its words, ranges and files are back, and [reason] says why. */
    fun giveBack(
        outgoing: Outgoing,
        reason: String,
    ) {
        field.text = restoredText(field.text, outgoing.words)
        selections.addAll(0, outgoing.selections)
        attached.addAll(0, outgoing.attachments.filter { it !in attached })
        draft.thumbnails.putAll(outgoing.thumbnails)
        showChips()
        say(reason, StatusSource.REFUSAL, error = true)
    }

    // --- chips and attachments -----------------------------------------------------------------------------------

    private fun follow(file: VirtualFile?) {
        if (file != null && file != selectedFile && selectedFile != null) draft.dismissed.clear()
        if (file != null) selectedFile = file
        currentFile =
            file?.takeIf {
                followable(it is ChatVirtualFile, it.isInLocalFileSystem) &&
                    it.url !in draft.dismissed &&
                    !it.isDirectory
            }
        showChips()
    }

    private fun showChips() {
        showSendReady()
        chips.removeAll()
        chipKinds.clear()
        currentFile?.let { file ->
            chipKinds += ChipKind.CURRENT_FILE
            chips.add(
                Chip(file.fileType.icon ?: AllIcons.FileTypes.Any_type, file.name, relative(file), dashed = true) {
                    draft.dismissed += file.url
                    follow(null)
                },
            )
        }
        selections.forEach { selection ->
            chipKinds += ChipKind.SELECTION
            chips.add(
                Chip(
                    AllIcons.Actions.ShowAsTree,
                    "${selection.path.substringAfterLast(
                        '/',
                    )} ${rangeLabel(selection.path, selection.start, selection.end, true)}",
                    selection.path,
                    false,
                ) {
                    selections -= selection
                    showChips()
                },
            )
        }
        attached.forEach { attachment ->
            chipKinds += ChipKind.ATTACHMENT
            val icon =
                when {
                    attachment.kind != AttachmentKind.IMAGE -> AllIcons.FileTypes.Any_type
                    else -> draft.thumbnails[attachment] ?: AllIcons.FileTypes.Image
                }
            chips.add(
                Chip(icon, attachment.name, null, false) {
                    attached -= attachment
                    draft.thumbnails.remove(attachment)
                    showChips()
                },
            )
        }
        chips.isVisible = chips.componentCount > 0
        chips.revalidate()
        chips.repaint()
    }

    private fun relative(file: VirtualFile): String =
        project.guessProjectDir()?.let { VfsUtilCore.getRelativePath(file, it) } ?: file.name

    private fun showAttachMenu(under: JComponent) {
        val items =
            listOf(ClostaBundle.message("composer.attach.files"), ClostaBundle.message("composer.attach.selection"))
        // Each row says the other way to the same place: files can be pasted or dropped, a selection put in the text.
        val hints =
            mapOf(
                items[0] to ClostaBundle.message("composer.attach.hint.files"),
                items[1] to ClostaBundle.message("composer.attach.hint.selection", "Alt+K"),
            )
        JBPopupFactory
            .getInstance()
            .createPopupChooserBuilder(items)
            .setRenderer(
                object : com.intellij.ui.ColoredListCellRenderer<String>() {
                    override fun customizeCellRenderer(
                        list: javax.swing.JList<out String>,
                        value: String,
                        index: Int,
                        selected: Boolean,
                        hasFocus: Boolean,
                    ) {
                        append(value)
                        hints[value]?.let { append("  $it", com.intellij.ui.SimpleTextAttributes.GRAYED_ATTRIBUTES) }
                    }
                },
            ).setItemChosenCallback { chosen ->
                if (chosen ==
                    items[0]
                ) {
                    chooseFiles()
                } else {
                    takeSelection(asChip = true)
                }
            }.createPopup()
            .let { ComposerPopups.showAbove(it, under) }
    }

    private fun chooseFiles() {
        val descriptor = FileChooserDescriptorFactory.createMultipleFilesNoJarsDescriptor()
        FileChooser.chooseFiles(
            descriptor,
            project,
            null,
        ) { files -> files.forEach { addFile(it.name, File(it.path)) } }
    }

    private fun insertSelection() = takeSelection(asChip = false)

    /** The editor's selection as a chip, or (Alt+K) as `@path#L5-10` where the caret is. */
    private fun takeSelection(asChip: Boolean) {
        scope.launch {
            val taken = (IdeEditorSelections(project).current() as? IdeResult.Ok)?.value
            withContext(Dispatchers.EDT) {
                if (taken == null) {
                    say(ClostaBundle.message("composer.selection.none"), StatusSource.HINT)
                    return@withContext
                }
                if (asChip) {
                    selections += LineSelection(taken.path, taken.startLine, taken.endLine)
                    showChips()
                } else {
                    val editor = field.editor ?: return@withContext
                    WriteCommandAction.runWriteCommandAction(project) {
                        EditorModificationUtil.insertStringAtCaret(
                            editor,
                            rangeLabel(taken.path, taken.startLine, taken.endLine, forChip = false) + " ",
                        )
                    }
                }
            }
        }
    }

    private fun pasteImage(editor: EditorEx) {
        val paste =
            com.intellij.openapi.actionSystem.ActionManager
                .getInstance()
                .getAction("EditorPaste")
                ?.shortcutSet ?: return
        object : DumbAwareAction() {
            override fun actionPerformed(e: AnActionEvent) {
                val image = CopyPasteManager.getInstance().getContents<Image>(DataFlavor.imageFlavor) ?: return
                val name = "pasted-${LocalDateTime.now().format(PASTED_AT)}.png"
                offEdt({ png(image) }) { bytes -> addBytes(name, "image/png", bytes) }
            }

            // Only an image on the clipboard is taken here; anything else goes on to the editor's own paste.
            override fun update(e: AnActionEvent) {
                val manager = CopyPasteManager.getInstance()
                e.presentation.isEnabled =
                    manager.areDataFlavorsAvailable(DataFlavor.imageFlavor) &&
                    !manager.areDataFlavorsAvailable(DataFlavor.stringFlavor)
            }

            override fun getActionUpdateThread() = ActionUpdateThread.EDT
        }.registerCustomShortcutSet(paste, editor.contentComponent, wiring ?: parent)
    }

    private fun png(image: Image): ByteArray {
        val buffered =
            image as? BufferedImage
                ?: BufferedImage(image.getWidth(null), image.getHeight(null), BufferedImage.TYPE_INT_ARGB).also {
                    it.createGraphics().apply {
                        drawImage(image, 0, 0, null)
                        dispose()
                    }
                }
        return ByteArrayOutputStream().also { ImageIO.write(buffered, "png", it) }.toByteArray()
    }

    /**
     * Files dropped on the text become chips too, not only those dropped on the border. Anything else (a dragged
     * string) goes to the drop target the editor had, and that one is put back when [until] goes.
     */
    private fun dropOnText(
        text: JComponent,
        until: Disposable,
    ) {
        val editors = text.dropTarget
        val files = dropFiles()
        val listener =
            object : java.awt.dnd.DropTargetListener {
                private fun filesIn(event: java.awt.dnd.DropTargetDragEvent) =
                    event.isDataFlavorSupported(DataFlavor.javaFileListFlavor)

                // Whether the editor's own target was entered by this drag: only then does it hear the rest of it.
                private var entered = false

                override fun dragEnter(event: java.awt.dnd.DropTargetDragEvent) {
                    entered = !filesIn(event) && editors != null
                    if (filesIn(event)) files.dragEnter(event) else editors?.dragEnter(event)
                }

                override fun dragOver(event: java.awt.dnd.DropTargetDragEvent) {
                    when {
                        filesIn(event) -> event.acceptDrag(DnDConstants.ACTION_COPY)
                        entered -> editors?.dragOver(event)
                    }
                }

                override fun dropActionChanged(event: java.awt.dnd.DropTargetDragEvent) {
                    if (entered) editors?.dropActionChanged(event)
                }

                override fun dragExit(event: java.awt.dnd.DropTargetEvent) {
                    files.dragExit(event)
                    if (entered) editors?.dragExit(event)
                    entered = false
                }

                override fun drop(event: DropTargetDropEvent) {
                    val inEditor = entered
                    entered = false
                    when {
                        event.isDataFlavorSupported(DataFlavor.javaFileListFlavor) -> files.drop(event)
                        inEditor -> editors?.drop(event)
                        else -> event.rejectDrop()
                    }
                }
            }
        val target = DropTarget(text, editors?.defaultActions ?: DnDConstants.ACTION_COPY_OR_MOVE, listener)
        text.dropTarget = target
        com.intellij.openapi.util.Disposer
            .register(until) { if (text.dropTarget === target) text.dropTarget = editors }
    }

    private fun dropFiles() =
        object : DropTargetAdapter() {
            override fun dragEnter(event: java.awt.dnd.DropTargetDragEvent) {
                box.dragging = event.isDataFlavorSupported(DataFlavor.javaFileListFlavor)
            }

            override fun dragExit(event: java.awt.dnd.DropTargetEvent) {
                box.dragging = false
            }

            override fun drop(event: DropTargetDropEvent) {
                box.dragging = false
                if (!event.isDataFlavorSupported(DataFlavor.javaFileListFlavor)) {
                    event.rejectDrop()
                    return
                }
                event.acceptDrop(DnDConstants.ACTION_COPY)
                val files = event.transferable.getTransferData(DataFlavor.javaFileListFlavor) as? List<*>
                files.orEmpty().filterIsInstance<File>().forEach { addFile(it.name, it) }
                event.dropComplete(true)
            }
        }

    private fun addFile(
        name: String,
        file: File,
    ) {
        if (file.length() > AttachmentLimits.MAX_BYTES) {
            refuse(name, AttachmentFault.TOO_LARGE)
            return
        }
        offEdt({ file.readBytes() }) { bytes -> addBytes(name, mediaTypeByName(name), bytes, file.absolutePath) }
    }

    /**
     * Works [read] out off the EDT (a file of up to 5 MiB, a pasted image to encode) and gives the bytes to [then] on
     * the EDT. A read that fails is said on the status line.
     */
    private fun offEdt(
        read: () -> ByteArray,
        then: (ByteArray) -> Unit,
    ) {
        scope.launch {
            val bytes = withContext(Dispatchers.IO) { runCatching(read).getOrNull() }
            withContext(Dispatchers.EDT) {
                if (bytes == null) {
                    say(ClostaBundle.message("composer.attach.refused.unsupported"), StatusSource.REFUSAL, true)
                } else {
                    then(bytes)
                }
            }
        }
    }

    private fun addBytes(
        name: String,
        mediaType: String?,
        bytes: ByteArray,
        path: String? = null,
    ) {
        when (val verdict = checkAttachment(name, mediaType, bytes.size.toLong(), attached.size)) {
            is AttachmentVerdict.Refused -> refuse(name, verdict.fault)
            is AttachmentVerdict.Ok ->
                if (verdict.kind == AttachmentKind.TEXT && !isUtf8(bytes)) {
                    say(
                        ClostaBundle.message(
                            "composer.attach.refused",
                            name.take(NAME_SHOWN),
                            ClostaBundle.message("composer.attach.refused.utf8"),
                        ),
                        StatusSource.REFUSAL,
                        error = true,
                    )
                } else {
                    val attachment = Attachment(verdict.kind, verdict.mediaType, name, bytes, path)
                    attached += attachment
                    if (verdict.kind == AttachmentKind.IMAGE) thumbnail(attachment)
                    // Messages are left as they are: another file of the same drop may just have been refused.
                    showChips()
                }
        }
    }

    /** Makes [attachment]'s chip icon a small picture of it, off the EDT; it keeps the image icon until then. */
    private fun thumbnail(attachment: Attachment) {
        scope.launch {
            val size = JBUI.scale(THUMB)
            val icon =
                withContext(Dispatchers.IO) {
                    runCatching { ImageIO.read(attachment.bytes.inputStream()) }.getOrNull()?.let { image ->
                        val scale = size.toDouble() / maxOf(image.width, image.height)
                        val w = (image.width * scale).toInt().coerceAtLeast(1)
                        val h = (image.height * scale).toInt().coerceAtLeast(1)
                        javax.swing.ImageIcon(image.getScaledInstance(w, h, Image.SCALE_SMOOTH))
                    }
                }
            withContext(Dispatchers.EDT) {
                if (icon != null && attachment in attached) {
                    draft.thumbnails[attachment] = icon
                    showChips()
                }
            }
        }
    }

    private fun refuse(
        name: String,
        fault: AttachmentFault,
    ) {
        val why =
            when (fault) {
                AttachmentFault.TOO_LARGE -> ClostaBundle.message("composer.attach.refused.tooLarge")
                AttachmentFault.TOO_MANY ->
                    ClostaBundle.message("composer.attach.refused.tooMany", AttachmentLimits.MAX_PER_SEND)
                AttachmentFault.NAME_TOO_LONG ->
                    ClostaBundle.message("composer.attach.refused.nameTooLong", AttachmentLimits.MAX_NAME_CHARS)
                AttachmentFault.UNSUPPORTED -> ClostaBundle.message("composer.attach.refused.unsupported")
            }
        say(ClostaBundle.message("composer.attach.refused", name.take(NAME_SHOWN), why), StatusSource.REFUSAL, true)
    }

    private fun isUtf8(bytes: ByteArray): Boolean =
        try {
            Charsets.UTF_8
                .newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(bytes))
            true
        } catch (_: CharacterCodingException) {
            false
        }

    private fun mediaTypeByName(name: String): String? =
        when (name.substringAfterLast('.', "").lowercase()) {
            "png" -> "image/png"
            "jpg", "jpeg" -> "image/jpeg"
            "gif" -> "image/gif"
            "webp" -> "image/webp"
            "pdf" -> "application/pdf"
            "json" -> "application/json"
            "bmp" -> "image/bmp"
            else -> null
        }

    /** The input: the IDE's editor with completion, two to ten lines high. */
    private class Field(
        project: Project,
        completion: ComposerCompletion,
    ) : TextFieldWithCompletion(project, completion, "", false, true, false, false) {
        init {
            // The composer's box is the frame (C10): the text field's own border would draw a second one inside it.
            border = JBUI.Borders.empty()
        }

        override fun getPreferredSize(): Dimension {
            val size = super.getPreferredSize()
            val line = editor?.lineHeight ?: JBUI.scale(DEFAULT_LINE)
            val extra = insets.top + insets.bottom + JBUI.scale(EDGE)
            size.height = size.height.coerceIn(line * MIN_LINES + extra, line * MAX_LINES + extra)
            return size
        }
    }

    private companion object {
        val SEND_IDLE = IconLoader.getIcon("/icons/send.svg", ComposerPanel::class.java)
        val SEND_READY = IconLoader.getIcon("/icons/sendReady.svg", ComposerPanel::class.java)
        const val GAP = 4
        const val NARROW = 420
        const val TICK_MS = 1_000
        const val SWITCH_WAIT_MS = 10_000L
        const val ERROR_TTL_MS = 8_000L
        const val HINT_TTL_MS = 4_000L
        const val NAME_SHOWN = 40
        const val EDGE = 4
        const val DEFAULT_LINE = 18
        const val MIN_LINES = 2
        const val MAX_LINES = 10
        const val MODEL_SHOWN = 24
        const val THUMB = 16
        val PASTED_AT: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss")
    }
}
