package dev.ukitomato.closta.providers.claude.protocol

import com.google.gson.JsonArray
import com.google.gson.JsonElement
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import dev.ukitomato.closta.core.models.Attachment
import dev.ukitomato.closta.core.models.AttachmentKind
import dev.ukitomato.closta.providers.claude.fixtures.CaptureFixtures
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.util.Base64

/**
 * The write direction for attachments. The line to match is the one the recorder wrote to the CLI's
 * stdin in capture 23 (`23-attachments.stdin.jsonl`), the CLI that answered `Red` and `KIWI` to them: its keys, their
 * types and their order.
 */
class StdinAttachmentsTest {
    private val captured: List<JsonObject> =
        CaptureFixtures
            .nonBlankLines(CaptureFixtures.textOf(STDIN))
            .map { JsonParser.parseString(it).asJsonObject }
            .filter { it["type"].asString == "user" }

    private fun blocks(line: JsonObject): JsonArray = line["message"].asJsonObject["content"].asJsonArray

    private fun block(
        line: JsonObject,
        type: String,
    ): JsonObject = blocks(line).map { it.asJsonObject }.single { it["type"].asString == type }

    private fun bytesOf(block: JsonObject): ByteArray =
        Base64.getDecoder().decode(block["source"].asJsonObject["data"].asString)

    /** Keys in order, down the whole tree, with the value kept only where it is a type name or a short fixed word. */
    private fun shape(element: JsonElement): Any =
        when {
            element.isJsonObject -> element.asJsonObject.entrySet().map { it.key to shape(it.value) }
            element.isJsonArray -> element.asJsonArray.map { shape(it) }
            else -> if (element.isJsonPrimitive && element.asJsonPrimitive.isString) "string" else element.toString()
        }

    private fun encode(
        line: JsonObject,
        attachments: List<Attachment>,
    ): String {
        val text = block(line, "text")["text"].asString
        val written = StdinEncoder.userMessage(line["session_id"].asString, line["uuid"].asString, text, attachments)
        // The capture predates the `origin` mark: compare without it.
        val unmarked = JsonParser.parseString(written).asJsonObject.apply { remove("origin") }
        return unmarked.toString()
    }

    @Test
    fun `the capture holds two turns, the first with an image and the second with a PDF, and a text each`() {
        assertEquals(2, captured.size)
        assertEquals(listOf("image", "text"), blocks(captured[0]).map { it.asJsonObject["type"].asString })
        assertEquals(listOf("document", "text"), blocks(captured[1]).map { it.asJsonObject["type"].asString })
        assertEquals("image/png", block(captured[0], "image")["source"].asJsonObject["media_type"].asString)
        assertEquals("application/pdf", block(captured[1], "document")["source"].asJsonObject["media_type"].asString)
    }

    @Test
    fun `an image with a sentence is written as the recorder wrote it to the CLI`() {
        val line = captured[0]
        val image = Attachment(AttachmentKind.IMAGE, "image/png", "red.png", bytesOf(block(line, "image")))

        val written = encode(line, listOf(image))

        assertEquals(line.toString(), written, "byte for byte: keys, types and order")
        assertEquals(shape(line), shape(JsonParser.parseString(written)), "the shape, down every level")
    }

    @Test
    fun `a PDF with a sentence is written as the recorder wrote it to the CLI`() {
        val line = captured[1]
        val pdf = Attachment(AttachmentKind.DOCUMENT, "application/pdf", "kiwi.pdf", bytesOf(block(line, "document")))

        val written = encode(line, listOf(pdf))

        assertEquals(line.toString(), written, "byte for byte: keys, types and order")
        assertEquals(shape(line), shape(JsonParser.parseString(written)), "the shape, down every level")
    }

    @Test
    fun `without attachments the content is the text itself, as before`() {
        val plain = StdinEncoder.userMessage("S", "U", "hello")

        assertEquals(plain, StdinEncoder.userMessage("S", "U", "hello", emptyList()))
        val content = JsonParser.parseString(plain).asJsonObject["message"].asJsonObject["content"]
        assertTrue(content.isJsonPrimitive && content.asJsonPrimitive.isString, "a string, not an array")
    }

    @Test
    fun `attachments come first in the order given and the text is last, a text file as a named sentence`() {
        val image = Attachment(AttachmentKind.IMAGE, "image/jpeg", "a.jpg", byteArrayOf(1, 2, 3))
        val notes = Attachment(AttachmentKind.TEXT, "text/plain", "notes.txt", "line one\nこんにちは".toByteArray())
        val pdf = Attachment(AttachmentKind.DOCUMENT, "application/pdf", "b.pdf", byteArrayOf(4, 5))

        val content =
            JsonParser
                .parseString(StdinEncoder.userMessage("S", "U", "the question", listOf(image, notes, pdf)))
                .asJsonObject["message"]
                .asJsonObject["content"]
                .asJsonArray
                .map { it.asJsonObject }

        assertEquals(listOf("image", "text", "document", "text"), content.map { it["type"].asString })
        assertEquals("image/jpeg", content[0]["source"].asJsonObject["media_type"].asString)
        assertEquals("AQID", content[0]["source"].asJsonObject["data"].asString)
        assertEquals("notes.txt\n\nline one\nこんにちは", content[1]["text"].asString)
        assertEquals("application/pdf", content[2]["source"].asJsonObject["media_type"].asString)
        assertEquals("the question", content[3]["text"].asString)
    }

    @Test
    fun `files with no words are sent with no block of text, and words with no files are still the string`() {
        val image = Attachment(AttachmentKind.IMAGE, "image/png", "a.png", byteArrayOf(1))

        val content =
            JsonParser
                .parseString(StdinEncoder.userMessage("S", "U", "", listOf(image)))
                .asJsonObject["message"]
                .asJsonObject["content"]
                .asJsonArray

        assertEquals(listOf("image"), content.map { it.asJsonObject["type"].asString })
        val plain = JsonParser.parseString(StdinEncoder.userMessage("S", "U", "")).asJsonObject["message"].asJsonObject
        assertEquals("", plain["content"].asString, "a message with no files and no words is the empty string it was")
    }

    @Test
    fun `a text file that is not UTF-8 is refused, and the failure says nothing of its name or its bytes`() {
        val bad = Attachment(AttachmentKind.TEXT, "text/plain", "secret-name.txt", byteArrayOf(0x68, 0xC3.toByte()))

        val failure =
            assertThrows(IllegalArgumentException::class.java) { StdinEncoder.userMessage("S", "U", "q", listOf(bad)) }

        assertFalse(failure.message.orEmpty().contains("secret-name"), "no name in the message")
        assertEquals("a text attachment is not UTF-8", failure.message)
    }

    private companion object {
        const val STDIN = "23-attachments.stdin.jsonl"
    }
}
