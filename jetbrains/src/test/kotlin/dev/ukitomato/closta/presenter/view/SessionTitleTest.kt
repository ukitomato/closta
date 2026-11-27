package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.core.models.ConversationState
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** What names a session: the name the user gave it, else the start of its first request. */
class SessionTitleTest {
    private fun HostState.with(input: PresenterInput) = next(input)

    private fun HostState.with(event: AgentEvent) = next(PresenterInput.Event(event))

    private fun HostState.asked(
        id: String,
        title: String,
    ) = with(PresenterInput.ControlRequested(id, ControlKind.RENAME, title))

    private fun HostState.sent(text: String) = with(PresenterInput.UserSent("send-1", text))

    @Test
    fun `type only - a rename the CLI took names the session`() {
        val state = HostState().sent("first request").asked("r1", "Release notes").with(Lines.controlOk("r1"))
        assertEquals("Release notes", state.transcript.customTitle)
        assertEquals("Release notes", sessionName(state.transcript))
        assertEquals("Release notes", sessionTitle(state.transcript))
        assertTrue(
            state.transcript.operations.renameAsks
                .isEmpty(),
        )
        assertNull(state.transcript.operations.renameFailure)
    }

    @Test
    fun `type only - a refused rename leaves the name and says why`() {
        val state =
            HostState()
                .sent("first request")
                .asked("r1", "Release notes")
                .with(Lines.controlError("r1", "Session not found"))
        assertNull(state.transcript.customTitle)
        assertEquals("first request", sessionName(state.transcript))
        assertEquals(RenameFailure("r1", "Session not found"), state.transcript.operations.renameFailure)
        assertTrue(
            state.transcript.operations.renameAsks
                .isEmpty(),
        )
    }

    @Test
    fun `a refused rename keeps the name the session already had`() {
        val named = HostState().asked("r1", "First name").with(Lines.controlOk("r1"))
        val refused = named.asked("r2", "Second name").with(Lines.controlError("r2", "no"))
        assertEquals("First name", refused.transcript.customTitle)
    }

    @Test
    fun `a clear drops the given name`() {
        val inputs = CaptureReplay.inputs("41-clear-reset")
        val start = HostState().with(PresenterInput.TitleRestored("Given name"))
        val resetAt = inputs.indexOfFirst { (it as? PresenterInput.Event)?.event is AgentEvent.ConversationReset }
        check(resetAt > 0) { "capture 41 has no reset" }
        val before = inputs.take(resetAt).fold(start) { state, input -> state.with(input) }
        assertEquals("Given name", before.transcript.customTitle, "the name holds until the clear")
        val after = inputs.drop(resetAt).fold(before) { state, input -> state.with(input) }
        assertNull(after.transcript.customTitle)
        assertFalse(sessionName(after.transcript) == "Given name")
    }

    @Test
    fun `a restored custom title names the session until a rename`() {
        val restored = HostState().sent("first request").with(PresenterInput.TitleRestored("Saved name"))
        assertEquals("Saved name", sessionName(restored.transcript))
        val renamed = restored.asked("r1", "New name").with(Lines.controlOk("r1"))
        assertEquals("New name", sessionName(renamed.transcript))
    }

    @Test
    fun `sessionTitle cuts the name at 60 and sessionName does not`() {
        val long = "n".repeat(TITLE_MAX + 20)
        val transcript = HostState().with(PresenterInput.TitleRestored(long)).transcript
        assertEquals(long, sessionName(transcript))
        assertEquals("n".repeat(TITLE_MAX), sessionTitle(transcript))
        val request = HostState().sent("q".repeat(TITLE_MAX + 20)).transcript
        assertEquals("q".repeat(TITLE_MAX + 20), sessionName(request))
        assertEquals("q".repeat(TITLE_MAX), sessionTitle(request))
    }

    @Test
    fun `a session with no name and no request has no name`() {
        assertNull(sessionName(Transcript()))
        assertNull(sessionTitle(Transcript()))
        assertEquals(ConversationState(), HostState().conversation)
    }

    @Test
    fun theFirstLineOfTheFirstRequestNamesASession() {
        val transcript = CaptureReplay.replay("01-baseline-text").last().transcript
        assertEquals("Respond with exactly one word: pong", sessionTitle(transcript))
    }

    @Test
    fun aLongRequestIsCut() {
        val long = "あ".repeat(100) + "\n二行目"
        val transcript =
            foldTranscript(Transcript(), PresenterInput.UserSent("u1", long), ConversationState(), ConversationState())
        assertEquals("あ".repeat(TITLE_MAX), sessionTitle(transcript))
    }

    @Test
    fun aSessionWithNoRequestHasNoTitle() {
        assertNull(sessionTitle(Transcript()))
    }

    @Test
    fun `a refusal is told once, by its request id`() {
        val refused = RenameFailure("r1", "no")
        assertEquals(refused, freshRenameFailure(null, refused))
        assertNull(freshRenameFailure("r1", refused), "the same refusal seen again says nothing")
        assertEquals(RenameFailure("r2", "no"), freshRenameFailure("r1", RenameFailure("r2", "no")))
        assertNull(freshRenameFailure("r1", null))
    }
}
