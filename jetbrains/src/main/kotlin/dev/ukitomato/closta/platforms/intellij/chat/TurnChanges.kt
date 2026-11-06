package dev.ukitomato.closta.platforms.intellij.chat

import com.intellij.diff.editor.DiffEditorTabFilesManager
import com.intellij.diff.tools.combined.CombinedBlockProducer
import com.intellij.diff.tools.combined.CombinedDiffVirtualFileImpl
import com.intellij.diff.tools.combined.CombinedPathBlockId
import com.intellij.history.Label
import com.intellij.history.LocalHistory
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.EDT
import com.intellij.openapi.application.readAction
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.ProjectFileIndex
import com.intellij.openapi.util.io.FileUtil
import com.intellij.openapi.vcs.changes.Change
import com.intellij.openapi.vcs.changes.CurrentContentRevision
import com.intellij.openapi.vcs.changes.SimpleContentRevision
import com.intellij.openapi.vcs.changes.actions.diff.ChangeDiffRequestProducer
import com.intellij.openapi.vcs.changes.actions.diff.ShowDiffAction
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VirtualFileManager
import com.intellij.openapi.vfs.newvfs.BulkFileListener
import com.intellij.openapi.vfs.newvfs.RefreshQueue
import com.intellij.openapi.vfs.newvfs.events.VFileCreateEvent
import com.intellij.openapi.vfs.newvfs.events.VFileEvent
import com.intellij.openapi.vfs.newvfs.events.VFileMoveEvent
import com.intellij.openapi.vfs.newvfs.events.VFilePropertyChangeEvent
import com.intellij.vcsUtil.VcsUtil
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.presenter.view.ChangedFile
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import java.util.concurrent.ConcurrentHashMap
import kotlin.coroutines.resume

/**
 * What each turn changed on disk, found through the IDE's Local History: a system label
 * when the user message is sent, the files the VFS saw change under the session's folder meanwhile, and at the turn's
 * end each of those compared with its content at the label. So Bash's and MCP's changes are found too, and so are the
 * user's own edits made during the turn (Local History cannot tell them apart; the bar says so before reverting).
 *
 * Review shows the label's content against the file now in one combined diff; reverting writes the label's content
 * back to those files only (a file the turn made is deleted). Never logs a path or what is in a file.
 */
