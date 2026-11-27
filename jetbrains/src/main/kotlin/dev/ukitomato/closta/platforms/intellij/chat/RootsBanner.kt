package dev.ukitomato.closta.platforms.intellij.chat

import com.intellij.ui.EditorNotificationPanel
import com.intellij.ui.InlineBanner
import com.intellij.util.ui.JBUI
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.platforms.intellij.thread.ThreadStyle
import java.awt.BorderLayout
import javax.swing.JPanel

/**
 * The banner above the composer that says the IDE's folders changed since this session started, with a link to start it
 * again. It shows what [showUp] says and holds nothing else: whether it is up is the content roots' watch's, and a link
 * that finds a turn running is refused by whoever handles [onRestart].
 */
class RootsBanner : JPanel(BorderLayout()) {
    var onRestart: () -> Unit = {}

    init {
        isOpaque = false
        border = JBUI.Borders.empty(0, ThreadStyle.INSET)
        isVisible = false
        val banner =
            InlineBanner(ClostaBundle.message("chat.roots.changed"), EditorNotificationPanel.Status.Info)
                .showCloseButton(false)
                .addAction(ClostaBundle.message("chat.roots.restart")) { onRestart() }
        add(banner, BorderLayout.CENTER)
    }

    fun showUp(up: Boolean) {
        if (isVisible == up) return
        isVisible = up
        revalidate()
        repaint()
    }
}
