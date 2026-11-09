package dev.ukitomato.closta.platforms.intellij.session

import dev.ukitomato.closta.core.models.Attachment
import dev.ukitomato.closta.core.models.AttachmentKind
import dev.ukitomato.closta.core.services.FixedClock
import dev.ukitomato.closta.core.services.RecordingAgentSession
import dev.ukitomato.closta.presenter.view.AttachmentRecord
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.time.Instant

/** The thread keeps where a sent file was, when it came from one, so its label can open it. */
class SessionCommandsAttachmentTest {
    @Test
    fun `a file's path goes into the thread's record of it, and a pasted image has none`() =
        runBlocking {
            val store = ConversationStore()
            val commands = SessionCommands(RecordingAgentSession(), FixedClock(Instant.EPOCH), store)
            val file = Attachment(AttachmentKind.TEXT, "text/plain", "a.txt", byteArrayOf(1), path = "/work/a.txt")
            val pasted = Attachment(AttachmentKind.IMAGE, "image/png", "shot.png", byteArrayOf(2))

            commands.sendMessage("send-1", "look", listOf(file, pasted))

            val kept =
                store.view.value.transcript.messages
                    .values()
                    .flatMap { it.parts.values().filterIsInstance<AttachmentRecord>() }
            assertEquals(listOf("/work/a.txt", null), kept.map { it.path })
        }
}
