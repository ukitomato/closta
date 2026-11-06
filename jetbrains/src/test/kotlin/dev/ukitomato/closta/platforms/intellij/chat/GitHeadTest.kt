package dev.ukitomato.closta.platforms.intellij.chat

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Files
import java.nio.file.Path

class GitHeadTest {
    @TempDir
    lateinit var root: Path

    @Test
    fun branchOfARepository() {
        Files.createDirectories(root.resolve(".git"))
        Files.writeString(root.resolve(".git/HEAD"), "ref: refs/heads/chat-ui/checkpoint-1\n")
        val inside = Files.createDirectories(root.resolve("a/b"))
        assertEquals(GitHead(root.fileName.toString(), "chat-ui/checkpoint-1"), GitHead.of(inside))
    }

    @Test
    fun aWorktreePointsElsewhere() {
        val gitDir = Files.createDirectories(root.resolve("main/.git/worktrees/w1"))
        Files.writeString(gitDir.resolve("HEAD"), "ref: refs/heads/feature\n")
        val worktree = Files.createDirectories(root.resolve("w1"))
        Files.writeString(worktree.resolve(".git"), "gitdir: $gitDir\n")
        assertEquals(GitHead("w1", "feature"), GitHead.of(worktree))
    }

    @Test
    fun aDetachedHeadIsItsShortHash() {
        Files.createDirectories(root.resolve(".git"))
        Files.writeString(root.resolve(".git/HEAD"), "0123456789abcdef0123456789abcdef01234567\n")
        assertEquals("0123456", GitHead.of(root)?.branch)
    }

    @Test
    fun noRepository() {
        assertNull(GitHead.of(root.resolve("nowhere")))
    }
}
