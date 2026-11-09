package dev.ukitomato.closta.core.models

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Test

/** An attachment says its kind and its size, and nothing the user gave. */
class AttachmentTest {
    @Test
    fun `toString names neither the file nor its bytes`() {
        val attachment =
            Attachment(AttachmentKind.TEXT, "text/plain", "private-notes.txt", "the secret body".toByteArray())

        val text = attachment.toString()

        assertEquals("Attachment(TEXT, 15 bytes)", text)
        assertFalse(text.contains("private-notes"))
        assertFalse(text.contains("secret"))
    }

    @Test
    fun `equality is by content`() {
        val first = Attachment(AttachmentKind.IMAGE, "image/png", "a.png", byteArrayOf(1, 2))

        assertEquals(first, Attachment(AttachmentKind.IMAGE, "image/png", "a.png", byteArrayOf(1, 2)))
        assertEquals(
            first.hashCode(),
            Attachment(AttachmentKind.IMAGE, "image/png", "a.png", byteArrayOf(1, 2)).hashCode(),
        )
        assertNotEquals(first, Attachment(AttachmentKind.IMAGE, "image/png", "a.png", byteArrayOf(1, 3)))
        assertNotEquals(first, Attachment(AttachmentKind.IMAGE, "image/png", "b.png", byteArrayOf(1, 2)))
    }

    @Test
    fun `the path it came from counts in equality but is never said`() {
        val from =
            Attachment(AttachmentKind.TEXT, "text/plain", "a.txt", byteArrayOf(1), path = "/home/me/secret/a.txt")

        assertEquals("/home/me/secret/a.txt", from.path)
        assertFalse(from.toString().contains("secret"))
        assertNotEquals(from, Attachment(AttachmentKind.TEXT, "text/plain", "a.txt", byteArrayOf(1)))
        assertEquals(null, Attachment(AttachmentKind.TEXT, "text/plain", "a.txt", byteArrayOf(1)).path)
    }
}
