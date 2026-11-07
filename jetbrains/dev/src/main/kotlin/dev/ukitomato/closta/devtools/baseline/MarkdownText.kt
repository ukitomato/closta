package dev.ukitomato.closta.devtools.baseline

import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.editor.DefaultLanguageHighlighterColors
import com.intellij.openapi.editor.colors.CodeInsightColors
import com.intellij.openapi.editor.colors.EditorColorsManager
import com.intellij.openapi.editor.markup.TextAttributes
import com.intellij.openapi.fileTypes.SyntaxHighlighterFactory
import com.intellij.openapi.project.Project
import com.intellij.ui.JBColor
import dev.ukitomato.closta.platforms.intellij.thread.fenceLanguage
import org.commonmark.ext.gfm.tables.TableBlock
import org.commonmark.ext.gfm.tables.TableCell
import org.commonmark.ext.gfm.tables.TableHead
import org.commonmark.ext.gfm.tables.TableRow
import org.commonmark.ext.gfm.tables.TablesExtension
import org.commonmark.node.BlockQuote
import org.commonmark.node.BulletList
import org.commonmark.node.Code
import org.commonmark.node.Emphasis
import org.commonmark.node.FencedCodeBlock
import org.commonmark.node.HardLineBreak
import org.commonmark.node.Heading
import org.commonmark.node.HtmlBlock
import org.commonmark.node.HtmlInline
import org.commonmark.node.IndentedCodeBlock
import org.commonmark.node.Link
import org.commonmark.node.ListItem
import org.commonmark.node.Node
import org.commonmark.node.OrderedList
import org.commonmark.node.Paragraph
import org.commonmark.node.SoftLineBreak
import org.commonmark.node.StrongEmphasis
import org.commonmark.node.Text
import org.commonmark.node.ThematicBreak
import org.commonmark.parser.Parser
import java.awt.Font

/**
 * Markdown written into an editor as plain text: the marks are dropped and what they meant becomes styling — headings
 * and strong text bold, inline code on a background, code fences coloured by their language's lexer on a block
 * background, tables as aligned text. A fence the lexer fails on stays plain.
 */
