package dev.ukitomato.closta.platforms.intellij.chat

import dev.ukitomato.closta.presenter.view.ChangedFile
import dev.ukitomato.closta.presenter.view.Routing
import dev.ukitomato.closta.presenter.view.Transcript
import dev.ukitomato.closta.presenter.view.TurnChangesRecord
import dev.ukitomato.closta.presenter.view.TurnEndRecord
import dev.ukitomato.closta.presenter.view.TurnEndRow
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class TurnChangeRulesTest {
    private fun file(path: String) = ChangedFile(path, added = 1, removed = 0, created = false, deleted = false)

    private fun end(
        ask: String,
        ms: Long? = 12_000,
        vararg files: String,
        looked: Boolean = true,
    ) = TurnEndRow("m-$ask/end", ask, ms, if (looked) TurnChangesRecord(files.map(::file)) else null)

    @Test
    fun onlyFilesUnderTheRootOutsideGitAndIdeaAreCollected() {
        assertTrue(collects("/w/app", "/w/app/src/A.kt"))
        assertTrue(collects("/w/app", "/w/app/.github/ci.yml"))
        assertFalse(collects("/w/app", "/w/application/A.kt"))
        assertFalse(collects("/w/app", "/w/app"))
        assertFalse(collects("/w/app", "/w/app/.git/index"))
        assertFalse(collects("/w/app", "/w/app/sub/.git/HEAD"))
        assertFalse(collects("/w/app", "/w/app/.idea/workspace.xml"))
        assertTrue(collects("C:/w/app/", "C:/w/app/A.kt"))
    }

    @Test
    fun aPathIsShownFromTheRoot() {
        assertEquals("src/A.kt", shownPath("/w/app", "/w/app/src/A.kt"))
        assertEquals("/elsewhere/B.kt", shownPath("/w/app", "/elsewhere/B.kt"))
    }

    @Test
    fun theEndLineSaysTheTimeAndTheFiles() {
        assertEquals("12 s · 2 files", turnEndText(end("a", 12_400, "x", "y")))
        assertEquals("1 min 5 s · 1 file", turnEndText(end("a", 65_000, "x")))
        assertEquals("0 s · No file changes", turnEndText(end("a", 300)))
        assertEquals("12 s · Checking changed files", turnEndText(end("a", looked = false)))
        assertEquals("1 file", turnEndText(end("a", null, "x")))
    }

    @Test
    fun theBarShowsTheLastTurnWhenItChangedFiles() {
        val rows = listOf(end("a", 1, "x"), end("b", 1, "x", "y"))
        assertEquals(ChangesBarState("b", 2), changesBar(rows, settled = emptySet()))
        assertNull(changesBar(rows, settled = setOf("b")))
        assertNull(changesBar(listOf(end("a", 1, "x"), end("b", 1)), settled = emptySet()))
        assertNull(changesBar(listOf(end("a", 1, "x"), end("b", looked = false)), settled = emptySet()))
        assertEquals("Changed 2 files", ChangesBarState("b", 2).text)
    }

    @Test
    fun onlyAsksWhoseTurnEndedAreLookedAt() {
        val transcript =
            Transcript(
                turnEnds = mapOf("m-a" to TurnEndRecord("a", 1), "m-b" to TurnEndRecord("b", 1)),
                turnChanges = mapOf("b" to TurnChangesRecord(emptyList())),
            )
        assertEquals(listOf("a"), toLookAt(transcript, pending = setOf("a", "b", "c")))
    }

    @Test
    fun createdOnlyIfFirstEventWasCreate() {
        val seen = FirstEvents()
        seen.saw("/w/New.kt", PathEvent.CREATED)
        seen.saw("/w/New.kt", PathEvent.OTHER)
        seen.saw("/w/Old.kt", PathEvent.OTHER)
        seen.saw("/w/Old.kt", PathEvent.CREATED)
        assertTrue(seen.createdInTurn("/w/New.kt"))
        assertFalse(seen.createdInTurn("/w/Old.kt"))
        assertFalse(seen.createdInTurn("/w/Unseen.kt"))
        assertEquals(setOf("/w/New.kt", "/w/Old.kt"), seen.paths())
    }

    @Test
    fun missingLabelContentIsNotRevertable() {
        // Local History holds no content for some files (too big, ignored, outside the content roots): not "new".
        val unknown = verdictOf(createdInTurn = false, atLabel = false, now = true, same = false)
        assertEquals(FileVerdict(created = false, deleted = false, revertable = false), unknown)
        assertEquals(RevertAction.SKIP, revertAction(changed(unknown!!)))
        val made = verdictOf(createdInTurn = true, atLabel = false, now = true, same = false)
        assertEquals(RevertAction.DELETE, revertAction(changed(made!!)))
        val edited = verdictOf(createdInTurn = false, atLabel = true, now = true, same = false)
        assertEquals(RevertAction.RESTORE, revertAction(changed(edited!!)))
        val removed = verdictOf(createdInTurn = false, atLabel = true, now = false, same = false)
        assertEquals(FileVerdict(created = false, deleted = true, revertable = true), removed)
        assertNull(verdictOf(createdInTurn = false, atLabel = true, now = true, same = true))
        assertNull(verdictOf(createdInTurn = true, atLabel = false, now = false, same = false))
    }

    private fun changed(verdict: FileVerdict) =
        ChangedFile("/w/A", 0, 0, verdict.created, verdict.deleted, revertable = verdict.revertable)

    @Test
    fun theBarSaysWhatCannotBeReverted() {
        val files =
            listOf(
                file("a"),
                ChangedFile("b", 0, 0, created = false, deleted = false, revertable = false),
            )
        val rows = listOf(TurnEndRow("m/end", "k", 1, TurnChangesRecord(files)))
        val bar = changesBar(rows, emptySet())!!
        assertEquals("Changed 2 files · 1 file cannot be reverted", bar.text)
        val many = listOf(TurnEndRow("m/end", "k", 1, TurnChangesRecord(files, more = true)))
        assertEquals("Changed 2 or more files · 1 file cannot be reverted", changesBar(many, emptySet())!!.text)
    }

    @Test
    fun aTurnLooksAtAtMostTheLimit() {
        val paths = (1..LOOK_LIMIT + 20).map { "/w/f%04d".format(it) }.shuffled()
        val (looked, more) = toCompare(paths)
        assertEquals(LOOK_LIMIT, looked.size)
        assertEquals(paths.sorted().take(LOOK_LIMIT), looked)
        assertTrue(more)
        assertEquals(listOf("/w/a") to false, toCompare(listOf("/w/a")))
        val row = TurnEndRow("m/end", "k", 2_000, TurnChangesRecord(looked.map(::file), more = true))
        assertEquals("2 s · $LOOK_LIMIT or more files", turnEndText(row))
    }

    @Test
    fun bigOrBinaryFilesAreNotCounted() {
        assertTrue(countsLines(COUNT_MAX_BYTES.toLong(), binary = false))
        assertFalse(countsLines(COUNT_MAX_BYTES + 1L, binary = false))
        assertFalse(countsLines(10, binary = true))
    }

    @Test
    fun laterAsksStartWhenTheirTurnStarts() {
        val transcript =
            Transcript(
                userUuids = mapOf("a" to "ua", "b" to "ub"),
                routing = Routing(turns = mapOf("ua" to "m-a")),
            )
        assertEquals(listOf("a"), startedAsks(transcript, setOf("a", "b")))
        assertEquals(emptyList<String>(), startedAsks(transcript, setOf("b")))
    }
}
