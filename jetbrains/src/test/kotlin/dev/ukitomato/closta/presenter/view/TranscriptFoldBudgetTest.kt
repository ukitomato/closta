package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.platforms.intellij.session.SessionView
import dev.ukitomato.closta.providers.claude.protocol.StreamJsonCodec
import dev.ukitomato.closta.providers.claude.synthetic.SyntheticSession
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * The fold's promise for a long session: a line costs the same at the end of the conversation as at its start, and
 * the largest session the user has had folds within a budget. The lines are decoded first, so only the fold is timed.
 */
class TranscriptFoldBudgetTest {
    private sealed interface Step

    private data class Send(
        val input: PresenterInput.UserSent,
    ) : Step

    private data class Line(
        val event: AgentEvent,
    ) : Step

    private fun steps(shape: SyntheticSession.Shape): List<Step> =
        SyntheticSession.turns(shape).flatMapIndexed { index, turn ->
            listOf(Send(PresenterInput.UserSent("u$index", turn.prompt))) +
                turn.lines.map { Line(StreamJsonCodec.decode(it)) }
        }

    private fun SessionView.take(step: Step): SessionView =
        when (step) {
            is Send -> sent(step.input)
            is Line -> event(PresenterInput.Event(step.event))
        }

    /** Folds every step and returns the nanoseconds each line took. */
    private fun timed(steps: List<Step>): LongArray {
        val times = LongArray(steps.size)
        var view = SessionView()
        steps.forEachIndexed { index, step ->
            val start = System.nanoTime()
            view = view.take(step)
            times[index] = System.nanoTime() - start
        }
        return times
    }

    @Test
    fun foldTimePerLineStaysFlat() {
        // Twice the largest session, as one conversation: the ids are the generator's own, so none repeats.
        val steps = steps(DOUBLED)
        assertTrue(steps.size > LONG_SESSION, "the conversation has ${steps.size} lines")
        repeat(WARM_UP) { timed(steps) }
        val times = timed(steps)
        val first = times.take(SAMPLE).sum() / NANOS_PER_MS
        val last = times.takeLast(SAMPLE).sum() / NANOS_PER_MS
        assertTrue(
            last <= first * 2 + SLACK_MS,
            "the last $SAMPLE lines took ${last}ms, the first $SAMPLE ${first}ms",
        )
    }

    @Test
    fun largestFoldWithinBudget() {
        val steps = steps(SyntheticSession.LARGEST)
        repeat(WARM_UP) { timed(steps) }
        val took = timed(steps).sum() / NANOS_PER_MS
        assertTrue(took <= BUDGET_MS, "folding ${steps.size} lines took ${took}ms (budget ${BUDGET_MS}ms)")
    }

    private companion object {
        val DOUBLED =
            SyntheticSession.LARGEST.let {
                it.copy(
                    turns = it.turns * 2,
                    tools = it.tools * 2,
                    subagents = it.subagents * 2,
                    skills = it.skills * 2,
                    mcp = it.mcp * 2,
                    totalText = it.totalText * 2,
                )
            }
        const val LONG_SESSION = 5_000
        const val WARM_UP = 3
        const val SAMPLE = 1_000
        const val SLACK_MS = 20.0
        const val BUDGET_MS = 150.0
        const val NANOS_PER_MS = 1_000_000.0
    }
}
