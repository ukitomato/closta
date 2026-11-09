package dev.ukitomato.closta.platforms.intellij.ide

import dev.ukitomato.closta.core.interfaces.DiagnosticSeverity
import dev.ukitomato.closta.core.interfaces.IdeFailureKind
import dev.ukitomato.closta.core.interfaces.IdeResult
import dev.ukitomato.closta.core.interfaces.WorktreeCreated
import dev.ukitomato.closta.core.interfaces.WorktreeRequest
import dev.ukitomato.closta.core.interfaces.Worktrees
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** The arithmetic of the IntelliJ seams, measured without an IDE. */
class IdeCalculationsTest {
    @Test
    fun `the limit is clamped into 1 to 200`() {
        assertEquals(1, clampLimit(0))
        assertEquals(1, clampLimit(-5))
        assertEquals(50, clampLimit(50))
        assertEquals(200, clampLimit(10_000))
    }

    @Test
    fun `a result is cut at the limit and says so only when something was cut`() {
        val cut = limited(listOf("c", "a", "b"), 2)
        assertEquals(listOf("a", "b"), cut.paths)
        assertTrue(cut.truncated)
        val whole = limited(listOf("b", "a"), 2)
        assertEquals(listOf("a", "b"), whole.paths)
        assertFalse(whole.truncated)
    }

    @Test
    fun `a query matches a part of the file name, ignoring case, not the folders, and an empty one matches all`() {
        assertTrue(matchesQuery("src/Main.kt", "main"))
        assertTrue(matchesQuery("Main.kt", "MAIN"))
        assertFalse(matchesQuery("src/Main.kt", "src"))
        assertFalse(matchesQuery("src/Main.kt", "src/Main"))
        assertTrue(matchesQuery("src/Main.kt", ""))
        assertFalse(matchesQuery("src/Main.kt", "test"))
    }

    @Test
    fun `a relative path is made inside the root and refused outside it`() {
        assertEquals("src/A.kt", relativePath("/work/p", "/work/p/src/A.kt"))
        assertEquals("", relativePath("/work/p", "/work/p"))
        assertNull(relativePath("/work/p", "/work/other/A.kt"))
        assertNull(relativePath("/work/p", "/work/p/../other/A.kt"))
        assertNull(relativePath("/work/p", "/work/pp/A.kt"))
    }

    @Test
    fun `a path to edit resolves against the root and may not leave it`() {
        assertEquals("/work/p/src/A.kt", resolveInside("/work/p", "src/A.kt"))
        assertEquals("/work/p/src/A.kt", resolveInside("/work/p", "/work/p/src/A.kt"))
        assertNull(resolveInside("/work/p", "../x"))
        assertNull(resolveInside("/work/p", "/etc/passwd"))
        assertNull(resolveInside("/work/p", "a\u0000b"))
    }

    private val starts = listOf(0, 10, 20)
    private val ends = listOf(9, 19, 25)

    private fun range(
        start: Int?,
        end: Int?,
    ) = replacementRange(3, 26, start, end, starts::get, ends::get)

    @Test
    fun `a line range becomes offsets from the first line's start to the last line's end`() {
        assertEquals(IdeResult.Ok(OffsetRange(10, 25)), range(2, 3))
        assertEquals(IdeResult.Ok(OffsetRange(0, 9)), range(1, 1))
        assertEquals(IdeResult.Ok(OffsetRange(0, 26)), range(null, null))
    }

    @Test
    fun `a bad range is a refusal and names no offsets`() {
        assertEquals(IdeFailureKind.INVALID_ARGUMENT, (range(2, null) as IdeResult.Failed).kind)
        assertEquals(IdeFailureKind.INVALID_ARGUMENT, (range(null, 2) as IdeResult.Failed).kind)
        assertEquals(IdeFailureKind.OUT_OF_RANGE, (range(0, 1) as IdeResult.Failed).kind)
        assertEquals(IdeFailureKind.OUT_OF_RANGE, (range(3, 2) as IdeResult.Failed).kind)
        assertEquals(IdeFailureKind.OUT_OF_RANGE, (range(2, 4) as IdeResult.Failed).kind)
    }

