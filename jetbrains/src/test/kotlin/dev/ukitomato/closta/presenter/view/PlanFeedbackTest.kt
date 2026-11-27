package dev.ukitomato.closta.presenter.view

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test

class PlanFeedbackTest {
    private val lead =
        "The user reviewed the plan in the editor and left comments. Lines starting with + were added by the " +
            "user, lines starting with - were removed. Revise the plan accordingly and present it again."

    private fun lines(count: Int): List<String> = (1..count).map { "line $it" }

    private fun needed(feedback: String?): String {
        assertTrue(feedback != null, "feedback expected")
        return feedback!!
    }

    private fun hunks(feedback: String): List<String> = feedback.lines().filter { it.startsWith("@@") }

    @Test
    fun theSameTextHasNoFeedback() {
        assertNull(planFeedback("a\nb\nc", "a\nb\nc", ""))
    }

    @Test
    fun aDifferenceOfTrailingSpacesOnlyHasNoFeedback() {
        assertNull(planFeedback("a  \nb\t\nc", "a\nb\nc   ", "a note"))
    }

    @Test
    fun anAddedLineIsOneHunkWithPlusAndContext() {
        val original = lines(10).joinToString("\n")
        val edited = (lines(5) + "added" + lines(10).drop(5)).joinToString("\n")
        val feedback = needed(planFeedback(original, edited, ""))
        assertTrue(feedback.startsWith(lead))
        assertEquals(listOf("@@ -4,4 +4,5 @@"), hunks(feedback))
        assertEquals(
            listOf(" line 4", " line 5", "+added", " line 6", " line 7"),
            feedback.lines().dropWhile { !it.startsWith("@@") }.drop(1),
        )
    }

    @Test
    fun aChangedLineIsAMinusAndAPlus() {
        val original = lines(6).joinToString("\n")
        val edited = lines(6).map { if (it == "line 3") "line three" else it }.joinToString("\n")
        val feedback = needed(planFeedback(original, edited, ""))
        assertEquals(listOf("@@ -1,5 +1,5 @@"), hunks(feedback))
        val body = feedback.lines().dropWhile { !it.startsWith("@@") }.drop(1)
        assertEquals(listOf(" line 1", " line 2", "-line 3", "+line three", " line 4", " line 5"), body)
    }

    @Test
    fun twoFarApartChangesAreTwoHunks() {
        val original = lines(30)
        val edited =
            original.toMutableList().also {
                it[2] = "early"
                it[26] = "late"
            }
        val feedback = needed(planFeedback(original.joinToString("\n"), edited.joinToString("\n"), ""))
        assertEquals(2, hunks(feedback).size)
    }

    @Test
    fun twoCloseChangesShareOneHunk() {
        val original = lines(30)
        val edited =
            original.toMutableList().also {
                it[10] = "a"
                it[13] = "b"
            }
        val feedback = needed(planFeedback(original.joinToString("\n"), edited.joinToString("\n"), ""))
        assertEquals(1, hunks(feedback).size)
    }

    @Test
    fun aNoteComesBeforeTheDifference() {
        val feedback = needed(planFeedback("a\nb", "a\nc", "Keep it short"))
        assertTrue(feedback.startsWith(lead))
        val note = feedback.indexOf("User note: Keep it short")
        assertTrue(note > lead.length - 1)
        assertTrue(note < feedback.indexOf("@@"))
    }

    @Test
    fun noNoteLeavesNoNoteLine() {
        assertTrue(!needed(planFeedback("a", "b", "")).contains("User note:"))
    }

    @Test
    fun beyondTwoThousandLinesTheWholeEditedTextIsSent() {
        val original = lines(2001).joinToString("\n")
        val edited = original + "\nextra"
        val feedback = needed(planFeedback(original, edited, "n"))
        assertTrue(feedback.contains("User note: n"))
        assertTrue(hunks(feedback).isEmpty())
        assertTrue(feedback.endsWith("Edited plan:\n$edited"))
    }

    @Test
    fun exactlyTwoThousandLinesStillMakesADifference() {
        val original = lines(2000).joinToString("\n")
        val edited = original.replace("line 1000", "changed")
        val feedback = needed(planFeedback(original, edited, ""))
        assertEquals(1, hunks(feedback).size)
    }

    @Tag("perf")
    @Test
    fun aFiveHundredLineDifferenceBuildsWithinBudget() {
        val original = lines(500)
        val edited = original.mapIndexed { index, line -> if (index % 2 == 0) "edited $index" else line }
        planFeedback(original.joinToString("\n"), edited.joinToString("\n"), "")
        val runs =
            (1..5).map {
                val start = System.nanoTime()
                planFeedback(original.joinToString("\n"), edited.joinToString("\n"), "")
                (System.nanoTime() - start) / 1_000_000.0
            }
        val median = runs.sorted()[runs.size / 2]
        println("perf planFeedback median=${"%.3f".format(median)}ms")
        assertTrue(median <= 20.0 + 50.0, "median ${median}ms")
    }
}
