package dev.ukitomato.closta.platforms.intellij.session

import dev.ukitomato.closta.providers.claude.launch.ProcessSpawner
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

/**
 * A [Process] with no OS process behind it: the test writes its stdout, reads what was written to its stdin, and ends
 * it. [destroy] is recorded and ends the process the way a signal would — its output reaches end of stream and
 * [waitFor] returns. `ProcessAgentProcess` and `ClaudeSession` run unchanged on top of it.
 */
class FakeProcess(
    private val exitCodeOnDestroy: Int = SIGTERM_EXIT,
    /**
     * False for a process that closes its pipes on [destroy] but whose [waitFor] does not return until [exit]:
     * the test's way to a process that does not end when it is told to. [exit] must run before the test ends, or the
     * thread blocked in [waitFor] is left behind.
     */
    private val endsOnDestroy: Boolean = true,
    /** When set, [waitFor] throws it once the process was destroyed: a wait for the end that fails. */
    private val waitFails: Exception? = null,
    /** True for a process that ends when it is killed with [destroyForcibly]; false keeps it running. */
    private val endsOnKill: Boolean = false,
    /** When set, [destroyForcibly] throws it after counting the call: a kill that fails. */
    private val killFails: RuntimeException? = null,
) : Process() {
    private val stdout = QueueInputStream()
    private val stderr = QueueInputStream()
    private val stdin = RecordingOutputStream()
    private val exited = CountDownLatch(1)

    @Volatile
    private var exitCode: Int? = null

    @Volatile
    var destroyed: Boolean = false
        private set

    /** The lines written to stdin so far. */
    fun stdinLines(): List<String> =
        stdin
            .text()
            .lineSequence()
            .filter { it.isNotEmpty() }
            .toList()

    /** Blocks until the next complete stdin line arrives, or returns null after [timeoutMillis]. */
    fun nextStdinLine(timeoutMillis: Long): String? = stdin.lines.poll(timeoutMillis, TimeUnit.MILLISECONDS)

    /** Writes one line to stdout. */
    fun emit(line: String) = stdout.push("$line\n".toByteArray())

    /** Ends the process with [code]: stdout and stderr end, then [waitFor] returns. */
    fun exit(code: Int) = finish(code)

    private val kills = AtomicInteger()

    /** How many times [destroyForcibly] was called. */
    val forceKills: Int get() = kills.get()

    override fun destroyForcibly(): Process {
        kills.incrementAndGet()
        killFails?.let { throw it }
        if (endsOnKill) finish(SIGKILL_EXIT)
        return this
    }

    override fun destroy() {
        destroyed = true
        if (endsOnDestroy) {
            finish(exitCodeOnDestroy)
        } else {
            stdout.end()
            stderr.end()
            stdin.close()
        }
    }

    private fun finish(code: Int) {
        synchronized(this) {
            if (exitCode != null) return
            exitCode = code
        }
        stdout.end()
        stderr.end()
        stdin.close()
        exited.countDown()
    }

    override fun getOutputStream(): OutputStream = stdin

    override fun getInputStream(): InputStream = stdout

    override fun getErrorStream(): InputStream = stderr

    override fun waitFor(): Int {
        if (destroyed) waitFails?.let { throw it }
        exited.await()
        return checkNotNull(exitCode)
    }

    override fun waitFor(
        timeout: Long,
        unit: TimeUnit,
    ): Boolean = exited.await(timeout, unit)

    override fun exitValue(): Int = exitCode ?: throw IllegalThreadStateException("still running")

    override fun isAlive(): Boolean = exitCode == null

    companion object {
        /** What a shell reports for a process ended by SIGTERM. */
        const val SIGTERM_EXIT = 143

        /** What a shell reports for a process ended by SIGKILL. */
        const val SIGKILL_EXIT = 137

        /** A process that prints [output] and exits with [code] at once — the shape of `claude --version`. */
        fun finished(
            output: String,
            code: Int = 0,
        ): FakeProcess =
            FakeProcess().apply {
                if (output.isNotEmpty()) stdout.push(output.toByteArray())
                exit(code)
            }
    }
}

/** An input stream fed by the test; reads block until bytes or the end arrive, like a pipe. */
private class QueueInputStream : InputStream() {
    private val bytes = LinkedBlockingQueue<Int>()

    fun push(data: ByteArray) = data.forEach { bytes.put(it.toInt() and BYTE_MASK) }

    fun end() = bytes.put(END)

    override fun read(): Int {
        val next = bytes.take()
        if (next == END) bytes.put(END)
        return next
    }

    // Returns what has arrived once at least one byte is there, as a pipe does; the default would wait for len bytes.
    override fun read(
        buffer: ByteArray,
        offset: Int,
        length: Int,
    ): Int {
        val first = if (length == 0) null else read()
        return when (first) {
            null -> 0
            END -> END
            else -> {
                buffer[offset] = first.toByte()
                1 + readAvailable(buffer, offset + 1, length - 1)
            }
        }
    }

    private fun readAvailable(
        buffer: ByteArray,
        offset: Int,
        length: Int,
    ): Int {
        var count = 0
        while (count < length && bytes.peek().let { it != null && it != END }) {
            buffer[offset + count] = bytes.poll().toByte()
            count++
        }
        return count
    }

    private companion object {
        const val END = -1
        const val BYTE_MASK = 0xFF
    }
}

/** An output stream that keeps what was written, hands on each complete line, and refuses writes once closed. */
private class RecordingOutputStream : OutputStream() {
    private val written = ByteArrayOutputStream()
    private val pending = ByteArrayOutputStream()

    /** Each complete line, in order. */
    val lines = LinkedBlockingQueue<String>()

    @Volatile
    private var closed = false

    fun text(): String = synchronized(written) { written.toString(Charsets.UTF_8) }

    override fun write(byte: Int) {
        if (closed) throw IOException("stdin closed")
        synchronized(written) {
            written.write(byte)
            if (byte == NEWLINE) {
                lines.put(pending.toString(Charsets.UTF_8))
                pending.reset()
            } else {
                pending.write(byte)
            }
        }
    }

    override fun close() {
        closed = true
    }

    private companion object {
        const val NEWLINE = '\n'.code
    }
}

/**
 * A [ProcessSpawner] that records every call and answers it with [answer] — a [FakeProcess], or a thrown exception
 * standing in for a spawn that fails.
 */
class FakeSpawner(
    private val answer: (List<String>) -> Process,
) : ProcessSpawner {
    /** One spawn as the code under test asked for it. */
    data class Call(
        val argv: List<String>,
        val env: Map<String, String>,
        val workingDir: String?,
    )

    val calls: MutableList<Call> = CopyOnWriteArrayList()

    override fun spawn(
        args: List<String>,
        env: Map<String, String>,
        workingDir: String?,
    ): Process {
        calls += Call(args, env, workingDir)
        return answer(args)
    }
}

/** A [SessionLog] that keeps every line. */
class RecordingLog : SessionLog {
    val lines: MutableList<String> = CopyOnWriteArrayList()

    override fun info(message: String) {
        lines += "INFO $message"
    }

    override fun warn(message: String) {
        lines += "WARN $message"
    }
}
