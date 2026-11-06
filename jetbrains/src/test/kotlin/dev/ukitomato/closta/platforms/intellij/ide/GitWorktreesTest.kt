package dev.ukitomato.closta.platforms.intellij.ide

import dev.ukitomato.closta.core.interfaces.IdeFailureKind
import dev.ukitomato.closta.core.interfaces.IdeResult
import dev.ukitomato.closta.core.interfaces.WorktreeCreated
import dev.ukitomato.closta.core.interfaces.WorktreeRequest
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.io.File
import java.nio.file.Files
import java.util.concurrent.TimeUnit

/**
 * The machine part of making a worktree: the real `git`, against a repository made in a temporary directory. A machine
 * without `git` fails here rather than skipping, so a green run means the worktree was really made.
 */
class GitWorktreesTest {
    @TempDir
    lateinit var dir: File

    private fun git(
        cwd: File,
        vararg args: String,
    ): String {
        val process =
            ProcessBuilder(
                listOf("git", "-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false") +
                    args,
            ).directory(cwd)
                .redirectErrorStream(true)
                .start()
        val out = process.inputStream.bufferedReader().readText()
        assertTrue(process.waitFor(30, TimeUnit.SECONDS))
        assertEquals(0, process.exitValue(), "git ${args.toList()} failed: $out")
        return out
    }

    private fun repo(): File {
        val root = File(dir, "repo").apply { mkdirs() }
        git(root, "init", "-q")
        File(root, "a.txt").writeText("a")
        git(root, "add", "a.txt")
        git(root, "commit", "-q", "-m", "init")
        return root
    }

    private fun create(
        root: File,
        name: String,
        branch: String? = null,
    ) = runBlocking { GitWorktrees(root.path).create(WorktreeRequest(name, branch)) }

    @Test
    fun `git is on this machine`() {
        git(dir, "--version")
    }

    @Test
    fun `a worktree is made under dot-claude-worktrees on a new branch and git lists it`() {
        val root = repo()
        val made = create(root, "feat-1") as IdeResult.Ok<WorktreeCreated>
        val top = git(root, "rev-parse", "--show-toplevel").trim()
        assertEquals(File(File(top, ".claude/worktrees"), "feat-1").path, made.value.path)
        assertEquals("feat-1", made.value.branch)
        assertTrue(File(made.value.path, "a.txt").isFile)
        val listing = git(root, "worktree", "list", "--porcelain")
        assertTrue(listing.contains(made.value.path), listing)
        assertTrue(listing.contains("refs/heads/feat-1"), listing)
    }

    @Test
    fun `a branch name of its own is used, and the result cannot be undone by the IDE and says how`() {
        val root = repo()
        val made = (create(root, "w", "topic/w") as IdeResult.Ok<WorktreeCreated>).value
        assertEquals("topic/w", made.branch)
        assertFalse(made.undoable)
        val top = git(root, "rev-parse", "--show-toplevel").trim()
        assertEquals(
            listOf("git -C $top worktree remove ${made.path}", "git -C $top branch -D topic/w"),
            made.removeCommands,
        )
        assertTrue(git(root, "worktree", "list", "--porcelain").contains("refs/heads/topic/w"))
    }

    @Test
    fun `the commands in the result really remove it`() {
        val root = repo()
        val made = (create(root, "gone") as IdeResult.Ok<WorktreeCreated>).value
        // Run from somewhere else: the commands carry their own `-C <root>`.
        made.removeCommands.forEach { command -> git(dir, *command.removePrefix("git ").split(" ").toTypedArray()) }
        assertFalse(File(made.path).exists())
        assertFalse(git(root, "branch", "--list", "gone").contains("gone"))
    }

    @Test
    fun `a second creation with the same name fails and adds nothing`() {
        val root = repo()
        create(root, "twice")
        val before = git(root, "worktree", "list", "--porcelain")
        val branches = git(root, "branch", "--list")
        val again = create(root, "twice") as IdeResult.Failed
        assertEquals(IdeFailureKind.ALREADY_EXISTS, again.kind)
        assertEquals(before, git(root, "worktree", "list", "--porcelain"))
        assertEquals(branches, git(root, "branch", "--list"))
    }

    @Test
    fun `an existing branch is refused and no directory is left behind`() {
        val root = repo()
        git(root, "branch", "taken")
        val failed = create(root, "fresh", "taken") as IdeResult.Failed
        assertEquals(IdeFailureKind.ALREADY_EXISTS, failed.kind)
        val top = git(root, "rev-parse", "--show-toplevel").trim()
        assertFalse(File(top, ".claude/worktrees/fresh").exists())
    }

    @Test
    fun `names that are not letters, digits, dash, underscore and dot, or that start badly, are refused`() {
        val root = repo()
        listOf("", "-x", ".x", "a b", "a/b", "../x", "a;b", "x".repeat(65)).forEach { name ->
            val failed = create(root, name) as IdeResult.Failed
            assertEquals(IdeFailureKind.INVALID_ARGUMENT, failed.kind, "name '$name'")
        }
        assertEquals(IdeFailureKind.INVALID_ARGUMENT, (create(root, "ok", "-bad") as IdeResult.Failed).kind)
        assertEquals(1, git(root, "worktree", "list", "--porcelain").lines().count { it.startsWith("worktree ") })
    }