class MarkdownText(
    private val project: Project,
) {
    private val parser = Parser.builder().extensions(listOf(TablesExtension.create())).build()
    private val scheme get() = EditorColorsManager.getInstance().globalScheme

    fun append(
        out: Styled,
        markdown: String,
    ) {
        blocks(out, parser.parse(markdown), "")
    }

    private fun blocks(
        out: Styled,
        parent: Node,
        indent: String,
    ) {
        var node = parent.firstChild
        while (node != null) {
            block(out, node, indent)
            node = node.next
        }
    }

    @Suppress("CyclomaticComplexMethod") // one branch per kind of block
    private fun block(
        out: Styled,
        node: Node,
        indent: String,
    ) {
        when (node) {
            is Heading -> {
                out.append(indent)
                out.withStyle(BOLD) { inlines(this, node) }
                out.blankLine()
            }
            is Paragraph -> {
                out.append(indent)
                inlines(out, node)
                if (node.parent is ListItem) out.newLine() else out.blankLine()
            }
            is BulletList, is OrderedList -> {
                list(out, node, indent)
                if (node.parent !is ListItem) out.blankLine()
            }
            is FencedCodeBlock -> fence(out, node.info, node.literal, indent)
            is IndentedCodeBlock -> fence(out, null, node.literal, indent)
            is BlockQuote -> out.withStyle(QUOTE) { blocks(this, node, "$indent│ ") }
            is ThematicBreak -> {
                out.append("$indent────────")
                out.blankLine()
            }
            is TableBlock -> table(out, node, indent)
            is HtmlBlock -> {
                out.append(node.literal)
                out.blankLine()
            }
            else -> blocks(out, node, indent)
        }
    }

    private fun list(
        out: Styled,
        list: Node,
        indent: String,
    ) {
        var number = (list as? OrderedList)?.markerStartNumber ?: 1
        var item = list.firstChild
        while (item != null) {
            val marker = if (list is OrderedList) "${number++}. " else "• "
            out.append(indent + marker)
            var child = item.firstChild
            var first = true
            while (child != null) {
                val inner = indent + " ".repeat(marker.length)
                if (first && child is Paragraph) {
                    inlines(out, child)
                    out.newLine()
                } else {
                    block(out, child, inner)
                }
                first = false
                child = child.next
            }
            item = item.next
        }
    }

    private fun inlines(
        out: Styled,
        parent: Node,
    ) {
        var next = parent.firstChild
        while (next != null) {
            val node = next
            when (node) {
                is Text -> out.append(node.literal)
                is Code -> out.withStyle(INLINE_CODE) { append(node.literal) }
                is Emphasis -> out.withStyle(ITALIC) { inlines(this, node) }
                is StrongEmphasis -> out.withStyle(BOLD) { inlines(this, node) }
                is Link ->
                    out.withStyle(
                        scheme.getAttributes(CodeInsightColors.HYPERLINK_ATTRIBUTES),
                    ) { inlines(this, node) }
                is SoftLineBreak -> out.append(" ")
                is HardLineBreak -> out.append("\n")
                is HtmlInline -> out.append(node.literal)
                else -> inlines(out, node)
            }
            next = node.next
        }
    }

    private fun fence(
        out: Styled,
        info: String?,
        literal: String,
        indent: String,
    ) {
        val code = literal.removeSuffix("\n").lines().joinToString("\n") { indent + it }
        out.newLine()
        val start = out.length
        out.withStyle(CODE_BLOCK, lines = true) { append(code) }
        colour(out, start, code, info)
        out.blankLine()
    }

    private fun colour(
        out: Styled,
        start: Int,
        code: String,
        info: String?,
    ) {
        val language = fenceLanguage(info) ?: return
        try {
            val highlighter = SyntaxHighlighterFactory.getSyntaxHighlighter(language, project, null) ?: return
            val lexer = highlighter.highlightingLexer
            lexer.start(code)
            while (lexer.tokenType != null) {
                val attributes =
                    highlighter.getTokenHighlights(lexer.tokenType).fold(TextAttributes()) { merged, key ->
                        TextAttributes.merge(merged, scheme.getAttributes(key))
                    }
                if (!attributes.isEmpty) out.spans += Span(start + lexer.tokenStart, start + lexer.tokenEnd, attributes)
                lexer.advance()
            }
        } catch (
            @Suppress("TooGenericExceptionCaught") failure: Exception,
        ) {
            thisLogger().info("a code fence is left uncoloured (${failure.javaClass.simpleName})")
        }
    }

    private fun table(
        out: Styled,
        table: TableBlock,
        indent: String,
    ) {
        val rows = mutableListOf<Pair<Boolean, List<String>>>()
        var section = table.firstChild
        while (section != null) {
            var row = section.firstChild
            while (row != null) {
                if (row is TableRow) rows += (section is TableHead) to cells(row)
                row = row.next
            }
            section = section.next
        }
        val widths = IntArray(rows.maxOfOrNull { it.second.size } ?: 0)
        rows.forEach { (_, cells) -> cells.forEachIndexed { i, cell -> widths[i] = maxOf(widths[i], cell.length) } }
        rows.forEach { (head, cells) ->
            val line = cells.mapIndexed { i, cell -> cell.padEnd(widths[i]) }.joinToString(" │ ")
            out.append(indent)
            if (head) out.withStyle(BOLD) { append(line) } else out.append(line)
            out.newLine()
            if (head) {
                out.append(indent + widths.joinToString("─┼─") { "─".repeat(it) })
                out.newLine()
            }
        }
        out.blankLine()
    }

    private fun cells(row: TableRow): List<String> {
        val cells = mutableListOf<String>()
        var cell = row.firstChild
        while (cell != null) {
            if (cell is TableCell) cells += Styled().also { inlines(it, cell) }.text.toString()
            cell = cell.next
        }
        return cells
    }

    private companion object {
        const val CODE_LIGHT = 0xF2F3F5
        const val CODE_DARK = 0x2B2D30
        val BOLD = TextAttributes(null, null, null, null, Font.BOLD)
        val ITALIC = TextAttributes(null, null, null, null, Font.ITALIC)

        // checkUi: allow raw-size-colour — the benchmark's baseline keeps the old colours it is measured with
        val CODE_BACKGROUND = JBColor(CODE_LIGHT, CODE_DARK)
        val INLINE_CODE get() = TextAttributes(null, CODE_BACKGROUND, null, null, Font.PLAIN)
        val CODE_BLOCK get() = TextAttributes(null, CODE_BACKGROUND, null, null, Font.PLAIN)
        val QUOTE get() =
            EditorColorsManager
                .getInstance()
                .globalScheme
                .getAttributes(DefaultLanguageHighlighterColors.DOC_COMMENT)
    }
}
