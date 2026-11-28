package dev.ukitomato.closta.platforms.intellij.chat

import dev.ukitomato.closta.platforms.intellij.session.AnswerNotRecorded
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.IOException

class AnsweringTest {
    private val failed = mutableListOf<String>()
    private val logged = mutableListOf<String>()

    private fun answer(thrown: Exception?): Boolean =
        runBlocking {
            answerOrMarkFailed({ if (thrown != null) throw thrown }, { failed += "r1" }, { logged += it })
        }

    @Test
    fun aWriteThatFailsMarksTheCard() {
        assertFalse(answer(IOException("pipe closed")))
        assertEquals(listOf("r1"), failed)
        assertEquals(listOf("chat: an answer could not be passed on (java.io.IOException)"), logged)
    }

    @Test
    fun anAnswerTheCliTookIsNotAFailure() {
        assertTrue(answer(AnswerNotRecorded(IllegalStateException())), "the CLI has it")
        assertEquals(emptyList<String>(), failed)
    }

    @Test
    fun anAnswerThatWentThroughChangesNothing() {
        assertTrue(answer(null))
        assertEquals(emptyList<String>(), failed)
        assertEquals(emptyList<String>(), logged)
    }
}
