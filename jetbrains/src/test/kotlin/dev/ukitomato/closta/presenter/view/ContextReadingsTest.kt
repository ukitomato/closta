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

    private fun HostState.asked(
        id: String,
        body: String,
    ) = next(
        PresenterInput.ControlRequested(id, ControlKind.CONTEXT),
    ).next(PresenterInput.Event(Lines.controlOk(id, body)))

    private val whole =
        """{"totalTokens":9,"maxTokens":10,"percentage":90,"categories":[""" +
            """{"name":"A","tokens":4,"kind":"used"},{"name":"B","tokens":5,"kind":"used"}]}"""
    private val summary = """{"totalTokens":7,"maxTokens":10,"percentage":70}"""
    private val twoCategories =
        listOf(ContextCategory(null, "A", 4, ContextKind.USED), ContextCategory(null, "B", 5, ContextKind.USED))

    @Test
    fun `type only - a summary answer keeps the rows of the whole one and takes its totals`() {
        val context =
            HostState()
                .asked("c1", whole)
                .asked("c2", summary)
                .ops()
                .context!!
        assertAll(
            { assertEquals(twoCategories, context.categories) },
            { assertEquals(7, context.totalTokens) },
        )
    }

    @Test
    fun `type only - a conversation reset drops the rows of the breakdown`() {
        val reset = AgentEvent.ConversationReset("rs", "s-1", "s-2", timestamp = "2026-11-14T12:26:36.305Z")
        val state = HostState().asked("c1", whole).next(PresenterInput.Event(reset)).asked("c2", summary)
        assertEquals(emptyList<ContextCategory>(), state.ops().context!!.categories)
    }

    @Test
    fun `type only - a compaction drops the rows of the breakdown`() {
        val boundary = Lines.compactBoundary("""{"trigger":"manual","pre_tokens":9,"post_tokens":3}""")
        val state = HostState().asked("c1", whole).next(PresenterInput.Event(boundary)).asked("c2", summary)
        assertEquals(emptyList<ContextCategory>(), state.ops().context!!.categories)
    }

    @Test
    fun `type only - a second whole answer replaces the first`() {
        val other =
            """{"totalTokens":9,"maxTokens":10,"percentage":90,"categories":[""" +
                """{"name":"Z","tokens":9,"kind":"free"}]}"""
        val state = HostState().asked("c1", whole).asked("c2", other)
        assertEquals(listOf(ContextCategory(null, "Z", 9, ContextKind.FREE)), state.ops().context!!.categories)
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
