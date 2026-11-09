package dev.ukitomato.closta.providers.claude.history

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.io.IOException
import java.nio.file.Files
import java.nio.file.LinkOption
import java.nio.file.Path

/**
 * A record is opened through no link, also on a file system that cannot open with NOFOLLOW_LINKS (the IDE's Ijent for a
 * WSL path throws NotImplementedError there).
 */
class RecordFilesTest {
    @TempDir
    lateinit var dir: Path

    private val opened = mutableListOf<Boolean>()

    /** Ijent: opening with NOFOLLOW_LINKS is not implemented, opening without it works. */
    private val ijentLike =
        RecordFiles.Opener { path, options ->
            val noFollow = LinkOption.NOFOLLOW_LINKS in options
            opened += noFollow
            if (noFollow) throw NotImplementedError("An operation is not implemented: READ + NOFOLLOW_LINKS")
            Files.newByteChannel(path, options)
        }

    private fun record(text: String): Path = dir.resolve("a.jsonl").also { Files.writeString(it, text) }

    @Test
    fun `a regular file is read where NOFOLLOW_LINKS cannot be opened`() {
        val file = record("one\ntwo\n")

        assertEquals("one\ntwo\n", RecordFiles.openHead(file, ijentLike).use { String(it.readAllBytes()) })
        val whole = RecordFiles.open(file, maxBytes = 100, opener = ijentLike)
        assertFalse(whole.oldestUnread)
        assertEquals("one\ntwo\n", whole.input.use { String(it.readAllBytes()) })
        assertEquals(listOf(true, false, true, false), opened, "tried through no link first, each time")
    }

    @Test
    fun `the newest part of a big record is read where NOFOLLOW_LINKS cannot be opened`() {
        val file = record("first line\nsecond\nthird\n")

        val cut = RecordFiles.open(file, maxBytes = 10, opener = ijentLike)

        assertTrue(cut.oldestUnread)
        assertEquals("third\n", cut.input.use { String(it.readAllBytes()) })
    }

    @Test
    fun `a link is not read where NOFOLLOW_LINKS cannot be opened`() {
        val elsewhere = Files.createDirectories(dir.resolve("elsewhere"))
        val outside = Files.writeString(elsewhere.resolve("b.jsonl"), "outside\n")
        val link = Files.createSymbolicLink(dir.resolve("link.jsonl"), outside)

        assertThrows(IOException::class.java) { RecordFiles.openHead(link, ijentLike) }
        assertThrows(IOException::class.java) { RecordFiles.open(link, maxBytes = 100, opener = ijentLike) }
        assertEquals(listOf(true, true), opened, "never opened without NOFOLLOW_LINKS")
    }
}
