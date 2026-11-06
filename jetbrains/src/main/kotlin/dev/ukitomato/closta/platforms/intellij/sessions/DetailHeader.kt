package dev.ukitomato.closta.platforms.intellij.sessions

import com.intellij.icons.AllIcons
import com.intellij.openapi.project.Project
import com.intellij.ui.JBColor
import com.intellij.ui.dsl.builder.RightGap
import com.intellij.ui.dsl.builder.panel
import com.intellij.util.ui.JBUI
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.platforms.intellij.chat.Placement
import dev.ukitomato.closta.platforms.intellij.chat.secondLine
import dev.ukitomato.closta.platforms.intellij.thread.ThreadStyle
import dev.ukitomato.closta.presenter.view.SessionGroup
import dev.ukitomato.closta.presenter.view.composerState
import java.time.Duration
import java.time.Instant
import javax.swing.JComponent

/**
 * What the detail's header line shows: [group] null for a session that ran when the project last closed. Two equal
 * models draw the same header, so the pane draws it again only when this changes.
 */
internal data class HeaderModel(
    val group: SessionGroup?,
    val title: String,
    /**
     * In grey after the title: the other project, repository and branch, the model, how long it has been under its
     * heading, and where it is shown (or that it is not shown).
     */
    val meta: String,
)

internal fun headerModel(
    item: SessionItem,
    project: Project,
    now: Instant,
): HeaderModel =
    when (item) {
        is SessionItem.Live -> {
            val entry = item.entry
            val other = entry.project.takeIf { it != project }?.name
            val view = entry.source.view.value
            val model = composerState(view.conversation, view.transcript).model.label
            val elapsed = entry.since?.let { elapsedText(Duration.between(it, now)) }
            val shown = shownAtText(entry) ?: ClostaBundle.message("sessions.window.placement.none")
            val meta = secondLine(other, entry.head, listOfNotNull(model, elapsed, shown).joinToString(" · "))
            HeaderModel(entry.summary.group, item.title, meta)
        }
        is SessionItem.Mark -> HeaderModel(null, item.title, "")
    }

/** What the header's links do. */
internal class HeaderActions(
    val open: (Placement) -> Unit,
    val interrupt: () -> Unit,
    val archive: () -> Unit,
)

/**
 * The header line, as a Services view's: the state's icon, the title in bold, the grey [HeaderModel.meta], and at the
 * right edge where to open the session, then Interrupt (the turn only) while it runs or Archive once it finished.
 */
internal fun headerView(
    model: HeaderModel,
    actions: HeaderActions,
): JComponent =
    panel {
        row {
            icon(model.group?.let(::sessionIcon) ?: AllIcons.Vcs.History).gap(RightGap.SMALL)
            label(model.title).bold().gap(RightGap.SMALL).applyToComponent { putClientProperty("html.disable", true) }
            label(model.meta).resizableColumn().applyToComponent {
                foreground = ThreadStyle.muted
                putClientProperty("html.disable", true)
            }
            if (model.group != null) {
                link(ClostaBundle.message("sessions.window.detail.openSidebar")) { actions.open(Placement.SIDEBAR) }
                    .gap(RightGap.SMALL)
                link(ClostaBundle.message("sessions.window.detail.openTab")) { actions.open(Placement.EDITOR_TAB) }
                    .gap(RightGap.SMALL)
                when (model.group) {
                    SessionGroup.RUNNING ->
                        link(ClostaBundle.message("sessions.window.detail.interrupt")) { actions.interrupt() }
                    SessionGroup.UNREAD, SessionGroup.OTHER ->
                        link(ClostaBundle.message("sessions.window.detail.archive")) { actions.archive() }
                    SessionGroup.WAITING -> Unit
                }
            }
        }
    }.apply {
        border =
            JBUI.Borders.compound(
                JBUI.Borders.customLineBottom(JBColor.border()),
                JBUI.Borders.empty(HEADER_PAD_V, HEADER_PAD_H),
            )
    }

private const val HEADER_PAD_V = 6
private const val HEADER_PAD_H = 12
