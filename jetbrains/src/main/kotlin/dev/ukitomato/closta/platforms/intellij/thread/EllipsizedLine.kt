package dev.ukitomato.closta.platforms.intellij.thread

import com.intellij.ui.SimpleColoredComponent
import com.intellij.ui.SimpleTextAttributes
import dev.ukitomato.closta.platforms.intellij.ui.plainTip
import java.awt.Dimension
import java.awt.Font
import javax.swing.Icon

/**
 * Coloured [pieces] on one line that fit the width it is given: what does not fit is cut, and the line ends in an
 * ellipsis. Its minimum width is the icon and the ellipsis, so a narrow column narrows the line instead of clipping
 * it. Its tooltip is the whole line when cut, followed by [note] (what the line is, or its state) when there is one.
 */
internal class EllipsizedLine(
    private val pieces: List<Pair<String, SimpleTextAttributes>>,
    private val dot: Icon?,
    lineFont: Font = ThreadStyle.mono,
    private val note: String? = null,
) : SimpleColoredComponent() {
    private var fittedTo = -1

    init {
        font = lineFont
        isOpaque = false
        fill(Int.MAX_VALUE)
    }

    // The whole line's width, whatever is shown now: a layout that asks again after a cut must not narrow it further.
    override fun getPreferredSize(): Dimension =
        Dimension(
            chrome() + getFontMetrics(font).stringWidth(pieces.joinToString("") { it.first }),
            super.getPreferredSize().height,
        )

    override fun getMinimumSize(): Dimension =
        Dimension(chrome() + getFontMetrics(font).stringWidth(ELLIPSIS), super.getMinimumSize().height)

    private fun chrome(): Int = iconWidth() + insets.left + insets.right + ipad.left + ipad.right

    override fun setBounds(
        x: Int,
        y: Int,
        width: Int,
        height: Int,
    ) {
        super.setBounds(x, y, width, height)
        if (width != fittedTo) fill(width)
    }

    private fun iconWidth(): Int = dot?.let { it.iconWidth + iconTextGap } ?: 0

    private fun fill(width: Int) {
        fittedTo = width
        clear() // clears the icon too
        icon = dot
        val whole = pieces.joinToString("") { it.first }
        val metrics = getFontMetrics(font)
        var room = width - chrome()
        if (width == Int.MAX_VALUE || metrics.stringWidth(whole) <= room) {
            pieces.forEach { (text, attributes) -> append(text, attributes) }
            toolTipText = note?.let(::plainTip)
            return
        }
        fitted(room - metrics.stringWidth(ELLIPSIS), metrics).forEach { (text, attributes) -> append(text, attributes) }
        toolTipText = plainTip(listOfNotNull(whole, note).joinToString(NOTE_GAP))
    }

    /** The pieces that fit in [room], the one cut short ending in an ellipsis. */
    private fun fitted(
        room: Int,
        metrics: java.awt.FontMetrics,
    ): List<Pair<String, SimpleTextAttributes>> {
        var left = room
        val shown = mutableListOf<Pair<String, SimpleTextAttributes>>()
        for ((text, attributes) in pieces) {
            val wide = metrics.stringWidth(text)
            if (wide > left) {
                var end = text.length
                while (end > 0 && metrics.stringWidth(text.substring(0, end)) > left) end--
                shown += text.substring(0, end) + ELLIPSIS to attributes
                return shown
            }
            shown += text to attributes
            left -= wide
        }
        return shown
    }

    private companion object {
        const val ELLIPSIS = "…"
        const val NOTE_GAP = " — "
    }
}
