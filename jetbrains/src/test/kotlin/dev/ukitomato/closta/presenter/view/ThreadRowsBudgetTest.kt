package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.platforms.intellij.session.SessionView
import dev.ukitomato.closta.providers.claude.protocol.StreamJsonCodec
import dev.ukitomato.closta.providers.claude.synthetic.ReplayScript
import dev.ukitomato.closta.providers.claude.synthetic.SyntheticSession
import org.junit.jupiter.api.Assertions.assertTrue
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

    @Test
    fun largestSessionBuildsWithinBudget() {
        repeat(WARM_UP) { ThreadRows().of(history.transcript) }
        val took = millis { ThreadRows().of(history.transcript) }
        assertTrue(took <= BUILD_BUDGET_MS, "building every row took ${took}ms (budget ${BUILD_BUDGET_MS}ms)")
    }

    @Test
    fun streamingTailRebuildsOnlyTheLastMessage() {
        val reply = javaClass.getResource("/bench/replay-reply.md")!!.readText()
        val tail = ReplayScript.lines(reply, sessionId = "budget")
        val rows = ThreadRows()
        val times = ArrayList<Double>()
        repeat(2) { round ->
            times.clear()
            var view = history.sent(PresenterInput.UserSent("tail$round", "続けて"))
            var before = rows.of(view.transcript)
            for (line in tail) {
                view = view.event(PresenterInput.Event(StreamJsonCodec.decode(line)))
                lateinit var after: List<ThreadRow>
                times += millis { after = rows.of(view.transcript) }
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
        val p99 = times.sorted()[times.size * P99 / PERCENT]
        assertTrue(p99 <= UPDATE_BUDGET_MS, "an update took ${p99}ms at p99 (budget ${UPDATE_BUDGET_MS}ms)")
    }

    private companion object {
        const val WARM_UP = 3
        const val BUILD_BUDGET_MS = 300.0
        const val UPDATE_BUDGET_MS = 5.0
        const val NANOS_PER_MS = 1_000_000.0
        const val P99 = 99
        const val PERCENT = 100
    }
}
