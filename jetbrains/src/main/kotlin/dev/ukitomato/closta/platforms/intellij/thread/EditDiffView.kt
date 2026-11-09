package dev.ukitomato.closta.platforms.intellij.thread

import com.intellij.diff.DiffContentFactory
import com.intellij.diff.DiffManager
import com.intellij.diff.requests.SimpleDiffRequest
import com.intellij.ide.ui.UISettings
import com.intellij.openapi.components.service
import com.intellij.openapi.diff.DiffColors
import com.intellij.openapi.editor.colors.EditorColorsManager
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.fileTypes.FileTypeManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.components.JBLabel
import com.intellij.util.ui.JBUI
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.platforms.intellij.ide.IdeBridgeService
import dev.ukitomato.closta.presenter.view.ApprovalRecord
import dev.ukitomato.closta.presenter.view.DIFF_MAX_LINES
import dev.ukitomato.closta.presenter.view.DiffKind
import dev.ukitomato.closta.presenter.view.EditDiff
import dev.ukitomato.closta.presenter.view.diffSides
import dev.ukitomato.closta.presenter.view.editDiff
import java.awt.Color
import java.awt.Dimension
import java.awt.Graphics
import java.awt.Graphics2D
import java.awt.RenderingHints
import java.awt.geom.RoundRectangle2D
import javax.accessibility.AccessibleContext
import javax.accessibility.AccessibleRole
import javax.swing.JComponent
import javax.swing.ScrollPaneConstants

/**
 * A permission card's small diff: the lines in one painted component (a card may carry up to [DIFF_MAX_LINES] of them,
 * so not a component per line), inside a scroll pane no taller than [VISIBLE_LINES] lines. The wheel goes on to the
 * conversation; the lines scroll with the bars, and sideways with Shift+wheel ([SidewaysScroll]).
 */
internal fun diffBox(diff: EditDiff): JComponent {
    val lines = DiffLinesView(diff)
    return object : SidewaysScroll(
        lines,
        ScrollPaneConstants.VERTICAL_SCROLLBAR_AS_NEEDED,
        ScrollPaneConstants.HORIZONTAL_SCROLLBAR_AS_NEEDED,
    ) {
        // The bars are drawn over the lines, inside the box.
        // Little width asked for: the card's row gives it its width, and a long line scrolls sideways inside.
        override fun getPreferredSize(): Dimension {
            val inner = lines.preferredSize
            return Dimension(
                minOf(inner.width, JBUI.scale(NARROW)),
                minOf(inner.height, lines.lineHeight() * VISIBLE_LINES),
            )
        }

        // Rounded like every other box: the lines are clipped to the corners and the line drawn over them.
        override fun paint(g: Graphics) {
            val arc = JBUI.scale(ThreadStyle.ARC).toFloat()
            val inside = g.create() as Graphics2D
            try {
                inside.clip(RoundRectangle2D.Float(0f, 0f, width.toFloat(), height.toFloat(), arc, arc))
                super.paint(inside)
            } finally {
                inside.dispose()
            }
            val edge = g.create() as Graphics2D
            try {
                edge.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
                edge.color = ThreadStyle.cardBorder
                edge.draw(RoundRectangle2D.Float(HALF_PX, HALF_PX, width - 1f, height - 1f, arc, arc))
            } finally {
                edge.dispose()
            }
        }
    }.apply {
        border = JBUI.Borders.empty(1)
        // Nothing inside is opaque, so every repaint (a scroll too) comes through paint() above and its corners.
        isOpaque = false
        viewport.isOpaque = false
    }
}

/** The words under a card's diff: the counts, a replace-all note, and why the lines stop early. */
internal fun diffNote(diff: EditDiff): JComponent = JBLabel(diffNoteText(diff)).apply { foreground = ThreadStyle.muted }

private fun diffNoteText(diff: EditDiff): String {
    val parts = mutableListOf("+${diff.added} −${diff.removed}")
    if (diff.replaceAll) parts += ClostaBundle.message("thread.diff.replaceAll")
    if (diff.cut) parts += ClostaBundle.message("thread.diff.cut", DIFF_MAX_LINES)
    return parts.joinToString(" · ")
}

private const val VISIBLE_LINES = 12
private const val NARROW = 120

/** Half a pixel: a one-pixel line drawn on the pixel grid. */
private const val HALF_PX = 0.5f

