package dev.ukitomato.closta.platforms.intellij.thread

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.ui.popup.JBPopupFactory
import com.intellij.ui.PopupHandler
import com.intellij.ui.dsl.listCellRenderer.textListCellRenderer
import com.intellij.util.ui.JBUI
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.platforms.intellij.chat.rewindRefusalText
import dev.ukitomato.closta.platforms.intellij.composer.ToolbarButton
import dev.ukitomato.closta.presenter.view.AskActions
import java.awt.BorderLayout
import java.awt.Container
import java.awt.Dimension
import java.awt.FlowLayout
import java.awt.Graphics
import java.awt.Graphics2D
import java.awt.RenderingHints
import javax.swing.JComponent
import javax.swing.JLayeredPane
import javax.swing.JPanel

/**
 * What an ask and a turn's end offer under the mouse: copy, rewind to here (the conversation only, or the files too)
 * and fork from here. What can be done is asked for when the mouse comes over the row ([RowActions.askActions]), so a
 * kept row is never out of date; what cannot is disabled with the reason as its tooltip. The rewind's choice and the
 * files' confirmation are popups at the button: no dialog in the middle of the screen.
 */
internal object AskActionViews {
    /**
     * [box] (the ask's own box) with its buttons over its top right corner, shown while the mouse is over it. They
     * take no width or line of their own, so the text has the box's whole width and does not move on hover.
     */
    fun ask(
        box: JPanel,
        askKey: String,
        text: String,
        actions: RowActions,
    ): JComponent {
        lateinit var copy: ToolbarButton
        copy =
            ToolbarButton(null, AllIcons.Actions.Copy, false) {
                ThreadRowViews.copyToClipboard(text)
                ThreadRowViews.copied(copy)
            }.apply { toolTipText = ClostaBundle.message("thread.ask.copy") }
        val rewind =
            ToolbarButton(null, AllIcons.Actions.Rollback, true) { under ->
                chooseRewind(under, askKey, false, actions.askActions(askKey, atEnd = false), actions)
            }.apply { toolTipText = ClostaBundle.message("thread.ask.rewind") }
        val fork =
            ToolbarButton(null, AllIcons.Vcs.Branch, false) {
                actions.askActions(askKey, atEnd = false).fork?.let { actions.act(askKey, false, it) }
            }.apply { toolTipText = ClostaBundle.message("thread.ask.fork") }
        val buttons = listOf(copy, rewind, fork)
        val strip = Strip(buttons)
        // The buttons lie over the box's top right corner, so the text keeps the box's whole width.
        val row =
            object : JLayeredPane() {
                override fun getPreferredSize(): Dimension = box.preferredSize

                override fun getMinimumSize(): Dimension = box.minimumSize

                override fun doLayout() {
                    box.setBounds(0, 0, width, height)
                    val size = strip.preferredSize
                    strip.setBounds(width - size.width, 0, size.width, size.height)
                }
            }.apply {
                add(box, JLayeredPane.DEFAULT_LAYER)
                add(strip, JLayeredPane.PALETTE_LAYER)
            }
        onHover(row) { over ->
            if (over) {
                val now = actions.askActions(askKey, atEnd = false)
                val why = now.refusal?.let(::rewindRefusalText)
                rewind.enabledToClick = now.rewind != null
                rewind.disabledReason = why
                fork.enabledToClick = now.fork != null
                fork.disabledReason = why
            }
            buttons.forEach { it.isVisible = over }
        }
        askMenu(box, askKey, text, actions)
        return row
    }

    /**
     * The ask's right-click menu: the same copy, rewind and fork as its buttons, for when the mouse is not over them
     * or the keyboard opens the menu. What cannot be done now is greyed.
     */
    private fun askMenu(
        box: JComponent,
        askKey: String,
        text: String,
        actions: RowActions,
    ) {
        fun now() = actions.askActions(askKey, atEnd = false)
        val group =
            DefaultActionGroup(
                DumbAwareAction.create(ClostaBundle.message("thread.ask.copy")) {
                    ThreadRowViews.copyToClipboard(text)
                    ThreadRowViews.copied(box)
                },
                menuAction(ClostaBundle.message("thread.ask.rewind"), { now().rewind != null }) {
                    chooseRewind(box, askKey, false, now(), actions)
                },
                menuAction(ClostaBundle.message("thread.ask.fork"), { now().fork != null }) {
                    now().fork?.let { actions.act(askKey, false, it) }
                },
            )

        fun install(component: java.awt.Component) {
            if (component is JComponent && component !is ToolbarButton) {
                PopupHandler.installPopupMenu(component, group, MENU_PLACE)
            }
            (component as? Container)?.components?.forEach(::install)
        }
        install(box)
    }

