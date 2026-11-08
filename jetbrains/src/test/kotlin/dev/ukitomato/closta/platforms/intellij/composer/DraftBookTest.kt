package dev.ukitomato.closta.platforms.intellij.composer

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class DraftBookTest {
    @Test fun aCarriedDraftIsTheNewSessionsAndStaysWithTheOldOne() {
        val book = DraftBook<StringBuilder>()
        book.of("old") { StringBuilder("half a prompt") }
        book.carry("old", "new")
        assertEquals("half a prompt", book.of("new") { StringBuilder() }.toString())
        book.drop("old")
        assertEquals("half a prompt", book.of("new") { StringBuilder() }.toString())
    }

    @Test fun theOldDraftStaysWhenTheNewSessionNeverOpens() {
        val book = DraftBook<String>()
        book.of("old") { "a" }
        book.carry("old", "new")
        assertEquals("a", book.of("old") { "c" })
    }

    @Test fun carryingNeverOverwritesADraftTheNewSessionHas() {
        val book = DraftBook<String>()
        book.of("old") { "a" }
        book.of("new") { "b" }
        book.carry("old", "new")
        assertEquals("b", book.of("new") { "c" })
    }

    @Test fun carryingFromASessionWithoutADraftDoesNothing() {
        val book = DraftBook<String>()
        book.carry("old", "new")
        assertEquals("fresh", book.of("new") { "fresh" })
    }
}
