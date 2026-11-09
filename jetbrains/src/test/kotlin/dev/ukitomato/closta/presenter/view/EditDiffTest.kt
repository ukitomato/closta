package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.presenter.tree.JsonBool
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonString
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class EditDiffTest {
    private fun edit(
        old: String,
        new: String,
        replaceAll: Boolean? = null,
    ): JsonObject {
        val members =
            mutableListOf<Pair<String, dev.ukitomato.closta.presenter.tree.JsonValue>>(
                "file_path" to JsonString("/w/A.kt"),
                "old_string" to JsonString(old),
                "new_string" to JsonString(new),
            )
        if (replaceAll != null) members += "replace_all" to (if (replaceAll) JsonBool.TRUE else JsonBool.FALSE)
        return JsonObject.of(*members.toTypedArray())
    }

    private fun kinds(diff: EditDiff) = diff.lines.map { it.kind }

    @Test
    fun editDiffLines() {
        val approval =
            CaptureReplay
                .replay("17-edit-approval")
                .last()
                .transcript.approvals
                .values()
                .single()
        val input = approval.input as JsonObject
        val diff = editDiff("Edit", input)
        assertNotNull(diff)
        diff!!
        val old = input.string("old_string")!!.lines()
        val new = input.string("new_string")!!.lines()
        assertEquals(input.string("file_path"), diff.filePath)
        assertEquals(old.size - new.intersect(old.toSet()).size, diff.removed)
        assertEquals(new.size - old.intersect(new.toSet()).size, diff.added)
        assertEquals(diff.removed, diff.lines.count { it.kind == DiffKind.REMOVED })
        assertEquals(diff.added, diff.lines.count { it.kind == DiffKind.ADDED })
        assertFalse(diff.replaceAll)
        assertFalse(diff.cut)
    }

    @Test
    fun anEditKeepsTheLinesItShares() {
        val diff = editDiff("Edit", edit("a\nb\nc\n", "a\nB\nc\nd\n"))!!
        assertEquals(
            listOf(
                DiffLine(DiffKind.SAME, "a"),
                DiffLine(DiffKind.REMOVED, "b"),
                DiffLine(DiffKind.ADDED, "B"),
                DiffLine(DiffKind.SAME, "c"),
                DiffLine(DiffKind.ADDED, "d"),
            ),
            diff.lines,
        )
        assertEquals(2, diff.added)
        assertEquals(1, diff.removed)
    }

    @Test
    fun sharedLinesFarFromAChangeAreLeftOut() {
        val same = (1..10).joinToString("\n") { "s$it" }
        val diff = editDiff("Edit", edit("$same\nold", "$same\nnew"))!!
        assertEquals(listOf("s8", "s9", "s10"), diff.lines.filter { it.kind == DiffKind.SAME }.map { it.text })
    }

    @Test
    fun writeIsAllAdded() {
        val input = JsonObject.of("file_path" to JsonString("/w/N.md"), "content" to JsonString("# t\n\nbody\n"))
        val diff = editDiff("Write", input)!!
        assertEquals(listOf(DiffKind.ADDED, DiffKind.ADDED, DiffKind.ADDED), kinds(diff))
        assertEquals(3, diff.added)
        assertEquals(0, diff.removed)
        assertEquals("/w/N.md", diff.filePath)
    }

    @Test
    fun replaceAllIsNoted() {
        assertTrue(editDiff("Edit", edit("x", "y", replaceAll = true))!!.replaceAll)
        assertFalse(editDiff("Edit", edit("x", "y", replaceAll = false))!!.replaceAll)
        assertFalse(editDiff("Edit", edit("x", "y"))!!.replaceAll)
    }

    @Test
    fun hugeWriteIsCut() {
        val content = (1..3_000).joinToString("\n") { "line $it" }
        val diff =
            editDiff(
                "Write",
                JsonObject.of(
                    "file_path" to JsonString("/w/B.txt"),
                    "content" to JsonString(content),
                ),
            )!!
        assertEquals(DIFF_MAX_LINES, diff.lines.size)
        assertTrue(diff.cut)
        assertEquals(3_000, diff.added)
    }

    @Test
    fun aHugeEditDoesNotCompareEveryLine() {
        val old = (1..3_000).joinToString("\n") { "old $it" }
        val new = (1..3_000).joinToString("\n") { "new $it" }
        val diff = editDiff("Edit", edit(old, new))!!
        assertEquals(3_000, diff.removed)
        assertEquals(3_000, diff.added)
        assertEquals(DIFF_MAX_LINES, diff.lines.size)
        assertTrue(diff.cut)
    }

    @Test
    fun otherToolsHaveNoDiff() {
        assertNull(editDiff("Bash", JsonObject.of("command" to JsonString("ls"))))
        assertNull(editDiff("Read", JsonObject.of("file_path" to JsonString("/w/A.kt"))))
        assertNull(editDiff("MultiEdit", JsonObject.of("file_path" to JsonString("/w/A.kt"))))
        assertNull(editDiff("Edit", JsonObject.of("file_path" to JsonString("/w/A.kt"))))
        assertNull(editDiff("Write", null))
    }

    @Test
    fun anEditCardCarriesItsDiff() {
        val approval =
            CaptureReplay
                .replay("17-edit-approval")
                .last()
                .transcript.approvals
                .values()
                .single()
        assertEquals(editDiff("Edit", approval.input), (cardOf(approval) as PermissionCard).diff)
    }

    @Test
    fun theDiffViewerShowsTheFileAfterTheCall() {
        assertEquals("a NEW b old", contentAfter("Edit", edit("old", "NEW"), "a old b old"))
        assertEquals("a NEW b NEW", contentAfter("Edit", edit("old", "NEW", replaceAll = true), "a old b old"))
        assertNull(contentAfter("Edit", edit("absent", "NEW"), "a old"))
        val write = JsonObject.of("file_path" to JsonString("/w/N.md"), "content" to JsonString("all new"))
        assertEquals("all new", contentAfter("Write", write, null))
        assertNull(contentAfter("Bash", JsonObject.of("command" to JsonString("ls")), "x"))
    }

    @Test
    fun anEditNotInTheFileShowsItsOwnStrings() {
        assertEquals("a old" to "a NEW", diffSides("Edit", edit("old", "NEW"), "a old"))
        assertEquals("old" to "NEW", diffSides("Edit", edit("old", "NEW"), "gone"))
        assertEquals(
            "" to "x",
            diffSides(
                "Write",
                JsonObject.of(
                    "file_path" to JsonString("/w/N"),
                    "content" to JsonString("x"),
                ),
                null,
            ),
        )
        assertNull(diffSides("Bash", JsonObject.of("command" to JsonString("ls")), "x"))
    }
}
