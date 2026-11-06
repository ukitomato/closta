package dev.ukitomato.closta.platforms.intellij.session

import dev.ukitomato.closta.providers.claude.FakeSavedSessions
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** A listing that fails is a list that could not be read, also when the IDE's file system fails with an Error. */
class SessionListingTest {
    private val log = RecordingLog()

    @Test
    fun `an operation the file system does not implement is a list that could not be read, not a crash`() =
        runBlocking {
            val saved =
                FakeSavedSessions().apply {
                    listFailure = NotImplementedError("An operation is not implemented: READ + NOFOLLOW_LINKS")
                }

            val listed = listing(saved, "the-current-id", log)

            assertTrue(listed.unreadable)
            assertEquals(emptyList<Any>(), listed.sessions)
            assertTrue(log.lines.single().contains("kotlin.NotImplementedError"))
            assertTrue(log.lines.none { "NOFOLLOW_LINKS" in it }, "only the type of the failure is logged")
        }
}