    private fun menuAction(
        text: String,
        can: () -> Boolean,
        run: () -> Unit,
    ): DumbAwareAction =
        object : DumbAwareAction(text) {
            override fun getActionUpdateThread() = ActionUpdateThread.EDT

            override fun update(e: AnActionEvent) {
                e.presentation.isEnabled = can()
            }

            override fun actionPerformed(e: AnActionEvent) = run()
        }

    /**
     * The turn end's rewind to here: keeps the turn, leaves out what came after it. The ask's own rewind button, with
     * its words as the tooltip; shown only once another ask came after the turn (`TurnEndRow.followed`). While a reply
     * runs it is disabled, with the reason as the tooltip.
     */
    fun turnEndRewind(
        askKey: String,
        actions: RowActions,
    ): JComponent {
        val button =
            ToolbarButton(null, AllIcons.Actions.Rollback, true) { under ->
                val now = actions.askActions(askKey, atEnd = true)
                if (now.rewind != null) chooseRewind(under, askKey, true, now, actions)
            }.apply { toolTipText = ClostaBundle.message("thread.ask.rewind") }
        onHover(button) { over ->
            if (over) {
                val now = actions.askActions(askKey, atEnd = true)
                button.enabledToClick = now.rewind != null
                button.disabledReason = now.refusal?.let(::rewindRefusalText)
            }
        }
        return button
    }

    private fun chooseRewind(
        under: JComponent,
        askKey: String,
        atEnd: Boolean,
        offered: AskActions,
        actions: RowActions,
    ) {
        val choices = listOfNotNull(offered.rewind?.let { CONVERSATION_ONLY }, offered.rewindFiles?.let { WITH_FILES })
        if (choices.isEmpty()) return
        JBPopupFactory
            .getInstance()
            .createPopupChooserBuilder(choices)
            .setRenderer(textListCellRenderer { it })
            .setItemChosenCallback { chosen ->
                when (chosen) {
                    CONVERSATION_ONLY -> offered.rewind?.let { actions.act(askKey, atEnd, it) }
                    else ->
                        offered.rewindFiles?.let { files ->
                            confirmFiles(under) { actions.act(askKey, atEnd, files) }
                        }
                }
            }.createPopup()
            .showUnderneathOf(under)
    }

    // Putting the files back cannot be taken back from here: it is asked once more, at the same button.
    private fun confirmFiles(
        under: JComponent,
        yes: () -> Unit,
    ) {
        JBPopupFactory
            .getInstance()
            .createConfirmation(
                ClostaBundle.message("thread.ask.rewindFiles.confirm"),
                ClostaBundle.message("thread.ask.rewindFiles.yes"),
                ClostaBundle.message("thread.ask.rewindFiles.no"),
                yes,
                1,
            ).showUnderneathOf(under)
    }

    private val CONVERSATION_ONLY: String get() = ClostaBundle.message("thread.ask.rewind.conversationOnly")
    private val WITH_FILES: String get() = ClostaBundle.message("thread.ask.rewind.withFiles")

    /**
     * The ask's buttons, at the top of its box. Its size stays the same whether they are shown, so the text does not
     * move on hover; it asks for no more height than the text's line.
     */
    private class Strip(
        private val buttons: List<JComponent>,
        // checkUi: allow unnamed-component — a container: each button in it carries its own name
    ) : JPanel(BorderLayout()) {
        private val line = JPanel(FlowLayout(FlowLayout.RIGHT, 0, 0)).apply { isOpaque = false }

        init {
            isOpaque = false
            border = JBUI.Borders.empty(GAP, GAP, GAP, GAP)
            buttons.forEach {
                it.isVisible = false
                line.add(it)
            }
            add(line, BorderLayout.NORTH)
        }

        override fun getPreferredSize(): Dimension {
            val wide = buttons.sumOf { it.preferredSize.width } + insets.left + insets.right
            val tall = buttons.maxOf { it.preferredSize.height } + insets.top + insets.bottom
            return Dimension(wide, tall)
        }

        // Shown over the text: on the box's own fill, so the words under it do not show through.
        override fun paintComponent(g: Graphics) {
            if (buttons.none { it.isVisible }) return
            val g2 = g.create() as Graphics2D
            try {
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
                g2.color = ThreadStyle.askBackground
                val arc = JBUI.scale(ThreadStyle.ARC)
                g2.fillRoundRect(0, 0, width, height, arc, arc)
            } finally {
                g2.dispose()
            }
        }
    }

    private const val GAP = 4
    private const val MENU_PLACE = "ClostaAsk"
}
