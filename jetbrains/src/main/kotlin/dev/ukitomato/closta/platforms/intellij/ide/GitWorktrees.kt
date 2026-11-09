package dev.ukitomato.closta.platforms.intellij.ide

import dev.ukitomato.closta.core.interfaces.IdeFailureKind
import dev.ukitomato.closta.core.interfaces.IdeResult
import dev.ukitomato.closta.core.interfaces.WorktreeCreated
import dev.ukitomato.closta.core.interfaces.WorktreeRequest
import dev.ukitomato.closta.core.interfaces.Worktrees
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.IOException
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ExecutionException
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException

/**
 * Creates a worktree with the real `git`. Free of `com.intellij`: it only runs `git` through
 * [ProcessBuilder], so `src/test` measures it against a real repository.
 *
 * The worktree goes to `<repository root>/.claude/worktrees/<name>` on a new branch — the place the CLI's `--worktree`
 * and `EnterWorktree` accept, so a session can later move there. It does not point any session at it. A name
 * is letters, digits, `-`, `_` and `.` (starting with a letter or digit, at most 64 characters), so it cannot become
 * an option or leave the directory; a place or a branch that already exists is refused and nothing is made.
 *
 * The place and its parent are resolved through symbolic links and must stay under the repository root (resolved the
 * same way), else nothing is made (`OUTSIDE_PROJECT`). Of git's output a message carries only its `fatal:` / `error:`
 * lines, and no environment value is printed. A `git` that outlives the deadline is killed.
 */
class GitWorktrees(
    private val projectRoot: String,
    private val git: String = "git",
    private val timeoutSeconds: Long = TIMEOUT_SECONDS,
) : Worktrees {
    override suspend fun create(request: WorktreeRequest): IdeResult<WorktreeCreated> =
        withContext(Dispatchers.IO) { createBlocking(request) }

    private fun createBlocking(request: WorktreeRequest): IdeResult<WorktreeCreated> {
        val branch = request.branch ?: request.name
        return when {
            !NAME.matches(request.name) -> failed(IdeFailureKind.INVALID_ARGUMENT, "the worktree name is not valid")
            !BRANCH.matches(branch) -> failed(IdeFailureKind.INVALID_ARGUMENT, "the branch name is not valid")
            else ->
                try {
                    createIn(request.name, branch)
                } catch (
                    @Suppress("SwallowedException") missing: IOException,
                ) {
                    failed(IdeFailureKind.UNAVAILABLE, "git could not be run")
                }
        }
    }

    @Suppress("ReturnCount") // each refusal is one early return
    private fun createIn(
        name: String,
        branch: String,
    ): IdeResult<WorktreeCreated> {
        val top = run(projectRoot, "rev-parse", "--show-toplevel")
        if (top.code == TIMED_OUT || top.code == BROKEN) {
            return failed(IdeFailureKind.UNAVAILABLE, top.message)
        }
        if (top.code != 0 || top.firstLine.isEmpty()) {
            return failed(IdeFailureKind.UNAVAILABLE, "the project is not in a git repository")
        }
        val root = top.firstLine
        val parent = File(root, ".claude/worktrees")
        val place = File(parent, name)
        return when {
            !(inside(root, parent) && inside(root, place)) ->
                failed(IdeFailureKind.OUTSIDE_PROJECT, "the worktree place is not inside the repository")
            place.exists() -> failed(IdeFailureKind.ALREADY_EXISTS, "the worktree place already exists")
            run(root, "show-ref", "--verify", "--quiet", "refs/heads/$branch").code == 0 ->
                failed(IdeFailureKind.ALREADY_EXISTS, "the branch already exists")
            else -> add(root, place.path, branch)
        }
    }

    /** Whether [target], with every symbolic link resolved, is under [root] resolved the same way. */
    private fun inside(
        root: String,
        target: File,
    ): Boolean =
        try {
            File(target.canonicalPath).toPath().startsWith(File(root).canonicalFile.toPath())
        } catch (
            @Suppress("SwallowedException") unreadable: IOException,
        ) {
            false
        }

    private fun add(
        root: String,
        place: String,
        branch: String,
    ): IdeResult<WorktreeCreated> {
        val added = run(root, "worktree", "add", "-b", branch, place)
        if (added.code != 0) {
            return failed(IdeFailureKind.FAILED, "git worktree add failed: ${added.message}")
        }
        return IdeResult.Ok(
            WorktreeCreated(
                path = place,
                branch = branch,
                undoable = false,
                removeCommands =
                    listOf(
                        "git -C ${quote(root)} worktree remove ${quote(place)}",
                        "git -C ${quote(root)} branch -D ${quote(branch)}",
                    ),
            ),
        )
    }

    /** [message] is only git's own `fatal:` / `error:` lines (at most [MESSAGE_MAX] characters), else a fixed text. */
    private class Output(
        val code: Int,
        val text: String,
    ) {
        val firstLine: String get() =
            text
                .lineSequence()
                .firstOrNull()
                .orEmpty()
                .trim()
        val message: String
            get() =
                when (code) {
                    TIMED_OUT -> "git did not finish in time"
                    BROKEN -> "git output could not be read"
                    else ->
                        text
                            .lineSequence()
                            .map { it.trim() }
                            .filter { it.startsWith("fatal:") || it.startsWith("error:") }
                            .joinToString("; ")
                            .take(MESSAGE_MAX)
                            .ifEmpty { "git reported an error" }
                }
    }

    private fun run(
        dir: String,
        vararg args: String,
    ): Output {
        val builder =
            ProcessBuilder(listOf(git) + GUARD + listOf("-C", dir) + args)
                .redirectErrorStream(true)
                .apply { environment()["GIT_TERMINAL_PROMPT"] = "0" }
        val process = builder.start()
        try {
            process.outputStream.close()
            val text = CompletableFuture.supplyAsync { process.inputStream.bufferedReader().readText() }
            return try {
                val output = text.get(timeoutSeconds, TimeUnit.SECONDS)
                if (process.waitFor(timeoutSeconds, TimeUnit.SECONDS)) {
                    Output(process.exitValue(), output)
                } else {
                    Output(TIMED_OUT, "")
                }
            } catch (
                @Suppress("SwallowedException") late: TimeoutException,
            ) {
                Output(TIMED_OUT, "")
            } catch (
                @Suppress("SwallowedException") unreadable: ExecutionException,
            ) {
                Output(BROKEN, "")
            }
        } finally {
            if (process.isAlive) process.destroyForcibly()
        }
    }

    private fun failed(
        kind: IdeFailureKind,
        message: String,
    ) = IdeResult.Failed(kind, message)

    private fun quote(text: String): String = if (text.any { it.isWhitespace() }) "\"$text\"" else text

    private companion object {
        /**
         * Every call runs with hooks and fsmonitor turned off. `/dev/null` is not a directory, so git finds no hook in
         * it; on Windows it is just a path that does not exist, which disables hooks the same way. Smudge, clean and
         * process filters from a copied `.git/config` are not turned off: the trust check before a worktree chat is
         * created is what keeps an untrusted repository from running anything.
         */
        val GUARD = listOf("-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false")
        const val TIMEOUT_SECONDS = 30L
        const val MESSAGE_MAX = 200
        const val TIMED_OUT = -1
        const val BROKEN = -2
        val NAME = Regex("[A-Za-z0-9][A-Za-z0-9._-]{0,63}")
        val BRANCH = Regex("[A-Za-z0-9][A-Za-z0-9._/-]{0,127}")
    }
}