    @Test
    fun `a selection ending at the start of a line does not include that line`() {
        val lineOf = { offset: Int -> offset / 10 }
        assertEquals(1, inclusiveEndLine(0, 5, lineOf))
        assertEquals(2, inclusiveEndLine(0, 15, lineOf))
        assertEquals(1, inclusiveEndLine(0, 10, lineOf))
        assertEquals(1, inclusiveEndLine(3, 3, lineOf))
    }

    @Test
    fun `a highlight maps to a finding with 1-based positions, and below a warning or without text to nothing`() {
        val error = diagnosticOf("/p/A.kt", 2, 4, true, true, " boom ", "inspection")!!
        assertEquals(DiagnosticSeverity.ERROR, error.severity)
        assertEquals(3, error.line)
        assertEquals(5, error.column)
        assertEquals("boom", error.message)
        assertEquals(DiagnosticSeverity.WARNING, diagnosticOf("/p/A.kt", 0, 0, false, true, "w", null)!!.severity)
        assertNull(diagnosticOf("/p/A.kt", 0, 0, false, false, "weak", null))
        assertNull(diagnosticOf("/p/A.kt", 0, 0, true, true, "  ", null))
        assertNull(diagnosticOf("/p/A.kt", 0, 0, true, true, null, null))
    }

    private val created =
        WorktreeCreated(
            "/p/.claude/worktrees/x",
            "x",
            false,
            listOf("git -C /p worktree remove /p/.claude/worktrees/x", "git -C /p branch -D x"),
        )

    @Test
    fun `the notice names the place, the branch and both removal commands`() {
        val text = worktreeNoticeText(created)
        assertTrue(text.contains("/p/.claude/worktrees/x"))
        assertTrue(text.contains("new branch x"))
        created.removeCommands.forEach { assertTrue(text.contains(it), it) }
        assertTrue(text.contains("\n" + created.removeCommands[0] + "\n" + created.removeCommands[1]), text)
        assertTrue(text.contains(".claude/ as untracked"), text)
    }

    @Test
    fun `what comes from outside is escaped in the notice, and a notice without such text is as it was`() {
        val risky =
            WorktreeCreated("/p/a<b>&c", "x<y", false, listOf("git -C /p branch -D x<y", "echo a & b"))
        val text = worktreeNoticeText(risky)
        assertTrue(text.contains("Created worktree /p/a&lt;b&gt;&amp;c on new branch x&lt;y. "), text)
        assertTrue(text.contains("\ngit -C /p branch -D x&lt;y\necho a &amp; b"), text)
        assertFalse(text.contains("<")) { text }
        assertEquals(
            "Created worktree /p/.claude/worktrees/x on new branch x. The IDE cannot undo this. " +
                "The original working tree's git status now shows .claude/ as untracked. To remove it, run:\n" +
                "git -C /p worktree remove /p/.claude/worktrees/x\ngit -C /p branch -D x",
            worktreeNoticeText(created),
        )
    }

    @Test
    fun `htmlEscaped escapes the three characters and the ampersand first`() {
        assertEquals("&lt;&gt;&amp;", htmlEscaped("<>&"))
        assertEquals("&amp;lt;", htmlEscaped("&lt;"))
        assertEquals("plain \"text\"", htmlEscaped("plain \"text\""))
    }

    private class Stub(
        private val result: IdeResult<WorktreeCreated>,
    ) : Worktrees {
        override suspend fun create(request: WorktreeRequest) = result
    }

    @Test
    fun `a notice is shown for a created worktree, not for a failure, and a failing notice does not fail the result`() =
        runBlocking {
            val shown = mutableListOf<WorktreeCreated>()
            val ok = NotifyingWorktrees(Stub(IdeResult.Ok(created))) { shown += it }.create(WorktreeRequest("x"))
            assertEquals(IdeResult.Ok(created), ok)
            assertEquals(listOf(created), shown)
            val failure = IdeResult.Failed(IdeFailureKind.FAILED, "no")
            assertEquals(failure, NotifyingWorktrees(Stub(failure)) { shown += it }.create(WorktreeRequest("x")))
            assertEquals(1, shown.size)
            val survived =
                NotifyingWorktrees(
                    Stub(IdeResult.Ok(created)),
                ) { error("no balloon") }.create(WorktreeRequest("x"))
            assertEquals(IdeResult.Ok(created), survived)
        }
}