@Service(Service.Level.PROJECT)
class TurnChanges(
    private val project: Project,
) : Disposable {
    private class Turn(
        val root: String,
        val label: Label,
    ) {
        val events = FirstEvents()

        @Volatile
        var files: List<ChangedFile> = emptyList()
    }

    private val open = ConcurrentHashMap<String, Turn>()
    private val ended = ConcurrentHashMap<String, Turn>()

    /** The asks whose changes the user kept or reverted: the bar no longer shows them. */
    val settled: MutableSet<String> = ConcurrentHashMap.newKeySet()

    init {
        project.messageBus.connect(this).subscribe(
            VirtualFileManager.VFS_CHANGES,
            object : BulkFileListener {
                override fun after(events: List<VFileEvent>) {
                    if (open.isEmpty()) return
                    for (event in events) eventsOf(event).forEach { (path, kind) -> saw(path, kind) }
                }
            },
        )
    }

    private fun saw(
        path: String,
        kind: PathEvent,
    ) {
        for (turn in open.values) if (collects(turn.root, path)) turn.events.saw(path, kind)
    }

    /**
     * Puts the label for the user message [askKey] down before it is sent, and starts collecting what changes under
     * [root]. The documents are saved first, so what the user typed before is not counted as the turn's.
     */
    suspend fun begin(
        askKey: String,
        root: String,
    ) {
        val label =
            withContext(Dispatchers.EDT) {
                FileDocumentManager.getInstance().saveAllDocuments()
                LocalHistory.getInstance().putSystemLabel(project, "Closta: $askKey")
            }
        open[askKey] = Turn(FileUtil.toSystemIndependentName(root).trimEnd('/'), label)
    }

    /** Forgets [askKey]'s turn without looking (the message was never sent). */
    fun drop(askKey: String) {
        open.remove(askKey)
    }

    /**
     * Ends [askKey]'s turn: the folder is refreshed first (the CLI writes to disk behind the IDE's back), for
     * [REFRESH_WAIT_MS] at most, then each file seen changing is compared with its content at the label. Files that
     * came back as they were are left out. It always ends: a file that cannot be compared is listed as changed,
     * uncounted, and not put back by Revert All.
     */
    suspend fun end(askKey: String): FoundChanges {
        val turn = open[askKey] ?: return FoundChanges(emptyList(), more = false)
        if (withTimeoutOrNull(REFRESH_WAIT_MS) { refresh(turn.root) } == null) {
            thisLogger().info("the folder's refresh took over ${REFRESH_WAIT_MS}ms; comparing what was seen")
        }
        open.remove(askKey)
        val index = ProjectFileIndex.getInstance(project)
        val (paths, more) = toCompare(turn.events.paths())

        // A read action per file, only for what Local History and the index know: a write the user makes meanwhile (a
        // key typed in an editor) waits for one file's lookup at most. The file is read and compared outside it.
        suspend fun compared(path: String): ChangedFile? {
            val created = turn.events.createdInTurn(path)
            return try {
                changeOf(readAction { labelled(turn.label, path, index) }, created)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (
                @Suppress("TooGenericExceptionCaught") failure: Exception,
            ) {
                thisLogger().warn("a file could not be compared (${failure.javaClass.name})")
                ChangedFile(path, 0, 0, created, deleted = false, revertable = false, counted = false)
            }
        }
        val files = paths.mapNotNull { compared(it) }
        turn.files = files
        ended[askKey] = turn
        return FoundChanges(files, more)
    }

    // The folder's files the file watcher saw change are refreshed; a folder it does not watch is looked at whole by
    // the refresh itself. Nothing is marked dirty here: on a slow disk (a WSL folder opened from Windows) reading the
    // whole tree again took long enough that the turn's end never showed its files.
    private suspend fun refresh(root: String) {
        val dir = LocalFileSystem.getInstance().findFileByPath(root) ?: return
        suspendCancellableCoroutine { done ->
            RefreshQueue.getInstance().refresh(true, true, { if (done.isActive) done.resume(Unit) }, dir)
        }
    }

    /** Shows what [askKey]'s turn changed, the label's content against the file now, in one combined diff (EDT). */
    fun review(askKey: String) {
        val turn = ended[askKey] ?: return
        // "New" is what the turn made (its first event was the creation), never "Local History has no content"; a file
        // whose content at the label is unknown has no before side to show, so it is not in the diff.
        val changes =
            turn.files.filter { it.created || it.revertable }.mapNotNull { changed ->
                val path = VcsUtil.getFilePath(changed.path, false)
                val before =
                    if (changed.created) {
                        null
                    } else {
                        val bytes = turn.label.getByteContent(changed.path)?.bytes ?: return@mapNotNull null
                        SimpleContentRevision(bytes.toString(path.charset), path, "Closta")
                    }
                Change(before, if (changed.deleted) null else CurrentContentRevision(path))
            }
        if (changes.isEmpty()) return
        try {
            showCombined(changes)
        } catch (failure: LinkageError) {
            // The combined diff is still experimental in the platform; the plain diff of a list of changes is not.
            thisLogger().warn("combined diff unavailable (${failure.javaClass.name})")
            ShowDiffAction.showDiffForChange(project, changes)
        }
    }

    // As the IDE's own "Show Combined Diff" does it (its action is internal to the platform).
    private fun showCombined(changes: List<Change>) {
        val producers =
            changes.mapNotNull { change ->
                val producer = ChangeDiffRequestProducer.create(project, change) ?: return@mapNotNull null
                CombinedBlockProducer(CombinedPathBlockId(producer.filePath, change.fileStatus), producer)
            }
        val file = CombinedDiffVirtualFileImpl(project, producers, ClostaBundle.message("chat.changes.diffTitle"))
        DiffEditorTabFilesManager.getInstance(project).showDiffFile(file, true)
    }

    /** Writes the label's content back to the files [askKey]'s turn changed, deleting the ones it made (EDT). */
    fun revertAll(askKey: String) {
        val turn = ended[askKey] ?: return
        FileDocumentManager.getInstance().saveAllDocuments()
        val name = ClostaBundle.message("chat.changes.revertCommand")
        WriteCommandAction.runWriteCommandAction(project, name, null, {
            val action = LocalHistory.getInstance().startAction(name)
            try {
                turn.files.forEach { revertTo(turn.label, it, this) }
            } finally {
                action.finish()
            }
        })
        settled += askKey
    }

    /** The user keeps [askKey]'s changes: the bar goes. */
    fun keep(askKey: String) {
        settled += askKey
    }

    override fun dispose() {
        open.clear()
        ended.clear()
    }
}

/** What a turn found: the files, and whether more changed than it looked at. */
data class FoundChanges(
    val files: List<ChangedFile>,
    val more: Boolean,
)

/** How long a turn's end waits for the folder's refresh before it compares what it has seen change. */
private const val REFRESH_WAIT_MS = 10_000L

private fun eventsOf(event: VFileEvent): List<Pair<String, PathEvent>> =
    when (event) {
        is VFileCreateEvent -> listOf(event.path to PathEvent.CREATED)
        is VFileMoveEvent -> listOf(event.oldPath to PathEvent.OTHER, event.newPath to PathEvent.OTHER)
        is VFilePropertyChangeEvent if event.isRename ->
            listOf(event.oldPath to PathEvent.OTHER, event.newPath to PathEvent.OTHER)
        else -> listOf(event.path to PathEvent.OTHER)
    }
