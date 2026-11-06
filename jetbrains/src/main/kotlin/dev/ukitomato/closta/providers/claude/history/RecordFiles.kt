package dev.ukitomato.closta.providers.claude.history

import java.io.BufferedInputStream
import java.io.IOException
import java.io.InputStream
import java.nio.channels.Channels
import java.nio.channels.SeekableByteChannel
import java.nio.file.Files
import java.nio.file.LinkOption
import java.nio.file.OpenOption
import java.nio.file.Path
import java.nio.file.StandardOpenOption
import java.nio.file.attribute.BasicFileAttributes

/** How a record is opened to be read: never through a link, and never more than a bounded part of it. */
internal object RecordFiles {
    /** The bytes of a record from [input], and whether the oldest part of it was left unread. */
    class Opened(
        val input: InputStream,
        val oldestUnread: Boolean,
    )

    /** Opens a channel to read: [Files.newByteChannel] unless a test stands in for a file system. */
    fun interface Opener {
        fun open(
            path: Path,
            options: Set<OpenOption>,
        ): SeekableByteChannel
    }

    private const val NEWLINE = '\n'.code
    private val SYSTEM = Opener { path, options -> Files.newByteChannel(path, options) }

    /**
     * Opens [path] to be read from its first line, or from the first whole line of its newest [maxBytes] when it is
     * bigger. The lines before were never read, so they cannot be counted: the caller says that older ones were left
     * out. A link is not followed: nothing outside the place is read.
     */
    fun open(
        path: Path,
        maxBytes: Long,
        opener: Opener = SYSTEM,
    ): Opened {
        val channel = channelOf(path, opener)
        try {
            val size = channel.size()
            val cut = size > maxBytes
            if (cut) channel.position(size - maxBytes)
            val input = BufferedInputStream(Channels.newInputStream(channel))
            // The first line of the part read began before it: what is left of it is not a line.
            if (cut) skipLine(input)
            return Opened(input, cut)
        } catch (
            @Suppress("TooGenericExceptionCaught") failure: Throwable,
        ) {
            channel.close()
            throw failure
        }
    }

    /** Opens [path] to read its first lines only (a title), through no link. */
    fun openHead(
        path: Path,
        opener: Opener = SYSTEM,
    ): InputStream = Channels.newInputStream(channelOf(path, opener))

    /**
     * A channel on [path] that did not go through a link. The IDE's file system for a WSL path (Ijent) cannot open with
     * [LinkOption.NOFOLLOW_LINKS] and says so with [NotImplementedError]: there, the file is first seen, without
     * following a link, to be a regular file, and only then opened.
     */
    private fun channelOf(
        path: Path,
        opener: Opener,
    ): SeekableByteChannel =
        try {
            opener.open(path, setOf(StandardOpenOption.READ, LinkOption.NOFOLLOW_LINKS))
        } catch (ignoredUnsupported: UnsupportedOperationException) {
            openSeenRegular(path, opener)
        } catch (ignoredNotImplemented: NotImplementedError) {
            openSeenRegular(path, opener)
        }

    private fun openSeenRegular(
        path: Path,
        opener: Opener,
    ): SeekableByteChannel {
        val attributes = Files.readAttributes(path, BasicFileAttributes::class.java, LinkOption.NOFOLLOW_LINKS)
        if (!attributes.isRegularFile) throw IOException("not a regular file, not read")
        return opener.open(path, setOf(StandardOpenOption.READ))
    }

    private fun skipLine(input: InputStream) {
        do {
            val next = input.read()
        } while (next >= 0 && next != NEWLINE)
    }
}
