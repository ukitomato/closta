package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AttachmentKind
import dev.ukitomato.closta.core.models.ConversationState
import dev.ukitomato.closta.core.models.SessionInfo
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ComposerStateTest {
    private val levels = listOf("low", "medium", "high", "xhigh", "max")
    private val default =
        ModelRecord("default", null, "Default (recommended)", "Opus 5.5 · Best for everyday", true, levels)
    private val opus = ModelRecord("opus", "claude-opus-5-5", "Opus 5.5", "Most capable", true, levels)
    private val haiku = ModelRecord("haiku", "claude-haiku-5-5", "Haiku 5.5", "Fastest", false, null)

    private fun state(
        model: String? = null,
        mode: String = "default",
        models: List<ModelRecord> = listOf(default, opus, haiku),
        switches: List<SwitchRecord> = emptyList(),
        effort: String? = "high",
    ): ComposerState {
        val conversation =
            ConversationState(session = model?.let { SessionInfo("s", it, mode, "/w", "2.1") })
        val transcript =
            Transcript(operations = OperationRecords(models = models, switches = switches, effort = effort))
        return composerState(conversation, transcript)
    }

    private fun applied(
        kind: SwitchKind,
        value: String,
    ) = SwitchRecord("x", 1, kind, value, SwitchOutcome.APPLIED)

    @Test
    fun defaultShowsTheModelInUse() {
        val chosen = state(model = "claude-opus-5-5", switches = listOf(applied(SwitchKind.MODEL, "default")))
        assertEquals("Default (Opus 5.5)", chosen.model.label)
        assertEquals("Opus 5.5", shortLabel(chosen.model))
    }

    @Test
    fun theModelInUseIsMatchedByItsResolvedId() {
        val chosen = state(model = "claude-opus-5-5")
        assertEquals("Opus 5.5", chosen.model.label)
        assertEquals("claude-opus-5-5", chosen.model.resolved)
    }

    @Test
    fun unknownModelIsReported() {
        val chosen = state(model = "claude-mystery-9")
        assertEquals("claude-mystery-9", chosen.unknownModel)
        assertEquals("claude-mystery-9", chosen.model.label)
    }

    @Test
    fun noModelsYet() {
        val chosen = state(models = emptyList())
        assertTrue(chosen.models.isEmpty())
        assertEquals("Default", chosen.model.label)
        assertNull(chosen.unknownModel)
    }

    @Test
    fun effortOnlyForModelsThatTakeIt() {
        assertEquals(levels, state(model = "claude-opus-5-5").effortLevels)
        assertTrue(state(model = "claude-haiku-5-5").effortLevels.isEmpty())
    }

    @Test
    fun effortDisabledWhileRunning() {
        val conversation = ConversationState(session = SessionInfo("s", "claude-opus-5-5", "default", "/w", "2.1"))
        val sent = Transcript(routing = Routing(sends = 1), operations = OperationRecords(models = listOf(opus)))
        val running = composerState(conversation, sent)
        assertTrue(running.running)
        assertFalse(running.effortEnabled)
        assertTrue(state(model = "claude-opus-5-5").effortEnabled)
    }

    @Test
    fun effortOutsideLevelsIsKept() {
        assertEquals("ultra", state(model = "claude-opus-5-5", effort = "ultra").effort)
    }

    @Test
    fun modeComesFromTheSession() {
        assertEquals("acceptEdits", state(model = "claude-opus-5-5", mode = "acceptEdits").mode)
        assertEquals(
            listOf("default", "acceptEdits", "plan", "auto", "dontAsk", "bypassPermissions"),
            state().modes,
        )
    }

    @Test
    fun modeLabels() {
        assertEquals(
            listOf("Default", "Accept Edits", "Plan", "Auto", "Don't Ask", "Bypass Permissions", "custom"),
            listOf("default", "acceptEdits", "plan", "auto", "dontAsk", "bypassPermissions", "custom").map(::modeLabel),
        )
        assertEquals("Edits", shortModeLabel("acceptEdits"))
        assertEquals("Bypass", shortModeLabel("bypassPermissions"))
        assertEquals("Plan", shortModeLabel("plan"))
        assertEquals(
            listOf("Low", "Medium", "High", "Extra High", "Max", "ultra"),
            listOf("low", "medium", "high", "xhigh", "max", "ultra").map(::effortLabel),
        )
    }

    @Test
    fun aPendingSwitchIsShown() {
        val pending = SwitchRecord("p", 2, SwitchKind.MODEL, "haiku", SwitchOutcome.PENDING)
        assertEquals(pending, state(model = "claude-opus-5-5", switches = listOf(pending)).switching)
    }

    @Test
    fun attachmentRules() {
        assertEquals(
            AttachmentVerdict.Refused(AttachmentFault.TOO_LARGE),
            checkAttachment("big.png", "image/png", 5_242_881, 0),
        )
        assertEquals(
            AttachmentVerdict.Refused(AttachmentFault.TOO_MANY),
            checkAttachment("a.png", "image/png", 10, 10),
        )
        assertEquals(
            AttachmentVerdict.Refused(AttachmentFault.UNSUPPORTED),
            checkAttachment("a.bmp", "image/bmp", 10, 0),
        )
        assertEquals(
            AttachmentVerdict.Ok(AttachmentKind.IMAGE, "image/png"),
            checkAttachment("a.png", "image/png", 10, 0),
        )
        assertEquals(
            AttachmentVerdict.Ok(AttachmentKind.DOCUMENT, "application/pdf"),
            checkAttachment("a.pdf", "application/pdf", 10, 0),
        )
        assertEquals(AttachmentVerdict.Ok(AttachmentKind.TEXT, "text/plain"), checkAttachment("notes.md", null, 10, 0))
        assertEquals(
            AttachmentVerdict.Refused(AttachmentFault.NAME_TOO_LONG),
            checkAttachment("x".repeat(256) + ".txt", "text/plain", 10, 0),
        )
    }
}
