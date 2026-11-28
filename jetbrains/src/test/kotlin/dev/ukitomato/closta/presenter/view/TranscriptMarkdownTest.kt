package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AttachmentKind
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonRead
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** The export's rules on made-up conversations; what a recorded one gives is the goldens'. */
class TranscriptMarkdownTest {
    private fun user(
        key: String,
        vararg parts: PartRecord,
    ) = MessageRecord(key, Role.USER, MessageSource.Sent, parts.toList().keyed())

    private fun reply(
        key: String,
        vararg parts: PartRecord,
    ) = MessageRecord(key, Role.ASSISTANT, MessageSource.Turn("c-$key"), parts.toList().keyed())

    private fun List<PartRecord>.keyed(): Keyed<PartRecord> =
        foldIndexed(Keyed.empty()) { index, all, part -> all.put("p$index", part) }

    private fun transcriptOf(
        vararg messages: MessageRecord,
        withdrawn: Set<String> = emptySet(),
        restored: RestoredRecord? = null,
    ) = Transcript(
        messages = messages.fold(Keyed.empty()) { all, message -> all.put(message.key, message) },
        withdrawn = withdrawn,
        restored = restored,
    )

    private fun export(transcript: Transcript) = transcriptMarkdown(transcript, EXPORT_HEADER, ENGLISH_EXPORT_WORDS)

    private fun input(json: String) = JsonRead.parse(json) as JsonObject

    private fun call(
        name: String,
        input: JsonObject? = null,
        denied: Denial? = null,
        messages: Keyed<MessageRecord> = Keyed.empty(),
    ) = ToolCallRecord("tu-$name", name, input = input, denied = denied, messages = messages)

    @Test
    fun `thinking is left out and the reply is written as it is`() {
        val text =
            export(
                transcriptOf(
                    user("m1", TextRecord(false, "hello")),
                    reply("m2", TextRecord(true, "secret musings"), TextRecord(false, "**fine**")),
                ),
            )
        assertFalse("secret musings" in text)
        assertTrue(text.contains("## You\n\nhello\n\n## Claude\n\n**fine**\n"), text)
    }

    @Test
    fun `a refused call carries the word for denied and a run of calls is one list`() {
        val bash = input("""{"command":"ls"}""")
        val text =
            export(
                transcriptOf(
                    user("m1", TextRecord(false, "go")),
                    reply("m2", call("Bash", bash, Denial("mode", null)), call("Grep", input("""{"pattern":"x"}"""))),
                ),
            )
        assertTrue(text.contains("- Bash(ls) (denied)\n- Grep(x)\n"), text)
    }

    @Test
    fun `a sub-agent is one line with its summary and its own tools are not listed`() {
        val inner = reply("n1", call("Read", input("""{"file_path":"/a/b.kt"}""")))
        val agent =
            call(
                "Agent",
                input("""{"description":"find the bug"}"""),
                messages = Keyed.empty<MessageRecord>().put("n1", inner),
            )
        val text = export(transcriptOf(reply("m1", agent)))
        assertTrue(text.contains("- Subagent: find the bug\n"), text)
        assertFalse("b.kt" in text)
    }

    @Test
    fun `a transcript restored only in part says so on the second line`() {
        val text = export(transcriptOf(restored = RestoredRecord("x", 3, partly = true)))
        assertEquals("# Export test", text.lines()[0])
        assertEquals("> Older messages of this conversation are not included.", text.lines()[1])
        val whole = export(transcriptOf(restored = RestoredRecord("x", 3, partly = false)))
        assertFalse("not included" in whole)
    }

    @Test
    fun `a withdrawn message is marked and the others are not`() {
        val text =
            export(
                transcriptOf(
                    user("m1", TextRecord(false, "never ran")),
                    user("m2", TextRecord(false, "ran")),
                    withdrawn = setOf("m1"),
                ),
            )
        assertTrue(text.contains("## You (withdrawn)\n\nnever ran\n"), text)
        assertTrue(text.contains("## You\n\nran\n"), text)
    }

    @Test
    fun `attachments are lines, notices are quoted, and a clear is a rule with its sentence`() {
        val text =
            export(
                transcriptOf(
                    user(
                        "m1",
                        AttachmentRecord("a.png", AttachmentKind.IMAGE, "image/png", 3),
                        TextRecord(false, "look"),
                    ),
                    reply(
                        "m2",
                        InformationalRecord("i1", "warn", "one\ntwo", false),
                        ClearedRecord("c1", null),
                        TextRecord(false, "after"),
                    ),
                ),
            )
        assertTrue(text.contains("- Attachment: a.png\n\nlook\n"), text)
        assertTrue(text.contains("> one\n> two\n"), text)
        assertTrue(text.contains("---\n\nThe conversation was cleared here.\n\n## Claude\n\nafter\n"), text)
    }

    @Test
    fun `lines end with a line feed, a carriage return is dropped and hidden characters are shown`() {
        val text = export(transcriptOf(user("m1", TextRecord(false, "a\r\nb‮c"))))
        assertFalse('\r' in text)
        assertTrue(text.contains("a\nb<U+202E>c\n"), text)
        assertTrue(text.endsWith("\n") && !text.endsWith("\n\n"))
    }

    @Test
    fun `a model that is not known leaves the model out of the head`() {
        val text = transcriptMarkdown(Transcript(), ExportHeader("T", null, "now"), ENGLISH_EXPORT_WORDS)
        assertEquals("# T\nExported: now\n", text)
        assertEquals("ExportHeader(no model)", ExportHeader("secret", null, "now").toString())
    }

    @Test
    fun `a fence a message leaves open is closed before what follows`() {
        val text =
            export(
                transcriptOf(
                    user("m1", TextRecord(false, "see:\n````kotlin\nval a = 1\n```")),
                    reply("m2", TextRecord(false, "x"), call("Bash", input("""{"command":"ls"}"""))),
                ),
            )
        assertTrue(text.contains("val a = 1\n```\n````\n\n## Claude"), text)
        val closed = export(transcriptOf(user("m1", TextRecord(false, "```\ncode\n```\nafter"))))
        assertTrue(closed.endsWith("```\ncode\n```\nafter\n"), closed)
    }

    @Test
    fun `a message line cannot forge a heading or a rule, and code in a fence is untouched`() {
        val text =
            export(
                transcriptOf(
                    user("m1", TextRecord(false, "## You\ntext\n---\n***\n___\n```\n# comment\n---\n```")),
                ),
            )
        assertTrue(text.contains("\\## You\ntext\n\\---\n\\***\n\\___\n```\n# comment\n---\n```\n"), text)
        assertEquals(1, text.lines().count { it == "## You" })
    }
}
