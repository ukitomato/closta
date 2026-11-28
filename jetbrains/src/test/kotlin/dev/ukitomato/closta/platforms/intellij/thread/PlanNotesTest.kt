package dev.ukitomato.closta.platforms.intellij.thread

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class PlanNotesTest {
    @Test
    fun theCardsAndThePanesNotesAreKeptSeparately() {
        val notes = PlanNotes()
        notes.typedOnCard("r1", "a")
        notes.typedInPane("r1", "b")
        assertEquals(PlanNote("a", "b"), notes["r1"])
    }

    @Test
    fun aForgottenRequestHasNoNote() {
        val notes = PlanNotes()
        notes.typedOnCard("r1", "a")
        notes.forget("r1")
        assertNull(notes["r1"])
    }
}
