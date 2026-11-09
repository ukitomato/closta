package dev.ukitomato.closta.platforms.intellij.chat

import com.intellij.openapi.ui.popup.JBPopupFactory
import com.intellij.ui.EditorNotificationPanel
import com.intellij.ui.HyperlinkLabel
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.UIUtil
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.platforms.intellij.thread.ThreadStyle
import java.awt.BorderLayout
import java.awt.KeyboardFocusManager
import javax.swing.JComponent
import javax.swing.JPanel
import javax.swing.SwingUtilities

/**
 * The bar over the composer for the last turn's changes (EditorNotificationPanel's shape): "Changed 3 files" with
 * Review, Revert All and Keep All. Revert All asks inside the bar first, never in a dialog, with Revert and Cancel:
 * the user's own changes are reverted too, as Local History cannot tell the user's edits from Claude's.
 * It holds only whether it is asking; what it shows is [show]n from the conversation every time.
 */
class ChangesBar(
    private val changes: TurnChanges,
) {
    private val holder =
        JPanel(BorderLayout()).apply {
            isOpaque = false
            border = JBUI.Borders.empty(0, ThreadStyle.INSET)
        }
    val component: JComponent get() = holder

    /** The bar that had the keyboard was decided and went: the keyboard has no place here now. */
    var onLetGo: () -> Unit = {}

    private var shown: ChangesBarState? = null
    private var asking = false
    private var narrow = false

    init {
        holder.addComponentListener(
            object : java.awt.event.ComponentAdapter() {
                override fun componentResized(e: java.awt.event.ComponentEvent) {
                    val now = holder.width in 1 until JBUI.scale(NARROW)
                    if (now != narrow) {
                        narrow = now
                        redraw()
                    }
                }
            },
        )
    }

    /** Shows [state] (null hides the bar). */
    fun show(state: ChangesBarState?) {
        if (state == shown) return
        if (state?.askKey != shown?.askKey) asking = false
        shown = state
        redraw()
    }

    private fun redraw() {
        holder.removeAll()
        val state = shown
        holder.isVisible = state != null
        if (state != null) holder.add(if (asking) asking(state) else offering(state), BorderLayout.CENTER)
        holder.revalidate()
        holder.repaint()
    }

    private fun offering(state: ChangesBarState): JComponent =
        EditorNotificationPanel(EditorNotificationPanel.Status.Info).apply {
            text = state.text
            createActionLabel(ClostaBundle.message("chat.changes.review")) { changes.review(state.askKey) }
            val revert = ClostaBundle.message("chat.changes.revertAll")
            val keep = ClostaBundle.message("chat.changes.keepAll")
            val revertNow = {
                val had = hasKeyboard()
                asking = true
                redraw()
                if (had) focusFirstLink()
            }
            val keepNow = { settle { changes.keep(state.askKey) } }
            if (narrow) {
                // Narrow, the two are one menu, so the bar's text keeps its room.
                lateinit var menu: javax.swing.JComponent
                menu =
                    createActionLabel(ClostaBundle.message("chat.changes.all")) {
                        JBPopupFactory
                            .getInstance()
                            .createPopupChooserBuilder(listOf(revert, keep))
                            .setItemChosenCallback { chosen -> if (chosen == revert) revertNow() else keepNow() }
                            .createPopup()
                            .showUnderneathOf(menu)
                    }
            } else {
                createActionLabel(revert) { revertNow() }
                createActionLabel(keep) { keepNow() }
            }
        }

    private fun asking(state: ChangesBarState): JComponent =
        EditorNotificationPanel(EditorNotificationPanel.Status.Warning).apply {
            text = ClostaBundle.message("chat.changes.confirm")
            createActionLabel(ClostaBundle.message("chat.changes.confirm.revert")) {
                settle { changes.revertAll(state.askKey) }
            }
            createActionLabel(ClostaBundle.message("chat.changes.confirm.cancel")) {
                val had = hasKeyboard()
                asking = false
                redraw()
                if (had) focusFirstLink()
            }
        }

    private fun settle(action: () -> Unit) {
        // Asked before the links go: once they are gone, the keyboard is nowhere.
        if (hasKeyboard()) onLetGo()
        action()
        asking = false
        shown = null
        redraw()
    }

    private fun hasKeyboard(): Boolean =
        KeyboardFocusManager.getCurrentKeyboardFocusManager().focusOwner?.let {
            SwingUtilities.isDescendingFrom(it, holder)
        } == true

    // The link the keyboard had went with the bar it was on: the bar shown now takes it on its first link.
    private fun focusFirstLink() {
        val first =
            UIUtil.findComponentsOfType(holder, HyperlinkLabel::class.java).firstOrNull { it.isFocusable }
        SwingUtilities.invokeLater { first?.requestFocusInWindow() }
    }
}

private const val NARROW = 420
