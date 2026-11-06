package dev.ukitomato.closta.platforms.intellij.chat

import com.intellij.diff.comparison.ComparisonManager
import com.intellij.diff.comparison.ComparisonPolicy
import com.intellij.diff.comparison.DiffTooBigException
import com.intellij.history.Label
import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.progress.DumbProgressIndicator
import com.intellij.openapi.roots.ProjectFileIndex
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFile
import dev.ukitomato.closta.presenter.view.ChangedFile
import java.io.IOException
import java.nio.charset.Charset

// A file against its content at a Local History label: what TurnChanges finds and writes back. The rules (what was
// made, what can be reverted, what is counted) are TurnChangeRules'. Never logs a path or what is in a file.

private val LOG = logger<TurnChanges>()

/** Past this a file is not read to be compared: it is said to have changed. */
private const val READ_MAX_BYTES = 16L shl 20

/** What the label and the IDE know of a path, read in one short read action ([labelled]); no file is read in it. */
internal class Labelled(
    val path: String,
    /** Its content at the label; null when the label has none (or it was a folder). */
    val then: ByteArray?,
    val wasFolder: Boolean,
    /** It now, null when it is gone; an excluded one ([excluded]) is not listed. */
    val file: VirtualFile?,
    val excluded: Boolean,
)

/** [path] at [label] and as the IDE has it now. In a read action: it reads Local History and the project's index. */
internal fun labelled(
    label: Label,
    path: String,
    index: ProjectFileIndex,
): Labelled {
    val atLabel = label.getByteContent(path)
    val file = LocalFileSystem.getInstance().findFileByPath(path)?.takeIf { !it.isDirectory }
    return Labelled(
        path,
        atLabel?.takeUnless { it.isDirectory }?.bytes,
        wasFolder = atLabel?.isDirectory == true,
        file = file,
        excluded = file != null && index.isExcluded(file),
    )
}

/**
 * [known] against the file now; [createdInTurn] from the turn's first events. Null: nothing to list. Outside any read
 * action: it reads the file from disk and compares its lines, which can take long on a slow disk.
 */
internal fun changeOf(
    known: Labelled,
    createdInTurn: Boolean,
): ChangedFile? {
    val then = known.then
    val file = known.file
    val now = file?.takeIf { it.length <= READ_MAX_BYTES }?.let(::bytesOf)
    val same = then != null && now != null && then.contentEquals(now)
    val verdict = verdictOf(createdInTurn, atLabel = then != null, now = file != null, same = same)
    if (known.wasFolder || known.excluded || verdict == null) return null
    val binary = file?.fileType?.isBinary == true
    val size = maxOf(then?.size?.toLong() ?: 0, file?.length ?: 0)
    val counted = countsLines(size, binary) && (verdict.created || then != null) && (verdict.deleted || now != null)
    val (added, removed) = if (counted) lineCounts(then, now, file?.charset ?: Charsets.UTF_8) else 0 to 0
    return ChangedFile(known.path, added, removed, verdict.created, verdict.deleted, verdict.revertable, counted)
}

private fun bytesOf(file: VirtualFile): ByteArray? =
    try {
        file.contentsToByteArray()
    } catch (_: IOException) {
        null
    }

/** The lines added and removed from [then] to [now], by the IDE's own line comparison. */
private fun lineCounts(
    then: ByteArray?,
    now: ByteArray?,
    charset: Charset,
): Pair<Int, Int> {
    val before = then?.toString(charset) ?: ""
    val after = now?.toString(charset) ?: ""
    return try {
        val fragments =
            ComparisonManager
                .getInstance()
                .compareLines(before, after, ComparisonPolicy.DEFAULT, DumbProgressIndicator.INSTANCE)
        fragments.sumOf { it.endLine2 - it.startLine2 } to fragments.sumOf { it.endLine1 - it.startLine1 }
    } catch (_: DiffTooBigException) {
        0 to 0
    }
}

/**
 * Puts [changed] back as it was at [label] (in a write action), as [revertAction] says: a file the turn made is
 * deleted, one whose content the label holds is written back (recreated when the turn deleted it), and one whose
 * content the label lacks is left alone.
 */
internal fun revertTo(
    label: Label,
    changed: ChangedFile,
    requestor: Any,
) {
    try {
        val file = LocalFileSystem.getInstance().refreshAndFindFileByPath(changed.path)
        when (revertAction(changed)) {
            RevertAction.DELETE -> file?.delete(requestor)
            RevertAction.SKIP -> Unit
            RevertAction.RESTORE -> {
                val bytes = label.getByteContent(changed.path)?.bytes ?: return
                if (file != null) {
                    file.setBinaryContent(bytes)
                } else {
                    val parent = VfsUtil.createDirectoryIfMissing(changed.path.substringBeforeLast('/'))
                    parent?.createChildData(requestor, changed.path.substringAfterLast('/'))?.setBinaryContent(bytes)
                }
            }
        }
    } catch (failure: IOException) {
        LOG.warn("a file could not be reverted (${failure.javaClass.name})")
    }
}