private class DiffLinesView(
    private val diff: EditDiff,
) : JComponent() {
    private val scheme = EditorColorsManager.getInstance().globalScheme
    private val addedFill: Color? = scheme.getAttributes(DiffColors.DIFF_INSERTED)?.backgroundColor
    private val removedFill: Color? = scheme.getAttributes(DiffColors.DIFF_DELETED)?.backgroundColor

    init {
        font = ThreadStyle.mono
        isOpaque = false // paints its whole background itself, but repaints go through the box's rounded clip
        background = ThreadStyle.background
    }

    private var accessible: AccessibleContext? = null

    fun lineHeight(): Int = getFontMetrics(font).height

    /** It draws its lines itself: a screen reader gets what the note under it says. */
    override fun getAccessibleContext(): AccessibleContext =
        accessible ?: object : AccessibleJComponent() {
            override fun getAccessibleRole(): AccessibleRole = AccessibleRole.LABEL
        }.also {
            it.accessibleName = diffNoteText(diff)
            accessible = it
        }

    override fun getPreferredSize(): Dimension {
        val metrics = getFontMetrics(font)
        val widest = diff.lines.maxOfOrNull { metrics.stringWidth(PREFIX + it.text) } ?: 0
        return Dimension(widest + JBUI.scale(PAD) * 2, metrics.height * diff.lines.size)
    }

    override fun paintComponent(g: Graphics) {
        val g2 = g.create() as Graphics2D
        try {
            UISettings.setupAntialiasing(g2)
            g2.color = background
            g2.fillRect(0, 0, width, height)
            val metrics = g2.getFontMetrics(font)
            g2.font = font
            val clip = g2.clipBounds ?: bounds
            val first = (clip.y / metrics.height).coerceAtLeast(0)
            val last = ((clip.y + clip.height) / metrics.height).coerceAtMost(diff.lines.size - 1)
            for (index in first..last) {
                val line = diff.lines[index]
                val top = index * metrics.height
                val fill =
                    when (line.kind) {
                        DiffKind.ADDED -> addedFill
                        DiffKind.REMOVED -> removedFill
                        DiffKind.SAME -> null
                    }
                if (fill != null) {
                    g2.color = fill
                    g2.fillRect(0, top, width, metrics.height)
                }
                // The mark in the VCS colour, the same "−" as the counts: a removed line reads as removed even where
                // the scheme's deleted fill is a grey.
                val (mark, markColor) =
                    when (line.kind) {
                        DiffKind.ADDED -> "+ " to ThreadStyle.added
                        DiffKind.REMOVED -> "− " to ThreadStyle.removed
                        DiffKind.SAME -> PREFIX to foreground
                    }
                val baseline = top + metrics.ascent
                g2.color = markColor
                g2.drawString(mark, JBUI.scale(PAD), baseline)
                g2.color = foreground
                g2.drawString(line.text, JBUI.scale(PAD) + metrics.stringWidth(PREFIX), baseline)
            }
        } finally {
            g2.dispose()
        }
    }

    private companion object {
        const val PREFIX = "  "
        const val PAD = 6
    }
}

// The IDE's path for the file [cliPath] a call names, or null when it is outside the project (nothing is opened).
private fun ideDiffPath(
    project: Project,
    cliPath: String,
): String? {
    val cliPaths = project.service<IdeBridgeService>().cliPaths
    val root = project.basePath?.let(cliPaths::toCli) ?: return null
    return toolPathTarget(cliPath, root)?.let(cliPaths::toIde)
}

/**
 * Opens the IDE's diff viewer on what [approval]'s call would do: the file now against the file after it (an `Edit`'s
 * replacement put in, a `Write`'s content). Nothing is written.
 */
internal fun openEditDiff(
    project: Project,
    approval: ApprovalRecord,
) {
    val tool = approval.toolName ?: ""
    val diff = editDiff(tool, approval.input)
    val idePath = diff?.let { ideDiffPath(project, it.filePath) }
    if (diff == null || idePath == null) return
    findThenOnEdt(project, idePath) { file -> showEditDiff(project, tool, approval, diff, file) }
}

private fun showEditDiff(
    project: Project,
    tool: String,
    approval: ApprovalRecord,
    diff: EditDiff,
    file: VirtualFile?,
) {
    val now = file?.let { FileDocumentManager.getInstance().getDocument(it)?.text }
    val (left, right) = diffSides(tool, approval.input, now) ?: return
    val type = FileTypeManager.getInstance().getFileTypeByFileName(diff.filePath.substringAfterLast('/'))
    val factory = DiffContentFactory.getInstance()
    val request =
        SimpleDiffRequest(
            "$tool: ${diff.filePath.substringAfterLast('/')}",
            factory.create(project, left, type),
            factory.create(project, right, type),
            ClostaBundle.message(if (file == null) "thread.diff.left.missing" else "thread.diff.left.now"),
            ClostaBundle.message("thread.diff.right", tool),
        )
    DiffManager.getInstance().showDiff(project, request)
}
