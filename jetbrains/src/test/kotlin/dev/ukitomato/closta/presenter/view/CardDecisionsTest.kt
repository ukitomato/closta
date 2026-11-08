package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.presenter.view.PermissionChoice.ALLOW
import dev.ukitomato.closta.presenter.view.PermissionChoice.ALLOW_KEEP
import dev.ukitomato.closta.presenter.view.PermissionChoice.DENY
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertNull
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
    fun `the sessions window answers as the conversation does, or not at all`() {
        listOf(false, true).forEach { hasSuggestions ->
            (0..8).forEach { index ->
                val detail = detailChoice(index, hasSuggestions)
                if (detail != null) assertEquals(permissionChoice(index, hasSuggestions), detail)
            }
        }
    }

    @Test
    fun `the sessions window never keeps a suggestion`() {
        listOf(false, true).forEach { hasSuggestions ->
            (0..8).forEach { assertNotEquals(ALLOW_KEEP, detailChoice(it, hasSuggestions)) }
        }
    }

    @Test
    fun `with suggestions the sessions window's second key does nothing and its third denies`() {
        assertEquals(ALLOW, detailChoice(0, hasSuggestions = true))
        assertNull(detailChoice(1, hasSuggestions = true))
        assertEquals(DENY, detailChoice(2, hasSuggestions = true))
    }

    @Test
    fun `without suggestions the sessions window's second key denies`() {
        assertEquals(ALLOW, detailChoice(0, hasSuggestions = false))
        assertEquals(DENY, detailChoice(1, hasSuggestions = false))
    }

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
    fun `choosing all projects moves the rules but leaves a mode switch in the session`() {
        val sessionRule = rule.copy(id = "s3", destination = "session")
        val kept = keptSuggestions(listOf(mode, sessionRule), "userSettings")
        assertEquals("session", kept[0].destination)
        assertEquals(mode, kept[0])
        assertEquals("userSettings", kept[1].destination)
    }

    @Test
    fun `a directory grant and a rule removal stay where they were offered unless they are rules`() {
        val dirs = SuggestionRecord("s4", "addDirectories", "/a", "session", """{"type":"addDirectories"}""")
        val removal = SuggestionRecord("s5", "removeRules", "", "session", """{"type":"removeRules"}""")
        val kept = keptSuggestions(listOf(dirs, removal), "userSettings")
        assertEquals("session", kept[0].destination)
        assertEquals("userSettings", kept[1].destination)
    }

    @Test
    fun `each suggestion is its own line`() {
        val dirs = SuggestionRecord("s4", "addDirectories", "/a\n/b", "session", """{"type":"addDirectories"}""")
        val lines = suggestionLinesOf(listOf(mode, dirs))
        val expected = listOf(SuggestionLine("setMode", "acceptEdits"), SuggestionLine("addDirectories", "/a\n/b"))
        assertEquals(expected, lines)
    }

    @Test
    fun `the captured suggestions keep the mode switch in the session when all projects is chosen`() {
        val names = listOf("05-permission-can-use-tool", "12-subagent-permission", "16-permission-suggestion-accept")
        names.forEach { name ->
            val offered =
                CaptureReplay
                    .replay(name)
                    .last()
                    .transcript.approvals
                    .values()
                    .flatMap { it.suggestions }
            val kept = keptSuggestions(offered, "userSettings")
            offered.zip(kept).filter { it.first.kind == "setMode" }.forEach { (before, after) ->
                assertEquals("session", after.destination, name)
                assertEquals(before, after, name)
            }
        }
    }

    @Test
    fun `a destination is offered only when a rule is suggested`() {
        val dirs = SuggestionRecord("s4", "addDirectories", "/a", "session", """{"type":"addDirectories"}""")
        assertTrue(offersDestination(listOf(mode, rule)))
        assertFalse(offersDestination(listOf(mode, dirs)))
        assertFalse(offersDestination(emptyList()))
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
