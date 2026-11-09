package dev.ukitomato.closta.platforms.intellij.composer

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class ComposerDraftTest {
    @Test
    fun theCurrentFileIsNotTakenByBackspace() =
        assertEquals(1, lastRemovable(listOf(ChipKind.SELECTION, ChipKind.ATTACHMENT, ChipKind.CURRENT_FILE)))

    @Test
    fun theLastOfTheOthersIsTaken() =
        assertEquals(2, lastRemovable(listOf(ChipKind.CURRENT_FILE, ChipKind.SELECTION, ChipKind.ATTACHMENT)))

    @Test
    fun nothingToTakeWithOnlyTheCurrentFile() = assertNull(lastRemovable(listOf(ChipKind.CURRENT_FILE)))

    @Test
    fun nothingToTakeWithNoChips() = assertNull(lastRemovable(emptyList()))
}
