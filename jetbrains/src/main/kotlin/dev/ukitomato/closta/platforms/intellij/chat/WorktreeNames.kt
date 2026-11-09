package dev.ukitomato.closta.platforms.intellij.chat

import dev.ukitomato.closta.core.interfaces.IdeFailureKind
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

// The names and words of New Conversation in a Worktree, free of `com.intellij`.

private val STAMP: DateTimeFormatter = DateTimeFormatter.ofPattern("uuuuMMdd-HHmm")

/**
 * The name of a new worktree made at [now]: `closta-<date>-<time>`, then `-2`, `-3`… while the name is in [taken]. It
 * fits GitWorktrees' rule (a letter or digit first, then letters, digits, `.`, `_`, `-`, at most 64), so the
 * directory and the branch can both be called by it.
 */
fun worktreeName(
    now: LocalDateTime,
    taken: Set<String>,
): String {
    val base = "closta-${now.format(STAMP)}"
    return generateSequence(1) { it + 1 }.map { if (it == 1) base else "$base-$it" }.first { it !in taken }
}

/** The title of a conversation started in the worktree of [branch]. */
fun worktreeTitle(branch: String): String = ClostaBundle.message("chat.worktree.title", branch)

/**
 * Why no worktree was made, by the kind of GitWorktrees' refusal. Its own message is not shown: git's `fatal:` lines
 * may name a path.
 */
fun worktreeRefusal(kind: IdeFailureKind): String =
    ClostaBundle.message(
        "chat.worktree.refused",
        when (kind) {
            IdeFailureKind.INVALID_ARGUMENT -> ClostaBundle.message("chat.worktree.refused.invalidName")
            IdeFailureKind.ALREADY_EXISTS -> ClostaBundle.message("chat.worktree.refused.exists")
            IdeFailureKind.OUTSIDE_PROJECT -> ClostaBundle.message("chat.worktree.refused.outside")
            IdeFailureKind.UNAVAILABLE -> ClostaBundle.message("chat.worktree.refused.unavailable")
            else -> ClostaBundle.message("chat.worktree.refused.failed")
        },
    )
