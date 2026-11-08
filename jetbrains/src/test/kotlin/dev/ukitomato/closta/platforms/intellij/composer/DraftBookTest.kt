package dev.ukitomato.closta.platforms.intellij.composer

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotSame
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Test

class DraftBookTest {
    private fun book() = DraftBook(ComposerDraft::copy)

    private fun draft(text: String) = ComposerDraft(PromptHistory(listOf("first"))).also { it.text = text }

    @Test fun aCarriedDraftIsTheNewSessionsAndStaysWithTheOldOne() {
        val book = book()
        book.of("old") { draft("half a prompt") }
        book.carry("old", "new")
        assertEquals("half a prompt", book.of("new") { draft("") }.text)
        book.drop("old")
        assertEquals("half a prompt", book.of("new") { draft("") }.text)
    }

    @Test fun theCopyAndTheOriginalAreEditedApart() {
        val book = book()
        val old = book.of("old") { draft("a") }
        old.selections += LineSelection("F.kt", 1, 2)
        old.dismissed += "file:///x"
        book.carry("old", "new")
        val new = book.of("new") { draft("") }
        assertNotSame(old, new)
        new.text = "b"
        new.selections.clear()
        new.history.add("sent in the new one")
        assertEquals("a", old.text)
        assertEquals(1, old.selections.size)
        assertEquals(listOf("first"), old.history.prompts)
        old.text = "c"
        old.dismissed.clear()
        assertEquals("b", new.text)
        assertEquals(setOf("file:///x"), new.dismissed)
    }

    @Test fun aCopyStartsItsHistoryAgainFromItsOwnTranscript() {
        val old = draft("a")
        old.history.add("sent")
        old.seenMessages = 5
        val copy = old.copy()
        assertEquals(listOf("first", "sent"), copy.history.prompts)
        assertEquals(false, copy.history.sentHere)
        assertEquals(0, copy.seenMessages)
    }

    @Test fun aSnapshotSurvivesTheOriginalsDrop() {
        val book = book()
        book.of("old") { draft("kept") }
        val taken = book.snapshot("old")
        book.drop("old")
        assertEquals("kept", taken?.text)
        book.put("new", taken!!)
        assertSame(taken, book.of("new") { draft("") })
    }

    @Test fun theOldDraftStaysWhenTheNewSessionNeverOpens() {
        val book = book()
        val old = book.of("old") { draft("a") }
        book.carry("old", "new")
        assertSame(old, book.of("old") { draft("c") })
    }

    @Test fun carryingNeverOverwritesADraftTheNewSessionHas() {
        val book = book()
        book.of("old") { draft("a") }
        book.of("new") { draft("b") }
        book.carry("old", "new")
        assertEquals("b", book.of("new") { draft("c") }.text)
    }

    @Test fun carryingFromASessionWithoutADraftDoesNothing() {
        val book = book()
        book.carry("old", "new")
        assertNull(book.snapshot("new"))
        assertEquals("fresh", book.of("new") { draft("fresh") }.text)
    }
}
