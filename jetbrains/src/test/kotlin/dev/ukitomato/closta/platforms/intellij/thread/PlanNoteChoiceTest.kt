package dev.ukitomato.closta.platforms.intellij.thread

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class PlanNoteChoiceTest {
    @Test
    fun theCardsNoteAlone() = assertEquals("from card", planNote(PlanNote(card = "from card", pane = null)))

    @Test
    fun thePanesNoteAlone() = assertEquals("from pane", planNote(PlanNote(card = null, pane = "from pane")))

    @Test
    fun theCardsNoteWinsWhenBothHaveOne() = assertEquals("from card", planNote(PlanNote("from card", "from pane")))

    @Test
    fun aBlankCardNoteGivesWayToThePanes() = assertEquals("from pane", planNote(PlanNote("  \n", "from pane")))

    @Test
    fun blankNotesAreNoNote() = assertEquals("", planNote(PlanNote(" ", "\t")))

    @Test
    fun noNoteIsNoNote() = assertEquals("", planNote(null))
}
