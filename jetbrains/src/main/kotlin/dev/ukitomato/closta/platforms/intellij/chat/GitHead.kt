package dev.ukitomato.closta.platforms.intellij.chat

import java.io.IOException
import java.nio.file.Files
import java.nio.file.Path

/**
 * The repository a conversation runs in and its branch, for the panel's header: read from `.git/HEAD` (a worktree's
 * `.git` file points at its own HEAD). Free of `com.intellij` and of a `git` process, so it is cheap on any thread.
 */
data class GitHead(
    val repository: String,
    val branch: String,
) {
    companion object {
        private const val SHORT_HASH = 7
        private const val REF = "ref: refs/heads/"
        private const val GITDIR = "gitdir:"

        fun of(directory: Path): GitHead? {
            var at: Path? = directory.toAbsolutePath().normalize()
            while (at != null) {
                val dotGit = at.resolve(".git")
                if (Files.exists(dotGit)) return read(at, dotGit)
                at = at.parent
            }
            return null
        }

        private fun read(
            top: Path,
            dotGit: Path,
        ): GitHead? =
            try {
                val gitDir =
                    if (Files.isDirectory(dotGit)) {
                        dotGit
                    } else {
                        val pointer = Files.readString(dotGit).trim()
                        if (!pointer.startsWith(GITDIR)) return null
                        top.resolve(pointer.removePrefix(GITDIR).trim())
                    }
                val head = Files.readString(gitDir.resolve("HEAD")).trim()
                val branch = if (head.startsWith(REF)) head.removePrefix(REF) else head.take(SHORT_HASH)
                GitHead(top.fileName?.toString() ?: top.toString(), branch)
            } catch (_: IOException) {
                null
            }
    }
}
