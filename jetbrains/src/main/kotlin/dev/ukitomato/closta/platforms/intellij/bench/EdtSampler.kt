package dev.ukitomato.closta.platforms.intellij.bench

import java.lang.management.ManagementFactory

/**
 * A small sampling profiler of the EDT: every few milliseconds it takes the EDT's stack, and when the EDT is not
 * waiting for its next event it counts the methods on the stack. The counts say where a stall was spent (painting,
 * laying out, making components, collecting garbage…). Only code names are kept, never what is on screen.
 */
class EdtSampler(
    private val edt: Thread,
) {
    @Volatile private var running = true

    @Volatile private var recording = false
    private val lock = Any()
    private var samples = 0
    private var busy = 0
    private val inclusive = HashMap<String, Int>()
    private val self = HashMap<String, Int>()
    private var gcAtReset = gcMillis()

    private val thread =
        Thread({
            while (running) {
                if (recording) sample()
                Thread.sleep(SAMPLE_MS)
            }
        }, "Closta EDT sampler").apply { isDaemon = true }

    fun start() = thread.start()

    fun stop() {
        running = false
    }

    /** Starts counting afresh. */
    fun reset() {
        synchronized(lock) {
            samples = 0
            busy = 0
            inclusive.clear()
            self.clear()
            gcAtReset = gcMillis()
        }
        recording = true
    }

    /** Stops counting and gives what was counted since [reset], as Markdown lines. */
    fun report(title: String): List<String> {
        recording = false
        synchronized(lock) {
            val gc = gcMillis() - gcAtReset
            val head = "- $title: samples with the EDT busy $busy / $samples (about ${SAMPLE_MS}ms each), GC ${gc}ms"
            if (busy == 0) return listOf(head)
            val ceiling = busy * COMMON_PERCENT / PERCENT
            val hot =
                inclusive.entries
                    .filter { it.value < ceiling }
                    .sortedByDescending { it.value }
                    .take(TOP_INCLUSIVE)
                    .joinToString(", ") { "${it.key} ${it.value * PERCENT / busy}%" }
            val tops =
                self.entries
                    .sortedByDescending { it.value }
                    .take(TOP_SELF)
                    .joinToString(", ") { "${it.key} ${it.value * PERCENT / busy}%" }
            return listOf(head, "  - On the stack: $hot", "  - On top: $tops")
        }
    }

    private fun sample() {
        val stack = edt.stackTrace
        val idle = stack.isEmpty() || stack.any { it.methodName == "getNextEvent" }
        synchronized(lock) {
            samples++
            if (idle) return
            busy++
            self.merge(name(stack[0]), 1, Int::plus)
            stack.mapTo(HashSet()) { name(it) }.forEach { inclusive.merge(it, 1, Int::plus) }
        }
    }

    private fun name(frame: StackTraceElement): String =
        "${frame.className.substringAfterLast('.')}.${frame.methodName}"

    private companion object {
        const val SAMPLE_MS = 5L
        const val TOP_INCLUSIVE = 14
        const val TOP_SELF = 6
        const val PERCENT = 100
        const val COMMON_PERCENT = 90

        fun gcMillis(): Long =
            ManagementFactory.getGarbageCollectorMXBeans().sumOf { it.collectionTime.coerceAtLeast(0) }
    }
}
