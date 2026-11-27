package dev.ukitomato.closta.platforms.intellij.chat

import com.intellij.ui.EditorNotificationPanel
import com.intellij.ui.InlineBanner
import com.intellij.util.ui.JBUI
import dev.ukitomato.closta.platforms.intellij.thread.ThreadStyle
import dev.ukitomato.closta.platforms.intellij.ui.plainHtml
import dev.ukitomato.closta.presenter.view.LimitStatus
import dev.ukitomato.closta.presenter.view.RateLimitRecord
import java.awt.BorderLayout
import javax.swing.JPanel

/**
 * The banner above the composer when the plan's limit is near (a warning) or reached (an error). It shows
 * [show]'s record and nothing else; closing it calls [onDismiss] with the record's number, and the presenter says
 * whether it is still shown.
 */
class RateLimitBanner : JPanel(BorderLayout()) {
    var onDismiss: (Int) -> Unit = {}

    /** The record drawn, only to tell whether the next one differs: what is shown is the presenter's. */
    private var drawn: RateLimitRecord? = null

    init {
        isOpaque = false
        border = JBUI.Borders.empty(0, ThreadStyle.INSET)
        isVisible = false
    }

    fun show(record: RateLimitRecord?) {
        if (record == drawn) return
        drawn = record
        // The banner's close button can take it out of its parent, so a new record gets a new banner.
        removeAll()
        isVisible = record != null
        if (record != null) {
            val text = limitText(record)
            getAccessibleContext().accessibleName = text
            add(
                InlineBanner("<html>${plainHtml(text)}</html>", statusOf(record.status))
                    .showCloseButton(true)
                    .setCloseAction {
                        // The close takes the banner out: hidden until the next frame draws what the presenter says.
                        drawn = null
                        isVisible = false
                        onDismiss(record.seq)
                    },
                BorderLayout.CENTER,
            )
        }
        revalidate()
        repaint()
    }

    private fun statusOf(status: LimitStatus): EditorNotificationPanel.Status =
        when (status) {
            LimitStatus.REJECTED -> EditorNotificationPanel.Status.Error
            LimitStatus.WARNING, LimitStatus.ALLOWED -> EditorNotificationPanel.Status.Warning
        }
}
