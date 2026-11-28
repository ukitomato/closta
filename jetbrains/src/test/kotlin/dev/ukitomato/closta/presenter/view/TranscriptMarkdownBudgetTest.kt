package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.platforms.intellij.session.SessionView
import dev.ukitomato.closta.providers.claude.protocol.StreamJsonCodec
import dev.ukitomato.closta.providers.claude.synthetic.SyntheticSession
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test

/** The largest session the user has had exports within a budget. */
class TranscriptMarkdownBudgetTest {
    private val transcript: Transcript by lazy {
        SyntheticSession
            .turns()
            .foldIndexed(SessionView()) { index, view, turn ->
                turn.lines.fold(view.sent(PresenterInput.UserSent("u$index", turn.prompt))) { next, line ->
                    next.event(PresenterInput.Event(StreamJsonCodec.decode(line)))
                }
            }.transcript
    }

    @Tag("perf")
    @Test
    fun largestExportWithinBudget() {
        repeat(WARM_UP) { transcriptMarkdown(transcript, EXPORT_HEADER, ENGLISH_EXPORT_WORDS) }
        val runs =
            List(RUNS) {
                val start = System.nanoTime()
                transcriptMarkdown(transcript, EXPORT_HEADER, ENGLISH_EXPORT_WORDS)
                (System.nanoTime() - start) / NANOS_PER_MS
            }
        val took = runs.sorted()[RUNS / 2]
        println("perf largestExport median=${"%.3f".format(took)}ms runs=${runs.map { "%.3f".format(it) }}")
        assertTrue(took <= BUDGET_MS + SLACK_MS, "exporting took ${took}ms (budget ${BUDGET_MS}ms + ${SLACK_MS}ms)")
    }

    private companion object {
        const val WARM_UP = 3
        const val RUNS = 5
        const val BUDGET_MS = 200.0
        const val SLACK_MS = 50.0
        const val NANOS_PER_MS = 1_000_000.0
    }
}
