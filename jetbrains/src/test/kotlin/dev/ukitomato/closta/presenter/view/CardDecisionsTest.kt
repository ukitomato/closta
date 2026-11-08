package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.presenter.view.PermissionChoice.ALLOW
import dev.ukitomato.closta.presenter.view.PermissionChoice.ALLOW_KEEP
import dev.ukitomato.closta.presenter.view.PermissionChoice.DENY
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class CardDecisionsTest {
    private val rule =
        SuggestionRecord(
            "s1",
            "addRules",
            "",
            "localSettings",
            """{"type":"addRules","destination":"localSettings"}""",
        )
    private val mode = SuggestionRecord("s2", "setMode", "acceptEdits", "session", """{"type":"setMode"}""")

    @Test
    fun `the first button allows`() {
        assertEquals(ALLOW, permissionChoice(0, hasSuggestions = false))
        assertEquals(ALLOW, permissionChoice(0, hasSuggestions = true))
    }

    @Test
    fun `without suggestions the second button denies`() =
        assertEquals(DENY, permissionChoice(1, hasSuggestions = false))

    @Test
    fun `with suggestions the second button keeps them`() =
        assertEquals(ALLOW_KEEP, permissionChoice(1, hasSuggestions = true))

    @Test
    fun `with suggestions the third button denies`() = assertEquals(DENY, permissionChoice(2, hasSuggestions = true))

    @Test
    fun `a destination not chosen keeps each suggestion as offered`() {
        val offered = listOf(rule, mode)
        assertEquals(offered, keptSuggestions(offered, null))
    }

    @Test
    fun `a destination chosen moves each suggestion not already there`() {
        val kept = keptSuggestions(listOf(rule), "projectSettings").single()
        assertEquals("projectSettings", kept.destination)
        assertTrue(kept.raw.contains("\"destination\":\"projectSettings\""))
        assertEquals(rule, keptSuggestions(listOf(rule), "localSettings").single())
    }

    @Test
    fun `answers join a multi-select with a comma and use other when written`() {
        val answers =
            questionAnswers(
                listOf(
                    QuestionPick("Which?", listOf("A", "B"), other = null),
                    QuestionPick("Why?", emptyList(), other = "  my own  "),
                    QuestionPick("Both?", listOf("C"), other = "D"),
                    QuestionPick("Blank other?", listOf("E"), other = "   "),
                ),
            )
        assertEquals(
            mapOf("Which?" to "A, B", "Why?" to "my own", "Both?" to "C, D", "Blank other?" to "E"),
            answers,
        )
    }

    @Test
    fun `questions are complete only when each has an answer`() {
        assertTrue(questionsComplete(listOf(QuestionPick("Q", listOf("A"), null))))
        assertFalse(questionsComplete(listOf(QuestionPick("Q", emptyList(), "  "))))
        val oneUnanswered = listOf(QuestionPick("Q", listOf("A"), null), QuestionPick("R", emptyList(), null))
        assertFalse(questionsComplete(oneUnanswered))
    }
}
