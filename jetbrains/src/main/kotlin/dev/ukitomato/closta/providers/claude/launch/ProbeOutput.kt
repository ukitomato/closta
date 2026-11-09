package dev.ukitomato.closta.providers.claude.launch

import java.io.IOException
import java.io.OutputStream
import java.util.concurrent.ExecutionException
import java.util.concurrent.FutureTask
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException

/**
 * Reads the output of a short question put to a process (such as where the CLI keeps its records), within a time.
 * Free of `com.intellij`, so a fake [Process] measures it. A blocking read cannot be interrupted by a wait, so stdout
 * is read on a thread of its own and handed over through a [FutureTask] (the result crosses threads with a
 * happens-before); stderr is read away so that a full pipe cannot hold the process.
 */
@Suppress("SwallowedException") // every way to no answer is a null, and the caller says why
object ProbeOutput {
    /** The most bytes of stdout that are kept. */
    const val MAX_BYTES = 64 * 1024

    /**
     * What [process] printed on stdout (at most [maxBytes], read as UTF-8), or null when it did not finish printing
     * within [timeoutMillis] or the read failed. Blocks for at most that long. The process is destroyed on every way
     * out.
     */
    fun within(
        process: Process,
        timeoutMillis: Long,
        maxBytes: Int = MAX_BYTES,
    ): String? {
        try {
            daemon { process.errorStream.use { it.copyTo(OutputStream.nullOutputStream()) } }
            val read = FutureTask { process.inputStream.use { it.readNBytes(maxBytes).toString(Charsets.UTF_8) } }
            start(read)
            return try {
                read.get(timeoutMillis, TimeUnit.MILLISECONDS)
            } catch (late: TimeoutException) {
                read.cancel(true)
                null
            } catch (failed: ExecutionException) {
                null
            } catch (interrupted: InterruptedException) {
                Thread.currentThread().interrupt()
                null
            }
        } finally {
            process.destroy()
        }
    }

    private fun daemon(block: () -> Unit) =
        start(
            Runnable {
                try {
                    block()
                } catch (ignored: IOException) {
                    // a closed pipe ends the read
                }
            },
        )

    private fun start(task: Runnable) =
        Thread(task).also {
            it.isDaemon = true
            it.start()
        }
}
