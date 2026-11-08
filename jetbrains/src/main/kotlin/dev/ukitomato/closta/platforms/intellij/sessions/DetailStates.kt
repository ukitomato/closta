package dev.ukitomato.closta.platforms.intellij.sessions

import com.intellij.ui.dsl.builder.AlignX
import com.intellij.ui.dsl.builder.RightGap
import com.intellij.ui.dsl.builder.Row
import com.intellij.ui.dsl.builder.TopGap
import com.intellij.ui.dsl.builder.panel
import com.intellij.util.ui.JBUI
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.platforms.intellij.chat.Placement
import dev.ukitomato.closta.platforms.intellij.thread.HtmlBlock
import dev.ukitomato.closta.platforms.intellij.thread.ThreadRowViews
import dev.ukitomato.closta.platforms.intellij.thread.ThreadStyle
import dev.ukitomato.closta.platforms.intellij.thread.cardButton
import dev.ukitomato.closta.platforms.intellij.ui.plainTip
import dev.ukitomato.closta.presenter.view.ChangedFile
import dev.ukitomato.closta.presenter.view.SessionDetail
import java.awt.BorderLayout
import javax.swing.JComponent
import javax.swing.JPanel

// The detail pane's bodies for a session that does not wait: running, finished, never asked, and one that ran when the
// project last closed; and the pieces they share with the answer views.

/** How many changed files a finished session lists before "and n more". */
private const val CHANGES_SHOWN = 10

private const val GAP = 8

/** A running session: the tool it runs now, and the head of its last reply in grey. No streaming body. */
internal fun runningBody(detail: SessionDetail.Running): JComponent =
    panel {
        row {
            val tool = detail.tool
            if (tool == null) {
                cell(greyLine(ClostaBundle.message("sessions.window.detail.working")))
            } else {
                cell(ThreadRowViews.toolLine(tool)).align(AlignX.FILL)
            }
        }
        detail.replyHead?.let { head ->
            row { cell(ThreadRowViews.wrapping(head, ThreadStyle.muted)).align(AlignX.FILL) }
                .topGap(TopGap.SMALL)
        }
    }.apply { isOpaque = false }

/** What a finished session's body can do. */
internal class FinishedActions(
    val review: (askKey: String) -> Unit,
    val continueIn: () -> Unit,
)

/**
 * A finished session: its last reply (scrolling), the files its last turn changed, a link to review them all, and
 * Continue in Conversation (no field to write in here).
 */
internal fun finishedBody(
    detail: SessionDetail.Finished,
    blocks: List<HtmlBlock>,
    actions: FinishedActions,
): JComponent {
    val reply =
        if (blocks.isEmpty()) {
            greyLine(ClostaBundle.message("sessions.window.detail.noReply"))
        } else {
            markdownBox(blocks)
        }
    val files = detail.changes?.files.orEmpty()
    val below =
        panel {
            files.take(CHANGES_SHOWN).forEach { file -> row { changedFile(this, file) } }
            val hidden = files.size - CHANGES_SHOWN
            val rest =
                when {
                    hidden > 0 -> ClostaBundle.message("sessions.window.detail.changes.more", hidden)
                    files.isNotEmpty() && detail.changes?.more == true ->
                        ClostaBundle.message("sessions.window.detail.changes.andMore")
                    else -> null
                }
            rest?.let { row { cell(greyLine(it)) } }
            val askKey = detail.askKey
            if (files.isNotEmpty() && askKey != null) {
                row { link(ClostaBundle.message("sessions.window.detail.review")) { actions.review(askKey) } }
            }
            row {
                cell(
                    cardButton(
                        ClostaBundle.message("sessions.window.detail.continue"),
                        main = true,
                        actions.continueIn,
                    ),
                )
            }.topGap(TopGap.SMALL)
        }.apply {
            isOpaque = false
            border = JBUI.Borders.emptyTop(GAP)
        }
    return JPanel(BorderLayout()).apply {
        isOpaque = false
        add(reply, BorderLayout.CENTER)
        add(below, BorderLayout.SOUTH)
    }
}

private fun changedFile(
    row: Row,
    file: ChangedFile,
) {
    row.label(file.path.substringAfterLast('/').substringAfterLast('\\')).gap(RightGap.SMALL).applyToComponent {
        toolTipText = plainTip(file.path)
    }
    if (file.counted) {
        row.label("+${file.added}").gap(RightGap.SMALL).applyToComponent { foreground = ThreadStyle.added }
        row.label("−${file.removed}").applyToComponent { foreground = ThreadStyle.removed }
    }
}

/** A conversation where nothing was asked yet: a grey line (where to open it is in the header). */
internal fun freshBody(): JComponent =
    panel {
        row { cell(greyLine(ClostaBundle.message("sessions.window.detail.fresh"))) }
    }.apply { isOpaque = false }

/** A session that ran when the project last closed: Resume (in an editor tab), or in the sidebar. */
internal fun markBody(resume: (Placement) -> Unit): JComponent =
    panel {
        row { cell(greyLine(ClostaBundle.message("sessions.window.detail.mark"))) }
        row {
            cell(
                cardButton(ClostaBundle.message("sessions.window.detail.resume"), main = true) {
                    resume(Placement.EDITOR_TAB)
                },
            ).gap(RightGap.SMALL)
            link(ClostaBundle.message("chat.sessions.resumeInSidebar")) { resume(Placement.SIDEBAR) }
        }.topGap(TopGap.SMALL)
    }.apply { isOpaque = false }
