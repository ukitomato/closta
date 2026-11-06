package dev.ukitomato.closta.platforms.intellij.thread

import com.intellij.util.ui.JBUI
import com.intellij.util.ui.StatusText
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import java.awt.Dimension
import java.awt.Graphics
import java.awt.Point
import java.awt.Rectangle
import javax.swing.JComponent
import javax.swing.JPanel
import javax.swing.JScrollPane
import javax.swing.JViewport
import javax.swing.Scrollable
import javax.swing.SwingUtilities

/** Makes and updates the component of a row, and guesses its height before it has been made. */
interface RowViews {
    fun create(row: ShownRow): JComponent

    /** Gives [component] the content of [row]; may return a new component when the old one cannot show it. */
    fun update(
        component: JComponent,
        row: ShownRow,
    ): JComponent

    fun estimate(
        row: ShownRow,
        width: Int,
    ): Int
}

/**
 * A column of rows in which only the rows near the view have components; the others are a height (a guess until the
 * row was in sight, its measured height after). A row made once is kept when it leaves the view, and rows near it are
 * made ahead a few milliseconds at a time while the EDT is idle, so scrolling back and forth makes nothing again.
 *
 * Painting is kept small: the column is opaque (a repaint in it starts here, not at the window's panes above), only a
 * row made, brought back or updated paints itself, a row that moved is painted by its bounds changing, and the column
 * is laid out again only when its height changes. When a row above the view changes height, the view moves by as
 * much, so what is being read stays put. Measured on Windows at 175% against the IDE's own editor (spec).
 */
