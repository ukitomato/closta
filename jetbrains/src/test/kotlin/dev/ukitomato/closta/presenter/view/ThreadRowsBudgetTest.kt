package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.platforms.intellij.session.SessionView
import dev.ukitomato.closta.providers.claude.protocol.StreamJsonCodec
import dev.ukitomato.closta.providers.claude.synthetic.ReplayScript
import dev.ukitomato.closta.providers.claude.synthetic.SyntheticSession
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test

/**
 * The performance the rows promise on the largest session the user has had (200 requests, 2,000 tool calls): building
 * them all fits in a budget, and while a reply streams in at the end, an update makes new rows only for the last
 * message, so a surface paints only those.
 */
class ThreadRowsBudgetTest {
    private val history: SessionView by lazy {
        SyntheticSession.turns().foldIndexed(SessionView()) { index, view, turn ->
            turn.lines.fold(view.sent(PresenterInput.UserSent("u$index", turn.prompt))) { next, line ->
                next.event(PresenterInput.Event(StreamJsonCodec.decode(line)))
            }
        }
    }

    private fun millis(block: () -> Unit): Double {
        val start = System.nanoTime()
        block()
        return (System.nanoTime() - start) / NANOS_PER_MS
    }

    /** The middle value; it assumes an odd number of runs. */
    private fun median(values: List<Double>): Double = values.sorted()[values.size / 2]

    private fun report(
        case: String,
        median: Double,
        runs: List<Double>,
    ) = println("perf $case median=${"%.3f".format(median)}ms runs=${runs.map { "%.3f".format(it) }}")

    @Tag("perf")
    @Test
    fun largestSessionBuildsWithinBudget() {
        repeat(WARM_UP) { ThreadRows().of(history.transcript) }
        val runs = List(RUNS) { millis { ThreadRows().of(history.transcript) } }
        val took = median(runs)
        report("largestSessionBuilds", took, runs)
        assertTrue(took <= BUILD_BUDGET_MS, "building every row took ${took}ms (budget ${BUILD_BUDGET_MS}ms)")
    }

    private fun tailLines(): List<String> =
        ReplayScript.lines(javaClass.getResource("/bench/replay-reply.md")!!.readText(), sessionId = "budget")

    @Test
    fun streamingTailRebuildsOnlyTheLastMessage() {
        val rows = ThreadRows()
        var view = history.sent(PresenterInput.UserSent("tail", "続けて"))
        var before = rows.of(view.transcript)
        for (line in tailLines()) {
            view = view.event(PresenterInput.Event(StreamJsonCodec.decode(line)))
            val after = rows.of(view.transcript)
            val lastKey =
                view.transcript.messages.order
                    .last()
            val remade = after.filter { row -> before.none { it === row } }
            assertTrue(
                remade.all { it.key.substringBefore('/') == lastKey },
                "an update remade rows outside the last message: ${remade.map { it.key }}",
            )
            before = after
        }
    }

    @Tag("perf")
    @Test
    fun streamingTailUpdatesWithinBudget() {
        val tail = tailLines()
        val rows = ThreadRows()

        fun round(id: String): Double {
            var view = history.sent(PresenterInput.UserSent(id, "続けて"))
            rows.of(view.transcript)
            val times =
                tail.map { line ->
                    view = view.event(PresenterInput.Event(StreamJsonCodec.decode(line)))
                    millis { rows.of(view.transcript) }
                }
            return times.sorted()[times.size * P99 / PERCENT]
        }
        round("tailWarmUp")
        val runs = List(RUNS) { round("tail$it") }
        val p99 = median(runs)
        report("streamingTailUpdateP99", p99, runs)
        assertTrue(p99 <= UPDATE_BUDGET_MS, "an update took ${p99}ms at p99 (budget ${UPDATE_BUDGET_MS}ms)")
    }

    private companion object {
        const val WARM_UP = 3
        const val RUNS = 5
        const val BUILD_BUDGET_MS = 300.0
        const val UPDATE_BUDGET_MS = 5.0
        const val NANOS_PER_MS = 1_000_000.0
        const val P99 = 99
        const val PERCENT = 100
    }
}
