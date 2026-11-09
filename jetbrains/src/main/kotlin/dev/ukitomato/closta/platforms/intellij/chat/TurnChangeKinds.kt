package dev.ukitomato.closta.platforms.intellij.chat

import dev.ukitomato.closta.presenter.view.ChangedFile
import dev.ukitomato.closta.presenter.view.Transcript
import java.util.concurrent.ConcurrentHashMap

// What a turn's changes are, free of com.intellij so the fast suite holds it: which files the turn made, which can be
// reverted, how many are looked at and counted, and when a later message's turn starts.

/** The first kind of change the VFS reported for a path during a turn. */
enum class PathEvent {
    CREATED,
    OTHER,
}

/**
 * The paths a turn saw change, each with the first event it saw for it. Only a path whose first event was its creation
 * was made by the turn — what Local History holds (or does not) at the label never says so.
 */
class FirstEvents {
    private val first = ConcurrentHashMap<String, PathEvent>()

    fun saw(
        path: String,
        event: PathEvent,
    ) {
        first.putIfAbsent(path, event)
    }

    fun createdInTurn(path: String): Boolean = first[path] == PathEvent.CREATED

    fun paths(): Set<String> = first.keys.toSet()
}

/** What a changed file is for the turn's list. */
data class FileVerdict(
    val created: Boolean,
    val deleted: Boolean,
    val revertable: Boolean,
)

/**
 * A path the turn saw change: [createdInTurn] from [FirstEvents], [atLabel] whether Local History has its content at
 * the label, [now] whether it is there now, [same] whether its content is the label's. Null when there is nothing to
 * list (it came back as it was, or the turn made it and removed it again). A file the turn did not make and whose
 * content the label lacks (Local History keeps none for big, ignored or outside files) is listed but not reverted.
 */
fun verdictOf(
    createdInTurn: Boolean,
    atLabel: Boolean,
    now: Boolean,
    same: Boolean,
): FileVerdict? =
    when {
        createdInTurn -> if (now) FileVerdict(created = true, deleted = false, revertable = true) else null
        atLabel && now && same -> null
        else -> FileVerdict(created = false, deleted = !now, revertable = atLabel)
    }

enum class RevertAction {
    /** The turn made it: delete it. */
    DELETE,

    /** Write the label's content back (recreating a file the turn deleted). */
    RESTORE,

    /** Leave it: there is nothing at the label to put back. */
    SKIP,
}

fun revertAction(file: ChangedFile): RevertAction =
    when {
        file.created -> RevertAction.DELETE
        !file.revertable -> RevertAction.SKIP
        else -> RevertAction.RESTORE
    }

/** The most files a turn compares with the label; past it the end line and the bar say "N or more files". */
const val LOOK_LIMIT = 500

/** The paths to compare, in order, at most [LOOK_LIMIT]; and whether there were more. */
fun toCompare(paths: Collection<String>): Pair<List<String>, Boolean> {
    val sorted = paths.sorted()
    return sorted.take(LOOK_LIMIT) to (sorted.size > LOOK_LIMIT)
}

/** The biggest file whose lines are counted; a bigger or binary file is only said to have changed. */
const val COUNT_MAX_BYTES = 1 shl 20

fun countsLines(
    size: Long,
    binary: Boolean,
): Boolean = !binary && size <= COUNT_MAX_BYTES

/** The asks of [waiting] whose turn the CLI has started (its `command_uuid` is the uuid the ask was sent with). */
fun startedAsks(
    transcript: Transcript,
    waiting: Set<String>,
): List<String> =
    waiting.filter { ask ->
        val uuid = transcript.userUuids[ask]
        uuid != null && uuid in transcript.routing.turns
    }
