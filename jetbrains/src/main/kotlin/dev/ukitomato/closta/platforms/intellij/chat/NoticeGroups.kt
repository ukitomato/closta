package dev.ukitomato.closta.platforms.intellij.chat

/** The notification groups declared in plugin.xml: each is named from the bundle, so each can be turned off alone. */
object NoticeGroups {
    /** What waits for an answer; stays until it is answered. */
    const val WAITING = "Closta.Waiting"

    /** A reply that finished. */
    const val FINISHED = "Closta.Finished"

    /** A conversation still running after its last tab closed. */
    const val RUNNING = "Closta.Running"

    /** A worktree's failure, and a worktree made by the IDE bridge. */
    const val WORKTREE = "Closta.Worktree"

    val ALL: List<String> = listOf(WAITING, FINISHED, RUNNING, WORKTREE)
}
