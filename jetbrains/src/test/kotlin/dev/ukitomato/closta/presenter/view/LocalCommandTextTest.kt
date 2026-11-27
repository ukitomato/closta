package dev.ukitomato.closta.presenter.view

import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** Capture 42: `/context` typed as text shows its result in the thread. */
class LocalCommandTextTest {
    @Test
    fun `the result of a typed context command is a text row that starts with its heading`() {
        val rows = ThreadRows().of(CaptureReplay.replay("42-local-commands").last().transcript)
        assertTrue(rows.filterIsInstance<TextRow>().any { it.markdown.startsWith("## Context Usage") })
    }
}
