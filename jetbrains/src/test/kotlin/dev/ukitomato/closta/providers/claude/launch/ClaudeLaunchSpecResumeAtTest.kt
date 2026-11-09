package dev.ukitomato.closta.providers.claude.launch

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

/** The cut point of a rewound fork. */
class ClaudeLaunchSpecResumeAtTest {
    private val old = "336ed47b-2675-4317-b3f5-a3b48abb03a2"
    private val new = "aaaaaaaa-2675-4317-b3f5-a3b48abb03a2"
    private val cut = "bbbbbbbb-2675-4317-b3f5-a3b48abb03a2"

    @Test
    fun `a fork with a cut point has --resume-session-at right after --session-id`() {
        val argv = ClaudeLaunchSpec(sessionId = new, resume = old, forkSession = true, resumeSessionAt = cut).toArgv()

        val at = argv.indexOf("--resume=$old")
        assertEquals(
            listOf("--resume=$old", "--fork-session", "--session-id=$new", "--resume-session-at=$cut"),
            argv.subList(at, at + 4),
        )
        assertEquals(1, argv.count { it.startsWith("--resume-session-at") })
        assertTrue(
            ClaudeLaunchSpec(sessionId = new, resume = old, forkSession = true, resumeSessionAt = cut)
                .toString()
                .contains("resumeSessionAt=$cut"),
        )
    }

    @Test
    fun `without a cut point the argv is what it was for a resume, a fork and a new session`() {
        val resume = ClaudeLaunchSpec(sessionId = old, resume = old, effort = "high").toArgv()
        val fork = ClaudeLaunchSpec(sessionId = new, resume = old, forkSession = true, effort = "high").toArgv()
        val fresh = ClaudeLaunchSpec(sessionId = new, effort = "high").toArgv()
        assertTrue((resume + fork + fresh).none { it.startsWith("--resume-session-at") })
        // Only the cut flag is added: take it out and the two argvs are equal.
        val cutFork =
            ClaudeLaunchSpec(
                sessionId = new,
                resume = old,
                forkSession = true,
                effort = "high",
                resumeSessionAt = cut,
            ).toArgv()
        assertEquals(fork, cutFork.filterNot { it.startsWith("--resume-session-at") })
        assertFalse(fork.contains("--resume-session-at=null"))
    }

    @Test
    fun `a cut point without a resume or without a fork is a mistake of the caller`() {
        assertThrows<IllegalArgumentException> {
            ClaudeLaunchSpec(sessionId = "s", resumeSessionAt = cut).toArgv()
        }
        assertThrows<IllegalArgumentException> {
            ClaudeLaunchSpec(sessionId = old, resume = old, resumeSessionAt = cut).toArgv()
        }
    }
}
