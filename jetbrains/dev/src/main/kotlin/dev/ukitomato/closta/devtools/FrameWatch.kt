package dev.ukitomato.closta.devtools

import javax.swing.Timer

/**
 * Watches the EDT with a 16ms timer: each tick that comes late was held up by something on the EDT. The lateness of
 * every tick is kept until [reset], and [quietFor] says whether the EDT has been free for a while.
 */
class FrameWatch {
    private val late = mutableListOf<Long>()
    private var last = System.nanoTime()
    private var lastBusy = System.nanoTime()
    private val timer =
        Timer(TICK_MS.toInt()) {
            val now = System.nanoTime()
            val behind = (now - last) / NANOS_PER_MS - TICK_MS
            last = now
            late += behind.coerceAtLeast(0)
            if (behind > BUSY_MS) lastBusy = now
        }

    fun start() {
        last = System.nanoTime()
        timer.start()
    }

    fun stop() = timer.stop()

    fun reset() {
        late.clear()
        lastBusy = System.nanoTime()
    }

    /** When the EDT was last held up, by [System.nanoTime]. */
    fun lastBusyAt(): Long = lastBusy

    fun quietFor(millis: Long): Boolean = (System.nanoTime() - lastBusy) / NANOS_PER_MS >= millis

    fun stats(): Stats = Stats.of(late.toList())

    data class Stats(
        val count: Int,
        val p99: Long,
        val max: Long,
        val over50: Int,
    ) {
        companion object {
            fun of(values: List<Long>): Stats {
                if (values.isEmpty()) return Stats(0, 0, 0, 0)
                val sorted = values.sorted()
                return Stats(
                    sorted.size,
                    sorted[(sorted.size * P99 / PERCENT).coerceAtMost(sorted.size - 1)],
                    sorted.last(),
                    sorted.count {
                        it >
                            STALL_MS
                    },
                )
            }
        }
    }

    companion object {
        const val TICK_MS = 16L
        const val NANOS_PER_MS = 1_000_000L
        private const val BUSY_MS = 8L
        private const val STALL_MS = 50L
        private const val P99 = 99
        private const val PERCENT = 100
    }
}
