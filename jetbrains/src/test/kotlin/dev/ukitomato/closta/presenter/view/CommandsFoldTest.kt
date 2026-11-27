package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.core.models.RawJson
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** `system/commands_changed` replaces the slash command list with the one that carries the sentences. */
class CommandsFoldTest {
    private fun changed(commands: String) = AgentEvent.SystemCommandsChanged("u", "s-1", RawJson(commands))

    private fun HostState.feed(vararg events: AgentEvent): HostState =
        events.fold(this) { state, event -> state.next(PresenterInput.Event(event)) }

    private val two =
        changed(
            """[{"name":"alpha","description":"First","argumentHint":"<x>"},{"name":"beta","description":"Second"}]""",
        )

    private val twoRecords =
        listOf(SlashCommandRecord("alpha", "First", "<x>"), SlashCommandRecord("beta", "Second"))

    @Test
    fun `01 ends with the 59 commands of its commands_changed, with their sentences`() {
        val commands =
            CaptureReplay
                .replay("01-baseline-text")
                .last()
                .transcript.commands
        assertTrue(commands.detailed)
        assertEquals(59, commands.items.size)
        assertEquals(
            SlashCommandRecord(
                "design",
                "Grant or revoke Claude agent access to your Design projects",
                "consent | revoke",
            ),
            commands.items.first(),
        )
    }

    @Test
    fun `a commands_changed replaces the list, and a later init does not take it back to names`() {
        val state =
            HostState().feed(
                Lines.init(slashCommands = """["old"]"""),
                two,
                Lines.init(slashCommands = """["old"]"""),
            )
        assertEquals(SlashCommands(twoRecords, detailed = true), state.transcript.commands)
    }

    @Test
    fun `an empty list is an empty list`() {
        val state = HostState().feed(two, changed("[]"))
        assertEquals(SlashCommands(emptyList(), detailed = true), state.transcript.commands)
    }

    @Test
    fun `something that is not a list leaves the transcript as it was`() {
        val before = HostState().feed(two)
        assertSame(before.transcript.commands, before.feed(changed("{}")).transcript.commands)
    }

    @Test
    fun `the same list again returns the same commands`() {
        val before = HostState().feed(two)
        assertSame(before.transcript.commands, before.feed(two).transcript.commands)
    }
}
