package dev.ukitomato.closta.platforms.intellij.chat

import dev.ukitomato.closta.core.interfaces.IdeFailureKind
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.LocalDateTime

class WorktreeNamesTest {
    private val at = LocalDateTime.of(2026, 11, 4, 3, 12, 45)

    /** GitWorktrees' rule for a name (its NAME): a letter or digit first, then those and `._-`, at most 64. */
    private val rule = Regex("[A-Za-z0-9][A-Za-z0-9._-]{0,63}")

    @Test
    fun worktreeNameFromTitle() {
        assertEquals("closta-20261104-0312", worktreeName(at, emptySet()))
        assertEquals("closta-20261104-0312-2", worktreeName(at, setOf("closta-20261104-0312")))
        assertEquals(
            "closta-20261104-0312-3",
            worktreeName(at, setOf("closta-20261104-0312", "closta-20261104-0312-2")),
        )
    }

    @Test
    fun nameFitsTheRules() {
        val taken = (1..50).map { if (it == 1) "closta-20261104-0312" else "closta-20261104-0312-$it" }.toSet()
        listOf(worktreeName(at, emptySet()), worktreeName(at, taken), worktreeName(LocalDateTime.MIN, emptySet()))
            .forEach { assertTrue(rule.matches(it), it) }
    }

    @Test
    fun aRefusalSaysWhyWithoutAPath() {
        IdeFailureKind.entries.forEach { kind ->
            val sentence = worktreeRefusal(kind)
            assertFalse(sentence.contains('/'), "$kind: $sentence")
            assertTrue(sentence.startsWith("Could not create the worktree"), "$kind: $sentence")
        }
        assertEquals(
            "Could not create the worktree: a worktree or branch with the same name already exists",
            worktreeRefusal(IdeFailureKind.ALREADY_EXISTS),
        )
    }

    @Test
    fun theTitleNamesTheBranch() {
        assertEquals("New conversation (closta-20261104-0312)", worktreeTitle("closta-20261104-0312"))
    }
}
