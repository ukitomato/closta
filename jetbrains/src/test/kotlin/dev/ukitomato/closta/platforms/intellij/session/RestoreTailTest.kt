package dev.ukitomato.closta.platforms.intellij.session

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.providers.claude.protocol.StreamJsonCodec
import dev.ukitomato.closta.providers.claude.synthetic.SyntheticSession
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Test

/**
 * A resumed session puts its whole record back in two steps: the newest lines first, so the first screen is quick,
 * then every line in place of them. Each step is folded onto the view from before the restore, never onto the other.
 */
class RestoreTailTest {
    private val events: List<AgentEvent> by lazy {
        SyntheticSession
            .turns()
            .flatMap { it.lines }
            .take(1_000)
            .map(StreamJsonCodec::decode)
    }

    @Test
    fun restoreGivesTheTailFirst() {
        val steps = restoreSteps(events, dropped = 0)

        assertEquals(
            listOf(events.takeLast(RESTORE_TAIL_LINES) to 1_000 - RESTORE_TAIL_LINES, events to 0),
            steps,
        )
    }

    @Test
    fun shortRecordIsOneStep() {
        assertEquals(listOf(events.take(300) to 2), restoreSteps(events.take(300), dropped = 2))
    }

    @Test
    fun aDroppedCountIsKeptInBothSteps() {
        val steps = restoreSteps(events, dropped = 7)

        assertEquals(listOf(1_000 - RESTORE_TAIL_LINES + 7, 7), steps.map { it.second })
    }

    @Test
    fun secondStepReplacesTheFirst() {
        val base = SessionView()
        val views = restoreSteps(events, dropped = 0).map { (lines, dropped) -> base.restored(lines, dropped) }

        assertEquals(base.restored(events, 0).transcript, views.last().transcript)
        assertNotEquals(views.first().transcript, views.last().transcript)
    }
}
