package dev.ukitomato.closta.providers.claude.launch

import java.io.ByteArrayInputStream
import java.io.InputStream
import java.io.OutputStream
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

/**
 * A [Process] with no OS process behind it, for tests of what is done with a process. Its stdout is [output] and then
 * the end, or — with [holdsOutput] — nothing until [destroy] (a process that says nothing, as a hung shell). [destroy]
 * is counted. An already finished process (the default) answers [exitValue] at once.
 */
class ScriptedProcess(
    output: String = "",
    private val code: Int = 0,
    private val holdsOutput: Boolean = false,
) : Process() {
    private val destroyed = CountDownLatch(1)
    private val destroys = AtomicInteger()

    private val stdout: InputStream =
        if (holdsOutput) {
            object : InputStream() {
                override fun read(): Int {
                    destroyed.await()
                    return -1
                }
            }
        } else {
            ByteArrayInputStream(output.toByteArray())
        }

    /** How many times [destroy] was called. */
    val destroyCount: Int get() = destroys.get()

    override fun getOutputStream(): OutputStream = OutputStream.nullOutputStream()

    override fun getInputStream(): InputStream = stdout

    override fun getErrorStream(): InputStream = ByteArrayInputStream(ByteArray(0))

    override fun waitFor(): Int = code

    override fun waitFor(
        timeout: Long,
        unit: TimeUnit,
    ): Boolean = true

    override fun exitValue(): Int = code

    override fun destroy() {
        destroys.incrementAndGet()
        destroyed.countDown()
    }

    override fun isAlive(): Boolean = false
}
