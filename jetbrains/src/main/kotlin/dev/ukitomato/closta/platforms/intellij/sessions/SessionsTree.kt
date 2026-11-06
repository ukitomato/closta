package dev.ukitomato.closta.platforms.intellij.sessions

import com.intellij.openapi.project.Project
import com.intellij.ui.AnimatedIcon
import com.intellij.ui.ClientProperty
import com.intellij.ui.TreeSpeedSearch
import com.intellij.ui.render.RenderingHelper
import com.intellij.ui.treeStructure.Tree
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.presenter.view.WindowRow
import java.awt.Point
import javax.swing.event.TreeExpansionEvent
import javax.swing.event.TreeWillExpandListener
import javax.swing.tree.DefaultMutableTreeNode
import javax.swing.tree.DefaultTreeModel
import javax.swing.tree.DefaultTreeSelectionModel
import javax.swing.tree.ExpandVetoException
import javax.swing.tree.TreePath
import javax.swing.tree.TreeSelectionModel

/**
 * The sessions tree: a heading per group with its count, always expanded and never selected, and the sessions under
 * it. [show] takes the rows the presenter decided; it rebuilds the structure only when the rows themselves change
 * (a session came, went or moved to another heading) and otherwise updates the items in place, so an emission neither
 * flickers nor moves the scroll position. The selection is always set by session id, never by row.
 *
 * [onSelect] is told each selection the user makes; the selection [show] and [select] restore is not told.
 */
internal class SessionsTree(
    project: Project,
    private val onSelect: (SessionItem?) -> Unit,
) {
    private val root = DefaultMutableTreeNode()
    private val model = DefaultTreeModel(root)
    val component = Tree(model)

    /** The rows' shape at the last rebuild: the headings' groups and the items' ids, in order. */
    private var shape: List<Any> = emptyList()

    /** True while the tree sets a selection of its own, which [onSelect] is not told. */
    private var quiet = false

    init {
        component.isRootVisible = false
        component.showsRootHandles = false
        // A double click opens the session; it must not try to fold a heading.
        component.toggleClickCount = 0
        component.selectionModel = SkipHeadings()
        component.cellRenderer = SessionsRenderer(project)
        component.emptyText.text = ClostaBundle.message("chat.sessions.empty")
        ClientProperty.put(component, AnimatedIcon.ANIMATION_IN_RENDERER_ALLOWED, true)
        // Rows as wide as the visible tree: the right column at its edge, a long title cut before it. No row is drawn
        // whole past the edge (the expandable hint), not the selected one either: its right column would go with it.
        ClientProperty.put(component, RenderingHelper.SHRINK_LONG_RENDERER, true)
        component.setExpandableItemsEnabled(false)
        component.addTreeWillExpandListener(
            object : TreeWillExpandListener {
                override fun treeWillExpand(event: TreeExpansionEvent) = Unit

                override fun treeWillCollapse(event: TreeExpansionEvent): Unit = throw ExpandVetoException(event)
            },
        )
        component.addTreeSelectionListener { if (!quiet) onSelect(selected()) }
        TreeSpeedSearch.installOn(component, false) { path -> itemOf(path)?.title.orEmpty() }
    }

    /** Shows [rows] and selects [selectedId] (nothing when null or not among them). */
    fun show(
        rows: List<WindowRow<SessionItem>>,
        selectedId: String?,
    ) {
        quietly {
            val next = rows.map { if (it is WindowRow.Item) it.item.sessionId else (it as WindowRow.Header).group }
            if (next == shape) {
                update(rows)
            } else {
                shape = next
                rebuild(rows)
            }
            val path = selectedId?.let { pathOf(root, it) }
            if (path == null) component.clearSelection() else component.selectionPath = path
        }
    }

    /** Selects the session [sessionId] and scrolls to it; [onSelect] is told. */
    fun select(sessionId: String) {
        val path = pathOf(root, sessionId) ?: return
        component.selectionPath = path
        component.scrollPathToVisible(path)
    }

    fun selected(): SessionItem? = component.selectionPath?.let(::itemOf)

    /** The sessions in the order the tree shows them. */
    fun items(): List<SessionItem> = itemNodes(root).mapNotNull { it.userObject as? SessionItem }

    /** The session on the row at [point] (anywhere across the row), if that row is one. */
    fun itemAt(point: Point): SessionItem? {
        val row = component.getClosestRowForLocation(point.x, point.y)
        val bounds = component.getRowBounds(row)
        val onRow = bounds != null && point.y in bounds.y until bounds.y + bounds.height
        return if (onRow) component.getPathForRow(row)?.let(::itemOf) else null
    }

    /** Measures and paints the items again: what they show on the right (the time, the place) changes on its own. */
    fun refresh() {
        itemNodes(root).forEach(model::nodeChanged)
    }

    private fun update(rows: List<WindowRow<SessionItem>>) {
        val items = rows.mapNotNull { (it as? WindowRow.Item)?.item }
        itemNodes(root).zip(items).forEach { (node, item) ->
            if (node.userObject != item) {
                node.userObject = item
                model.nodeChanged(node)
            }
        }
    }

    private fun rebuild(rows: List<WindowRow<SessionItem>>) {
        root.removeAllChildren()
        var heading: DefaultMutableTreeNode? = null
        for (row in rows) {
            when (row) {
                is WindowRow.Header -> heading = DefaultMutableTreeNode(row, true).also(root::add)
                is WindowRow.Item -> heading?.add(DefaultMutableTreeNode(row.item, false))
            }
        }
        model.reload()
        root.children().toList().forEach { component.expandPath(TreePath(arrayOf(root, it))) }
    }

    private inline fun quietly(run: () -> Unit) {
        quiet = true
        try {
            run()
        } finally {
            quiet = false
        }
    }

    /**
     * The headings cannot be selected: a selection that lands on one moves on to the item past it, the way it went
     * (else the other way, when there is none that way).
     */
    private inner class SkipHeadings : DefaultTreeSelectionModel() {
        init {
            selectionMode = TreeSelectionModel.SINGLE_TREE_SELECTION
        }

        override fun setSelectionPaths(paths: Array<out TreePath>?) {
            val path = paths?.singleOrNull()
            if (path == null || itemOf(path) != null) {
                super.setSelectionPaths(paths)
                return
            }
            val at = component.getRowForPath(path)
            val lead = leadSelectionPath?.let(component::getRowForPath) ?: -1
            val step = if (at >= lead) 1 else -1
            // Home lands on the first heading going up: the item past it, going down, is the one meant.
            val next =
                listOf(at + step, at - step)
                    .mapNotNull(component::getPathForRow)
                    .firstOrNull { itemOf(it) != null }
            if (next != null) super.setSelectionPaths(arrayOf(next))
        }
    }
}

/** The nodes of the sessions under [root]'s headings, in order. */
private fun itemNodes(root: DefaultMutableTreeNode): List<DefaultMutableTreeNode> =
    root
        .children()
        .toList()
        .flatMap { heading -> heading.children().toList() }
        .map { it as DefaultMutableTreeNode }

/** The session at the end of [path]; null for a heading. */
private fun itemOf(path: TreePath): SessionItem? =
    (path.lastPathComponent as? DefaultMutableTreeNode)?.userObject as? SessionItem

/** The path to the session [sessionId] under [root], if it is there. */
private fun pathOf(
    root: DefaultMutableTreeNode,
    sessionId: String,
): TreePath? =
    itemNodes(root).firstOrNull { (it.userObject as? SessionItem)?.sessionId == sessionId }?.let { TreePath(it.path) }
