package dev.ukitomato.closta.platforms.intellij.chat

import dev.ukitomato.closta.platforms.intellij.session.SessionStatus

// The sessions that ran when their project closed, kept per project in the application's settings so the sessions list
// offers to resume them when the project opens again. Free of `com.intellij`.

/** An open session as its project closes: whether its CLI was alive, and how many messages its conversation has. */
data class OpenAtClose(
    val sessionId: String,
    val alive: Boolean,
    val messages: Int,
    /** Where it ran when not in the project's folder (a worktree), and its title: kept in the mark. */
    val workingDirectory: String? = null,
    val title: String? = null,
    /** The session's own id (its tab's) when a `/clear` made [sessionId], the conversation's, other than that. */
    val hostId: String? = null,
)

/**
 * The ids to keep as "was running" when a project closes: those kept before and not resumed since, and each open
 * session whose CLI was alive and had a conversation (one with nothing in it has nothing saved to resume).
 */
fun marksAtClose(
    kept: Map<String, WasRunningMark>,
    open: List<OpenAtClose>,
): Map<String, WasRunningMark> =
    kept +
        open.filter { it.alive && it.messages > 0 }.associate {
            it.sessionId to
                WasRunningMark(it.workingDirectory, it.title, it.hostId)
        }

/**
 * The conversation a tab resumes (null: a new one, nothing was said after its `/clear`), and the folder it ran in
 * (null: the project's).
 */
data class TabResume(
    val savedId: String?,
    val workingDirectory: String?,
)

/**
 * What the tab of the session [hostId], no longer open, resumes: the conversation it last showed, which a `/clear` made
 * other than [hostId]. That is the one in [cleared] (kept when the session stopped or its project closed), else the one
 * marked for it when its project last closed, else [hostId]. The folder is the table's, else its mark's.
 */
fun tabResume(
    hostId: String,
    cleared: Map<String, ClearedTab>,
    marks: Map<String, WasRunningMark>,
): TabResume {
    cleared[hostId]?.let { tab ->
        return TabResume(tab.resumeId, tab.workingDirectory ?: tab.resumeId?.let { marks[it]?.workingDirectory })
    }
    val saved = marks.entries.firstOrNull { it.value.hostId == hostId }?.key ?: hostId
    return TabResume(saved, marks[saved]?.workingDirectory)
}

/** The settings key of the marks of the project whose location hash is [locationHash]. */
fun wasRunningKey(locationHash: String): String = "closta.sessions.wasRunning.$locationHash"

/**
 * Whether an open session's CLI counts as alive when its project closes: anything but one that ended or failed on its
 * own. A session the IDE has already closed (its scope is cancelled as the project closes) was alive until then.
 */
fun aliveAtClose(status: SessionStatus): Boolean = status !is SessionStatus.Ended && status !is SessionStatus.Failed

/** The settings key of the cleared tabs of the project whose location hash is [locationHash]. */
fun clearedTabsKey(locationHash: String): String = "closta.sessions.clearedTabs.$locationHash"