    @Test
    fun `a directory that is not in a repository is unavailable`() {
        val plain = File(dir, "plain").apply { mkdirs() }
        assertEquals(IdeFailureKind.UNAVAILABLE, (create(plain, "x") as IdeResult.Failed).kind)
    }

    @Test
    fun `the new worktree shows in git status of the original tree as an untracked dot-claude`() {
        val root = repo()
        create(root, "seen")
        val status = git(root, "status", "--porcelain").lines().filter { it.isNotBlank() }
        assertEquals(listOf("?? .claude/"), status)
    }

    private fun script(
        name: String,
        body: String,
    ): String {
        val file = File(dir, name)
        file.writeText("#!/bin/sh\n$body\n")
        assertTrue(file.setExecutable(true))
        return file.path
    }

    private fun createWith(
        root: File,
        git: String,
        name: String,
    ) = runBlocking { GitWorktrees(root.path, git).create(WorktreeRequest(name)) } as IdeResult.Failed

    @Test
    fun `a place whose parent is a symbolic link out of the repository is refused and nothing is made`() {
        val root = repo()
        val outside = File(dir, "outside").apply { mkdirs() }
        File(root, ".claude").mkdirs()
        Files.createSymbolicLink(File(root, ".claude/worktrees").toPath(), outside.toPath())
        val before = git(root, "worktree", "list", "--porcelain")
        val failed = create(root, "escape") as IdeResult.Failed
        assertEquals(IdeFailureKind.OUTSIDE_PROJECT, failed.kind)
        assertEquals(0, outside.list()!!.size, "nothing is written outside")
        assertEquals(before, git(root, "worktree", "list", "--porcelain"))
        assertEquals("", git(root, "branch", "--list", "escape").trim())
    }

    @Test
    fun `a place that is itself a symbolic link out of the repository is refused`() {
        val root = repo()
        val outside = File(dir, "outside2").apply { mkdirs() }
        File(root, ".claude/worktrees").mkdirs()
        Files.createSymbolicLink(File(root, ".claude/worktrees/link").toPath(), outside.toPath())
        val failed = create(root, "link") as IdeResult.Failed
        assertTrue(failed.kind == IdeFailureKind.OUTSIDE_PROJECT || failed.kind == IdeFailureKind.ALREADY_EXISTS)
        assertEquals(0, outside.list()!!.size)
    }

    @Test
    fun `a failure message carries only the fatal or error lines of git, at most 200 characters`() {
        val root = repo()
        val failed = create(root, "bad", "a..b") as IdeResult.Failed
        assertEquals(IdeFailureKind.FAILED, failed.kind)
        assertTrue(failed.message.startsWith("git worktree add failed: fatal:"), failed.message)
        assertTrue(failed.message.length <= "git worktree add failed: ".length + 200, failed.message)
        val top = git(root, "rev-parse", "--show-toplevel").trim()
        val noisy =
            script(
                "noisy-git",
                "case \"\$*\" in *rev-parse*) echo '$top';; *show-ref*) exit 1;; " +
                    "*) echo 'hint: SECRET-VALUE'; echo 'error: first'; echo 'more detail'; " +
                    "echo 'fatal: ' \"$(printf 'x%.0s' \$(seq 1 300))\"; exit 1;; esac",
            )
        val noisyFailed = createWith(root, noisy, "n")
        assertFalse(noisyFailed.message.contains("SECRET-VALUE"), noisyFailed.message)
        assertFalse(noisyFailed.message.contains("more detail"), noisyFailed.message)
        assertTrue(
            noisyFailed.message.startsWith("git worktree add failed: error: first; fatal:"),
            noisyFailed.message,
        )
        assertEquals("git worktree add failed: ".length + 200, noisyFailed.message.length)
        val silent =
            script(
                "silent-git",
                "case \"\$*\" in *rev-parse*) echo '$top';; *show-ref*) exit 1;; *) echo 'hint: x'; exit 1;; esac",
            )
        val silentFailed = createWith(root, silent, "s")
        assertEquals("git worktree add failed: git reported an error", silentFailed.message)
    }

    @Test
    fun `a git that does not finish in time is a failure value and is killed`() {
        val root = repo()
        val slow = script("slow-git", "exec sleep 30")
        val started = System.nanoTime()
        val failed = runBlocking { GitWorktrees(root.path, slow, timeoutSeconds = 1).create(WorktreeRequest("t")) }
        failed as IdeResult.Failed
        assertEquals(IdeFailureKind.UNAVAILABLE, failed.kind)
        assertEquals("git did not finish in time", failed.message)
        assertTrue(TimeUnit.NANOSECONDS.toSeconds(System.nanoTime() - started) < 10)
    }
}
