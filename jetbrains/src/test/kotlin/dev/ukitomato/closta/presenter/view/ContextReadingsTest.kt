package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.providers.claude.fixtures.CaptureFixtures
import org.junit.jupiter.api.Assertions.assertAll
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Test

/**
 * `get_context_usage`: captures 06 and 43 hold the whole answer (`full`), with its categories. The answer of the
 * summary form no capture holds: that body is made by hand.
 */
class ContextReadingsTest {
    private fun HostState.ops() = transcript.operations

    @Test
    fun `43 the whole answer reads as the categories, each of its kind`() {
        val state = CaptureReplay.inputs("43-usage-and-rules").fold(HostState()) { host, input -> host.next(input) }
        val categories = state.ops().context!!.categories

        assertAll(
            { assertEquals(ContextCategory("system_prompt", "System prompt", 6592, ContextKind.USED), categories[0]) },
            { assertEquals(ContextKind.DEFERRED, categories.single { it.id == "system_tools_deferred" }.kind) },
            { assertEquals(ContextKind.BUFFER, categories.single { it.id == "autocompact_buffer" }.kind) },
            { assertEquals(ContextKind.FREE, categories.single { it.id == "free_space" }.kind) },
            { assertEquals(7, categories.size) },
        )
    }

    @Test
    fun `type only - an answer with no categories is a context with none`() {
        val state =
            HostState()
                .next(PresenterInput.ControlRequested("c1", ControlKind.CONTEXT))
                .next(
                    PresenterInput.Event(
                        Lines.controlOk("c1", """{"totalTokens":5,"maxTokens":10,"percentage":50}"""),
                    ),
                )

        assertEquals(ContextRecord(5, 10, 50.0, null), state.ops().context)
        assertEquals(emptyList<ContextCategory>(), state.ops().context!!.categories)
    }

    @Test
    fun `type only - a category with no name or no tokens is left out, and a kind not known is used`() {
        val body =
            """{"totalTokens":5,"maxTokens":10,"percentage":50,"categories":[""" +
                """{"name":"A","tokens":1,"kind":"used"},{"tokens":2,"kind":"free"},{"name":"C","kind":"free"},""" +
                """{"name":"D","tokens":3,"kind":"later"},{"id":"e","name":"E","tokens":4}]}"""
        val state =
            HostState()
                .next(PresenterInput.ControlRequested("c1", ControlKind.CONTEXT))
                .next(PresenterInput.Event(Lines.controlOk("c1", body)))

        assertEquals(
            listOf(
                ContextCategory(null, "A", 1, ContextKind.USED),
                ContextCategory(null, "D", 3, ContextKind.USED),
                ContextCategory("e", "E", 4, ContextKind.USED),
            ),
            state.ops().context!!.categories,
        )
    }

    @Test
    fun `41 the context is asked at each result and at the reset, never at an init`() {
        val events = CaptureFixtures.readCapture("41-clear-reset.ndjson")
        val asked = events.filter(::asksForContext)

        assertAll(
            { assertEquals(4, asked.size, "$asked") },
            { assertEquals(3, asked.count { it is AgentEvent.Result }) },
            { assertEquals(1, asked.count { it is AgentEvent.ConversationReset }) },
            { assertFalse(events.filterIsInstance<AgentEvent.SystemInit>().any(::asksForContext)) },
            { assertEquals(3, events.count { it is AgentEvent.SystemInit }, "the three inits of the capture") },
        )
    }
}
