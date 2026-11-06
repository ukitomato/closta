package dev.ukitomato.closta.platforms.intellij.bench.baseline

import com.intellij.ui.JBColor
import com.intellij.ui.SimpleTextAttributes
import dev.ukitomato.closta.presenter.view.ToolLine
import dev.ukitomato.closta.presenter.view.ToolLineState
import java.awt.Color

/** The colours of a tool line, shared by the three surfaces: grey running, green done, red failed. */
object ToolLineText {
    private const val GREEN_LIGHT = 0x2E7D32
    private const val GREEN_DARK = 0x5FB865
    private const val RED_LIGHT = 0xC62828
    private const val RED_DARK = 0xF75464

    // checkUi: allow raw-size-colour — the benchmark's baseline keeps the old colours it is measured with
    val ADDED: Color = JBColor(GREEN_LIGHT, GREEN_DARK)

    // checkUi: allow raw-size-colour — the benchmark's baseline keeps the old colours it is measured with
    val REMOVED: Color = JBColor(RED_LIGHT, RED_DARK)
    private val RUNNING: Color = JBColor.GRAY

    fun dot(state: ToolLineState): Color =
        when (state) {
            ToolLineState.RUNNING -> RUNNING
            ToolLineState.OK -> ADDED
            ToolLineState.ERROR -> REMOVED
        }

    /** The pieces of [line] in order, each with its attributes: `●`, the label, `+a`, `−r`. */
    fun pieces(line: ToolLine): List<Pair<String, SimpleTextAttributes>> =
        buildList {
            add("● " to SimpleTextAttributes(SimpleTextAttributes.STYLE_PLAIN, dot(line.state)))
            add(line.label to SimpleTextAttributes.REGULAR_ATTRIBUTES)
            line.added?.let { add(" +$it" to SimpleTextAttributes(SimpleTextAttributes.STYLE_PLAIN, ADDED)) }
            line.removed?.let { add(" −$it" to SimpleTextAttributes(SimpleTextAttributes.STYLE_PLAIN, REMOVED)) }
        }
}
