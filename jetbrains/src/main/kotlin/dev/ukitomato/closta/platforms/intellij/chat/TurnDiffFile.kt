package dev.ukitomato.closta.platforms.intellij.chat

import com.intellij.diff.tools.combined.CombinedBlockProducer
import com.intellij.diff.tools.combined.CombinedDiffComponentProcessor
import com.intellij.diff.tools.combined.CombinedDiffManager
import com.intellij.diff.tools.combined.CombinedDiffVirtualFile
import com.intellij.openapi.project.Project

/**
 * One turn's changes in a combined diff tab. Files with the same [path] are equal, so showing the same turn again
 * goes to the tab already open instead of opening a second one.
 */
class TurnDiffFile(
    private val producers: List<CombinedBlockProducer>,
    name: String,
    path: String,
) : CombinedDiffVirtualFile(name, path) {
    override fun createViewer(project: Project): CombinedDiffComponentProcessor =
        CombinedDiffManager.getInstance(project).createProcessor(name).also { it.setBlocks(producers) }

    override fun equals(other: Any?): Boolean = other is TurnDiffFile && other.path == path

    override fun hashCode(): Int = path.hashCode()
}
