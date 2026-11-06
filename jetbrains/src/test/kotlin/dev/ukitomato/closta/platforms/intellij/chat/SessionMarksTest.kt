package dev.ukitomato.closta.platforms.intellij.chat

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class SessionMarksTest {
    @Test
    fun marksRoundTrip() {
        assertEquals(setOf("a", "b"), SessionMarks.decode(SessionMarks.encode(setOf("a", "b"))))
        assertEquals(emptySet<String>(), SessionMarks.decode("{broken"))
    }

    @Test
    fun nothingStoredIsNoMark() {
        assertEquals(emptySet<String>(), SessionMarks.decode(null))
        assertEquals(emptySet<String>(), SessionMarks.decode(SessionMarks.encode(emptySet())))
    }

    @Test
    fun aValueOfAnotherShapeIsNoMark() {
        assertEquals(emptySet<String>(), SessionMarks.decode("""{"a":1}"""))
        assertEquals(setOf("a"), SessionMarks.decode("""["a", 2, "", null]"""))
    }

    @Test
    fun marksKeepTheWorkingDirectory() {
        val marks =
            mapOf(
                "a" to WasRunningMark(workingDirectory = "/repo/.claude/worktrees/w", title = "直す"),
                "b" to WasRunningMark(),
            )
        assertEquals(marks, WasRunningMarks.decode(WasRunningMarks.encode(marks)))
    }

    @Test
    fun oldMarksStillRead() {
        assertEquals(mapOf("a" to WasRunningMark(), "b" to WasRunningMark()), WasRunningMarks.decode("""["a","b"]"""))
        // A mark of the project's own folder is still written the old way.
        assertEquals("""["b"]""", WasRunningMarks.encode(mapOf("b" to WasRunningMark())))
        assertEquals(emptyMap<String, WasRunningMark>(), WasRunningMarks.decode("{broken"))
        assertEquals(mapOf("c" to WasRunningMark()), WasRunningMarks.decode("""[{"id":"c"}, {"dir":"/x"}, 3]"""))
    }
}
