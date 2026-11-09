package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AttachmentKind
import dev.ukitomato.closta.presenter.tree.JsonNumber
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonString
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Test

/** What the thread keeps of a file the user sent: its point, in the tree's words, never its name in a log. */
class AttachmentRecordsTest {
    @Test
    fun `a file is a part of its own kind with its name, kind, type and size, and nothing else`() {
        val node = attachmentNode(AttachmentRecord("shot.png", AttachmentKind.IMAGE, "image/png", 73))

        assertEquals(
            JsonObject.of(
                "type" to JsonString("attachment"),
                "name" to JsonString("shot.png"),
                "kind" to JsonString("image"),
                "mediaType" to JsonString("image/png"),
                "size" to JsonNumber.of(73),
            ),
            node,
        )
        assertEquals(
            "document",
            attachmentNode(
                AttachmentRecord("a.pdf", AttachmentKind.DOCUMENT, "application/pdf", 1),
            )["kind"]?.let {
                (it as JsonString).value
            },
        )
        assertEquals(
            "text",
            attachmentNode(
                AttachmentRecord("a.txt", AttachmentKind.TEXT, "text/plain", 1),
            )["kind"]?.let {
                (it as JsonString).value
            },
        )
    }

    @Test
    fun `a block the CLI wrote named like a part this version knows is unknown, and one that is not keeps its name`() {
        for (known in listOf("text", "reasoning", "tool-call", "attachment", "")) {
            assertEquals(
                JsonObject.of("type" to JsonString("unknown")),
                otherNode(OtherRecord(known)),
                "'$known' claims fields it lacks",
            )
        }
        assertEquals(
            JsonObject.of("type" to JsonString("redacted_thinking")),
            otherNode(OtherRecord("redacted_thinking")),
        )
    }

    @Test
    fun `a record says its kind and size, never its name`() {
        val text = AttachmentRecord("private-notes.txt", AttachmentKind.TEXT, "text/plain", 5).toString()

        assertEquals("AttachmentRecord(TEXT, 5 bytes)", text)
        assertFalse(text.contains("private"))
    }

    @Test
    fun `a refusal is one record that is over at once under its own id, and a second with that id changes nothing`() {
        val first =
            OperationRecords().refuseAttachment(
                PresenterInput.AttachmentRefused("r1", AttachmentRefusal.TOO_LARGE),
            )
        val again = first.refuseAttachment(PresenterInput.AttachmentRefused("r1", AttachmentRefusal.MISSING))

        val record = first.switches.single()
        assertEquals(SwitchKind.ATTACHMENT, record.kind)
        assertEquals(SwitchOutcome.REJECTED, record.outcome)
        assertEquals("too-large", record.value)
        assertEquals(null, record.detail)
        assertEquals(first, again)
        assertEquals(
            listOf(
                "missing",
                "too-large",
                "too-many",
                "unsupported",
                "not-text",
            ),
            AttachmentRefusal.entries.map {
                it.wire
            },
        )
    }

    @Test
    fun aRecordKeepsWhereTheFileWasButNeverSaysIt() {
        val record = AttachmentRecord("a.txt", AttachmentKind.TEXT, "text/plain", 1, path = "/home/me/secret/a.txt")

        assertEquals("/home/me/secret/a.txt", record.path)
        assertFalse(record.toString().contains("secret"))
        assertFalse(attachmentNode(record).toString().contains("secret"))
        assertEquals(null, AttachmentRecord("a.txt", AttachmentKind.TEXT, "text/plain", 1).path)
    }
}
