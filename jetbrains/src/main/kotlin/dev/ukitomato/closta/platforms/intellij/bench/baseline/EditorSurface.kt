package dev.ukitomato.closta.platforms.intellij.bench.baseline

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.command.CommandProcessor
import com.intellij.openapi.command.undo.UndoUtil
import com.intellij.openapi.editor.EditorFactory
import com.intellij.openapi.editor.ex.EditorEx
import com.intellij.openapi.editor.markup.HighlighterLayer
import com.intellij.openapi.editor.markup.HighlighterTargetArea
import com.intellij.openapi.editor.markup.RangeHighlighter
import com.intellij.openapi.editor.markup.TextAttributes
import com.intellij.openapi.project.Project
import com.intellij.ui.JBColor
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.UIUtil
import dev.ukitomato.closta.platforms.intellij.bench.baseline.ToolLineText
import dev.ukitomato.closta.presenter.view.MessageRecord
import dev.ukitomato.closta.presenter.view.Role
import dev.ukitomato.closta.presenter.view.TextRecord
import dev.ukitomato.closta.presenter.view.ToolCallRecord
import dev.ukitomato.closta.presenter.view.Transcript
import dev.ukitomato.closta.presenter.view.toolLine
import javax.swing.JComponent

/**
 * The single-editor surface: the whole conversation is one read-only document, the way the new Terminal's output is.
 * Each message owns a stretch of the document; a message that changed rewrites only its stretch (and appends when it
 * only grew), and its styling is laid on as range highlighters. Selection across messages and Find are the editor's.
 */
class EditorSurface(
    project: Project,
) : Disposable {
    private val markdown = MarkdownText(project)
    private val document = EditorFactory.getInstance().createDocument("").also { UndoUtil.disableUndoFor(it) }
    private val editor = EditorFactory.getInstance().createViewer(document, project) as EditorEx
    private val segments = mutableListOf<Segment>()
    val component: JComponent = editor.component

    init {
        editor.settings.apply {
            isLineNumbersShown = false
            isFoldingOutlineShown = false
            isLineMarkerAreaShown = false
            isIndentGuidesShown = false
            isRightMarginShown = false
            isCaretRowShown = false
            isUseSoftWraps = true
            // A render comes every frame: an animated scroll still running then reads as "not at the bottom".
            isAnimatedScrolling = false
            additionalLinesCount = 0
            additionalColumnsCount = 0
        }
        editor.gutterComponentEx.isVisible = false
        editor.setBorder(JBUI.Borders.empty(PAD))
    }

    private class Segment(
        val key: String,
        var record: MessageRecord,
        var start: Int,
        var length: Int,
        val highlighters: MutableList<RangeHighlighter> = mutableListOf(),
    )

    fun render(transcript: Transcript) {
        val atBottom = isAtBottom()
        val order = transcript.messages.order
        if (segments.map { it.key } != order.take(segments.size)) clear()
        write {
            order.forEachIndexed { index, key ->
                val record = transcript.messages[key] ?: return@forEachIndexed
                val segment = segments.getOrNull(index)
                when {
                    segment == null -> append(key, record)
                    segment.record !== record -> rewrite(index, record)
                }
            }
        }
        if (atBottom) editor.scrollingModel.scrollVertically(editor.contentComponent.height)
    }

    private fun isAtBottom(): Boolean {
        val visible = editor.scrollingModel.visibleArea
        return visible.y + visible.height >= editor.contentComponent.height - JBUI.scale(BOTTOM_SLACK)
    }

    private fun append(
        key: String,
        record: MessageRecord,
    ) {
        val styled = styledOf(record)
        val start = document.textLength
        document.insertString(start, styled.text)
        segments += Segment(key, record, start, styled.length).also { paint(it, styled) }
    }

    private fun rewrite(
        index: Int,
        record: MessageRecord,
    ) {
        val segment = segments[index]
        val styled = styledOf(record)
        val old = document.charsSequence.subSequence(segment.start, segment.start + segment.length)
        if (styled.text.startsWith(old)) {
            document.insertString(segment.start + segment.length, styled.text.substring(old.length))
        } else {
            document.replaceString(segment.start, segment.start + segment.length, styled.text)
        }
        val delta = styled.length - segment.length
        segment.record = record
        segment.length = styled.length
        for (later in index + 1 until segments.size) segments[later].start += delta
        paint(segment, styled)
    }

    private fun paint(
        segment: Segment,
        styled: Styled,
    ) {
        val markup = editor.markupModel
        segment.highlighters.forEach(markup::removeHighlighter)
        segment.highlighters.clear()
        styled.spans.forEach { span ->
            val area = if (span.lines) HighlighterTargetArea.LINES_IN_RANGE else HighlighterTargetArea.EXACT_RANGE
            val layer = if (span.lines) HighlighterLayer.CARET_ROW - 1 else HighlighterLayer.SYNTAX
            segment.highlighters +=
                markup.addRangeHighlighter(
                    segment.start + span.start,
                    segment.start + span.end,
                    layer,
                    span.attributes,
                    area,
                )
        }
    }

    private fun styledOf(record: MessageRecord): Styled {
        val out = Styled()
        if (record.role == Role.USER) {
            val words =
                record.parts
                    .values()
                    .filterIsInstance<TextRecord>()
                    .joinToString("\n") { it.text }
            out.withStyle(USER, lines = true) { append(words) }
            out.blankLine()
            return out
        }
        record.parts.values().forEach { part ->
            when (part) {
                is TextRecord if part.reasoning -> {
                    out.withStyle(THINKING) { append("Thinking…") }
                    out.blankLine()
                }
                is TextRecord -> markdown.append(out, part.text)
                is ToolCallRecord -> {
                    ToolLineText.pieces(toolLine(part)).forEach { (text, attributes) ->
                        out.withStyle(attributes.toTextAttributes()) { append(text) }
                    }
                    out.newLine()
                }
                else -> Unit
            }
        }
        out.blankLine()
        return out
    }

    private fun clear() {
        write { document.setText("") }
        editor.markupModel.removeAllHighlighters()
        segments.clear()
    }

    private fun write(change: () -> Unit) =
        ApplicationManager.getApplication().runWriteAction {
            CommandProcessor.getInstance().runUndoTransparentAction(change)
        }

    override fun dispose() {
        EditorFactory.getInstance().releaseEditor(editor)
    }

    private companion object {
        const val PAD = 10
        const val BOTTOM_SLACK = 8
        val USER get() =
            TextAttributes(
                null,
                JBColor.namedColor("ActionButton.hoverBackground", JBColor.PanelBackground),
                null,
                null,
                0,
            )
        val THINKING get() = TextAttributes(UIUtil.getContextHelpForeground(), null, null, null, 0)
    }
}
