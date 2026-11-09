package dev.ukitomato.closta.platforms.intellij.thread

import com.intellij.openapi.util.text.StringUtil
import com.intellij.ui.components.JBCheckBox
import com.intellij.ui.components.JBRadioButton
import com.intellij.util.ui.JBUI
import java.awt.Dimension
import java.awt.Font
import java.awt.font.FontRenderContext
import javax.swing.AbstractButton
import javax.swing.plaf.basic.BasicHTML
import javax.swing.text.View

/** A radio button whose label wraps at the width it is given (an option's label can be a sentence). */
internal class WrappingRadioButton(
    text: String,
) : JBRadioButton(html(text)) {
    override fun getPreferredSize(): Dimension = wrapped(this) { super.getPreferredSize() }
}

/** A check box whose label wraps at the width it is given. */
internal class WrappingCheckBox(
    text: String,
) : JBCheckBox(html(text)) {
    override fun getPreferredSize(): Dimension = wrapped(this) { super.getPreferredSize() }
}

private fun html(text: String) = "<html>${StringUtil.escapeXmlEntities(text)}</html>"

private const val WRAP_CAP = 320
private const val WRAP_MIN = 60

/**
 * The size of [button] with its HTML label wrapped: no wider than the room its parent has right of it (or [WRAP_CAP]
 * before the parent has a width), as tall as the wrapped lines. [measure] gives the button's own size for the label
 * as it is laid out now. The label is laid out unwrapped first, at its natural width ([naturalWidth]): it keeps the
 * width it was last wrapped at, and measured there it would never grow wider again after the room grew.
 */
private fun wrapped(
    button: AbstractButton,
    measure: () -> Dimension,
): Dimension {
    val view = button.getClientProperty(BasicHTML.propertyKey) as? View
    return if (view == null) measure() else wrapped(button, view, measure)
}

private fun wrapped(
    button: AbstractButton,
    view: View,
    measure: () -> Dimension,
): Dimension {
    val full = naturalWidth(button)
    view.setSize(full, 0f)
    val natural = measure()
    val room = button.parent?.let { it.width - it.insets.right - button.x } ?: 0
    val cap = if (room > 0) room else JBUI.scale(WRAP_CAP)
    if (natural.width <= cap) return natural
    val chrome = natural.width - full.toInt()
    view.setSize((cap - chrome).coerceAtLeast(JBUI.scale(WRAP_MIN)).toFloat(), 0f)
    val insets = button.insets
    val height = view.getPreferredSpan(View.Y_AXIS).toInt() + insets.top + insets.bottom
    return Dimension(cap, maxOf(natural.height, height))
}

/**
 * The width of [button]'s label on one line, from a view of its own, kept while the text, the font and the way text is
 * measured stay. That way goes with the screen: a card made ahead, off the column, measures text at the main screen's
 * scale. A width kept from there and laid out on a screen of another scale is short of the label, which then wraps its
 * end onto a line the card was not measured with, and the card's bottom is cut off.
 */
private fun naturalWidth(button: AbstractButton): Float {
    val key = Triple(button.text, button.font, button.getFontMetrics(button.font).fontRenderContext)

    @Suppress("UNCHECKED_CAST")
    val kept = button.getClientProperty(NATURAL_WIDTH) as? Pair<Triple<String, Font, FontRenderContext>, Float>
    if (kept?.first == key) return kept.second
    val width = BasicHTML.createHTMLView(button, button.text).getPreferredSpan(View.X_AXIS)
    button.putClientProperty(NATURAL_WIDTH, key to width)
    return width
}

private const val NATURAL_WIDTH = "closta.wrapping.naturalWidth"