@Suppress("TooManyFunctions") // Scrollable's five, and the column's own
class LazyRows(
    private val views: RowViews,
    /** An editor tab's rows, which get more room at their sides than the sidebar's. */
    roomy: Boolean = false,
    // checkUi: allow unnamed-component — named where it is made, as the conversation's column (ThreadSurface.kt)
) : JPanel(null),
    Scrollable {
    private var rows: List<ShownRow> = emptyList()
    private var heights = IntArray(0)
    private var measured = BooleanArray(0)
    private var tops = IntArray(1)
    private var measuredWidth = -1
    private var laidOutHeight = -1
    private val live = HashMap<String, Live>()
    private val side = if (roomy) ROOMY else PAD
    private val kept = HashMap<String, Live>()
    private var aheadQueued = false
    private var touched = false

    private class Live(
        var row: ShownRow,
        var component: JComponent,
    )

    // What an empty conversation says, in the middle of the column, instead of nothing at all.
    private val emptyText =
        object : StatusText(this) {
            override fun isStatusVisible(): Boolean = rows.isEmpty()
        }.apply { setText(EMPTY) }

    /** Whether the earlier conversation is still being read (a resume): the empty column says so instead. */
    var loading = false
        set(value) {
            if (field == value) return
            field = value
            emptyText.setText(if (value) ClostaBundle.message("chat.mcp.loading") else EMPTY)
            repaint()
        }

    init {
        isOpaque = true
        background = ThreadStyle.background
    }

    override fun paintComponent(g: Graphics) {
        super.paintComponent(g)
        emptyText.paint(this, g)
    }

    /** Takes the next rows. A row that is the same object keeps its height; a changed one is measured in sight. */
    fun setRows(next: List<ShownRow>) {
        val oldIndex = HashMap<String, Int>(rows.size * 2)
        rows.forEachIndexed { i, row -> oldIndex[row.key] = i }
        val nextHeights = IntArray(next.size)
        val nextMeasured = BooleanArray(next.size)
        val width = contentWidth()
        next.forEachIndexed { i, row ->
            val old = oldIndex[row.key]
            if (old != null) {
                nextHeights[i] = heights[old]
                nextMeasured[i] = measured[old] && rows[old] === row
            } else {
                nextHeights[i] = views.estimate(row, width) + gap(row)
            }
        }
        val keys = next.mapTo(HashSet(next.size * 2)) { it.key }
        live.keys.filter { it !in keys }.forEach { key -> live.remove(key)?.let { remove(it.component) } }
        kept.keys.retainAll(keys)
        rows = next
        heights = nextHeights
        measured = nextMeasured
        tops = IntArray(0)
        recomputeTops(0)
        layoutVisible()
    }

    /** Measures the row of [key] again (it opened or closed), and lays the column out. */
    fun remeasure(key: String) {
        val i = rows.indexOfFirst { it.key == key }
        if (i < 0) return
        measured[i] = false
        live[key]?.component?.revalidate()
        layoutVisible()
    }

    /** Makes the row of [key] again (it opened or closed, and shows other parts now), and measures it. */
    fun remake(key: String) {
        val i = rows.indexOfFirst { it.key == key }
        if (i < 0) return
        live.remove(key)?.let { remove(it.component) }
        kept.remove(key)
        measured[i] = false
        layoutVisible()
        repaint()
    }

    /** Measures again the row whose component holds [inside] (a card that opened a line). */
    fun remeasureHolding(inside: java.awt.Component) {
        val key =
            live.entries.firstOrNull { SwingUtilities.isDescendingFrom(inside, it.value.component) }?.key ?: return
        remeasure(key)
    }

    private fun gap(row: ShownRow): Int = JBUI.scale(if (row.opens) ThreadStyle.MESSAGE_GAP else ThreadStyle.ROW_GAP)

    private fun contentWidth(): Int =
        (viewport()?.extentSize?.width ?: width).coerceAtLeast(JBUI.scale(MIN_WIDTH)) - JBUI.scale(side) * 2 -
            underScrollbar()

    /**
     * How much of the view the vertical scrollbar covers: the IDE's scrollbar is drawn over the view, not beside it,
     * so the rows keep clear of it while it shows.
     */
    private fun underScrollbar(): Int {
        val port = viewport()
        val bar = (port?.parent as? JScrollPane)?.verticalScrollBar?.takeIf { it.isVisible }
        return if (port == null || bar == null) 0 else (port.x + port.width - bar.x).coerceIn(0, bar.width)
    }

    private fun viewport(): JViewport? = SwingUtilities.getAncestorOfClass(JViewport::class.java, this) as? JViewport

    private fun recomputeTops(from: Int) {
        if (tops.size != rows.size + 1) {
            tops = IntArray(rows.size + 1)
            tops[0] = JBUI.scale(PAD)
            for (i in rows.indices) tops[i + 1] = tops[i] + heights[i]
            return
        }
        for (i in from until rows.size) tops[i + 1] = tops[i] + heights[i]
    }

    private fun indexAt(y: Int): Int {
        var low = 0
        var high = rows.size - 1
        while (low < high) {
            val mid = (low + high + 1) / 2
            if (tops[mid] <= y) low = mid else high = mid - 1
        }
        return low
    }

    /** Makes, measures and places the rows in sight and one screen around; takes the others off the panel. */
    fun layoutVisible() {
        if (rows.isEmpty()) {
            letGo(emptySet())
            repaint()
            return
        }
        val port = viewport() ?: return
        val width = contentWidth()
        if (width != measuredWidth) {
            measuredWidth = width
            measured.fill(false)
        }
        val view = port.viewRect
        val first = indexAt((view.y - view.height).coerceAtLeast(0))
        var last = first
        var shift = 0
        var i = first
        while (i < rows.size && tops[i] < view.y + view.height * 2) {
            val row = rows[i]
            touched = false
            val component = componentFor(row)
            if (!measured[i]) shift += measure(i, component, width, view.y)
            component.setBounds(JBUI.scale(side), tops[i] + gap(row), width, heights[i] - gap(row))
            if (touched) component.repaint()
            last = i
            i++
        }
        letGo((first..last).mapTo(HashSet()) { rows[it].key })
        if (totalHeight() != laidOutHeight) {
            laidOutHeight = totalHeight()
            revalidate()
        }
        if (shift != 0) port.viewPosition = Point(0, (view.y + shift).coerceAtLeast(0))
        queueAhead()
    }

    /** Takes the rows not [inSight] off the panel; they are kept to come back. */
    private fun letGo(inSight: Set<String>) {
        live.entries.removeIf { (key, entry) ->
            (key !in inSight).also { gone ->
                if (gone) {
                    remove(entry.component)
                    kept[key] = entry
                }
            }
        }
    }

    private fun queueAhead() {
        if (aheadQueued) return
        aheadQueued = true
        SwingUtilities.invokeLater {
            aheadQueued = false
            makeAhead()
        }
    }

    /**
     * Makes and measures, for a few milliseconds, the rows near the view that have not been made yet: the nearest
     * first, below and above in turn. A row above the view that changes height moves the view by as much.
     */
    private fun makeAhead() {
        val port = viewport()
        if (port == null || rows.isEmpty()) return
        val width = contentWidth()
        if (width != measuredWidth) {
            layoutVisible()
            return
        }
        val view = port.viewRect
        val reach = view.height * AHEAD_SCREENS
        val deadline = System.nanoTime() + AHEAD_BUDGET_NS
        val walk = Walk(indexAt(view.y))
        while (System.nanoTime() < deadline && walk.more) {
            val down = walk.below.takeIf { it < rows.size && tops[it] < view.y + view.height + reach }
            val up = walk.above.takeIf { it >= 0 && tops[it + 1] > view.y - reach }
            walk.more = down != null || up != null
            listOfNotNull(down, up).forEach { index -> makeOne(index, width, view.y, walk) }
            walk.below++
            walk.above--
        }
        when {
            walk.shift != 0 -> port.viewPosition = Point(0, (view.y + walk.shift).coerceAtLeast(0))
            walk.changed -> layoutVisible()
            walk.more -> queueAhead()
        }
    }

    private class Walk(
        var below: Int,
    ) {
        var above = below - 1
        var more = true
        var shift = 0
        var changed = false
    }

    private fun makeOne(
        i: Int,
        width: Int,
        viewTop: Int,
        walk: Walk,
    ) {
        val row = rows[i]
        if (row.key in live || (row.key in kept && measured[i])) return
        val entry = kept[row.key]
        val component =
            when {
                entry == null -> views.create(row)
                entry.row !== row -> views.update(entry.component, row)
                else -> entry.component
            }
        kept[row.key] = Live(row, component)
        if (measured[i]) return
        val before = heights[i]
        walk.shift += measure(i, component, width, viewTop)
        walk.changed = walk.changed || heights[i] != before
    }

    private fun componentFor(row: ShownRow): JComponent {
        val entry =
            live[row.key] ?: kept.remove(row.key)?.also {
                add(it.component)
                live[row.key] = it
                touched = true
            }
        return when {
            entry == null ->
                views.create(row).also {
                    add(it)
                    live[row.key] = Live(row, it)
                    touched = true
                }
            entry.row !== row -> {
                touched = true
                views.update(entry.component, row).also { next ->
                    if (next !== entry.component) {
                        remove(entry.component)
                        add(next)
                    }
                    entry.row = row
                    entry.component = next
                }
            }
            else -> entry.component
        }
    }

    /** Measures row [i] at [width]; gives how far the rows in sight moved because it lies above [viewTop]. */
    private fun measure(
        i: Int,
        component: JComponent,
        width: Int,
        viewTop: Int,
    ): Int {
        // Laid out to the width all the way down, twice: a wrapping text anywhere inside knows its width only once its
        // parents are laid out, and its parents' heights follow from it on the second pass.
        component.setSize(width, Short.MAX_VALUE.toInt())
        layOutTree(component)
        component.setSize(width, component.preferredSize.height)
        layOutTree(component)
        val height = component.preferredSize.height + gap(rows[i])
        measured[i] = true
        if (height == heights[i]) return 0
        val moved = if (tops[i] < viewTop) height - heights[i] else 0
        heights[i] = height
        recomputeTops(i)
        return moved
    }

    private fun layOutTree(component: java.awt.Component) {
        if (component !is java.awt.Container) return
        component.doLayout()
        component.components.forEach(::layOutTree)
    }

    /** The component of the row [key] while it is in the column (in sight, or just made). */
    fun componentOf(key: String): JComponent? = live[key]?.component

    /** Where the row [key] starts in the column (a guess until it was measured); null when there is no such row. */
    fun topOf(key: String): Int? = rows.indexOfFirst { it.key == key }.takeIf { it >= 0 }?.let { tops[it] }

    fun totalHeight(): Int = tops[rows.size] + JBUI.scale(PAD)

    override fun getPreferredSize(): Dimension = Dimension(JBUI.scale(MIN_WIDTH), totalHeight())

    override fun doLayout() = Unit

    override fun getPreferredScrollableViewportSize(): Dimension = preferredSize

    override fun getScrollableUnitIncrement(
        visibleRect: Rectangle,
        orientation: Int,
        direction: Int,
    ): Int = JBUI.scale(UNIT_SCROLL)

    override fun getScrollableBlockIncrement(
        visibleRect: Rectangle,
        orientation: Int,
        direction: Int,
    ): Int = visibleRect.height

    override fun getScrollableTracksViewportWidth(): Boolean = true

    // As tall as the view while the rows are shorter, so the empty conversation's words sit in its middle.
    override fun getScrollableTracksViewportHeight(): Boolean = (viewport()?.height ?: 0) > totalHeight()

    private companion object {
        const val PAD = 14

        /** The room at the sides of an editor tab, which is wide (unscaled). */
        const val ROOMY = 24
        const val MIN_WIDTH = 120
        const val UNIT_SCROLL = 16
        const val AHEAD_SCREENS = 8
        const val AHEAD_BUDGET_NS = 4_000_000L
        val EMPTY: String get() = ClostaBundle.message("thread.empty")
    }
}
