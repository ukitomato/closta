package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.providers.claude.fixtures.CaptureFixtures
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * What the operations keep of the sandbox and of the permission modes the host must remember: whether the sandbox is
 * on (the settings' answers of captures 33 to 40), how a switch of it ends, and whether bypass was entered or auto
 * refused once in the session.
 */
class SandboxRecordsTest {
    private fun HostState.with(input: PresenterInput) = next(input)

    private fun HostState.with(event: AgentEvent) = next(PresenterInput.Event(event))

    private fun HostState.ops() = transcript.operations

    private fun HostState.request(
        id: String,
        kind: ControlKind,
        value: String? = null,
    ) = with(PresenterInput.ControlRequested(id, kind, value))

    private fun answerOf(
        scenario: String,
        requestId: String,
    ): AgentEvent.ControlResponse =
        CaptureFixtures.readCapture("$scenario.ndjson").filterIsInstance<AgentEvent.ControlResponse>().single {
            it.requestId == requestId
        }

    private fun HostState.composer() = composerState(conversation, transcript)

    private fun HostState.sandboxRecords() = ops().switches.filter { it.kind == SwitchKind.SANDBOX }

    private fun HostState.settings(
        id: String,
        answer: AgentEvent.ControlResponse,
    ) = request(id, ControlKind.SETTINGS).with(answer)

    private fun settingsSaying(
        id: String,
        effective: String?,
    ) = Lines.controlOk(id, effective?.let { """{"effective":$it}""" } ?: "{}")

    @Test
    fun sandboxFollowsSettingsAtStart() {
        val id = "35-sandbox-project-setting-req-2"
        val state =
            HostState()
                .with(PresenterInput.Launched(null, sandbox = false))
                .settings(id, answerOf("35-sandbox-project-setting", id))
        assertEquals(true, state.ops().sandbox)
        assertTrue(state.composer().sandbox.on)
    }

    @Test
    fun sandboxReadAfterLaunch() {
        val launched = HostState().with(PresenterInput.Launched(null, sandbox = true))
        assertNull(launched.ops().sandbox, "not answered yet")
        assertTrue(launched.composer().sandbox.on, "the launch's own value until the CLI answers")
        val id = "34-sandbox-launch-req-2"
        val read = launched.settings(id, answerOf("34-sandbox-launch", id))
        assertTrue(read.composer().sandbox.on)
        assertTrue(read.ops().switches.isEmpty(), "no failure")
        assertFalse(read.ops().launchUnconfirmed)
    }

    @Test
    fun launchSandboxNotConfirmedAddsFailure() {
        val id = "40-sandbox-same-id-req-2"
        val state =
            HostState()
                .with(PresenterInput.Launched(null, sandbox = true))
                .settings(id, answerOf("40-sandbox-same-id", id))
        val record = state.sandboxRecords().single()
        assertEquals(id, record.id)
        assertEquals("true", record.value)
        assertEquals(SwitchOutcome.FAILED, record.outcome)
        assertEquals(SANDBOX_NOT_APPLIED, record.detail)
        assertFalse(state.composer().sandbox.on)
        assertFalse(state.ops().launchUnconfirmed)
    }

    @Test
    fun sandboxOffConfirmedBySettings() {
        val scenario = "33-sandbox-live"
        val on = HostState().settings("$scenario-req-4", answerOf(scenario, "$scenario-req-4"))
        assertTrue(on.composer().sandbox.on)
        val answered =
            on.request("$scenario-req-5", ControlKind.SANDBOX, "false").with(answerOf(scenario, "$scenario-req-5"))
        assertEquals(SwitchOutcome.PENDING, answered.sandboxRecords().single().outcome, "the settings say whether")
        assertEquals("$scenario-req-5", answered.ops().sandboxConfirming)
        val confirmed = answered.settings("$scenario-req-6", answerOf(scenario, "$scenario-req-6"))
        val record = confirmed.sandboxRecords().single()
        assertEquals(SwitchOutcome.APPLIED, record.outcome)
        assertNull(record.detail)
        assertFalse(confirmed.composer().sandbox.on)
        assertNull(confirmed.ops().sandboxConfirming)
    }

    @Test
    fun sandboxOffNotConfirmedFails() {
        val state =
            HostState()
                .request("x", ControlKind.SANDBOX, "false")
                .with(Lines.controlOk("x"))
                .settings("s", settingsSaying("s", """{"sandbox":{"enabled":true}}"""))
        val record = state.sandboxRecords().single()
        assertEquals(SwitchOutcome.FAILED, record.outcome)
        assertEquals(SANDBOX_NOT_OFF, record.detail)
        assertTrue(state.composer().sandbox.on)
    }

    @Test
    fun sandboxOnConfirmedAfterRelaunch() {
        val id = "39-sandbox-resume-req-3"
        val relaunched =
            HostState()
                .request("x", ControlKind.SANDBOX, "true")
                .with(PresenterInput.Launched(null, sandbox = true))
        assertEquals("x", relaunched.ops().sandboxConfirming)
        val state = relaunched.settings(id, answerOf("39-sandbox-resume", id))
        val record = state.sandboxRecords().single()
        assertEquals("x", record.id)
        assertEquals(SwitchOutcome.APPLIED, record.outcome)
        assertTrue(state.composer().sandbox.on)
        assertNull(state.ops().sandboxConfirming)
        assertFalse(state.ops().launchUnconfirmed)
    }

    @Test
    fun sandboxOnNotConfirmedFails() {
        val state =
            HostState()
                .request("x", ControlKind.SANDBOX, "true")
                .with(PresenterInput.Launched(null, sandbox = true))
                .settings("s", settingsSaying("s", "{}"))
        val record = state.sandboxRecords().single()
        assertEquals("x", record.id)
        assertEquals(SwitchOutcome.FAILED, record.outcome)
        assertEquals(SANDBOX_NOT_APPLIED, record.detail)
        assertFalse(state.composer().sandbox.on)
    }

    private fun switchedIntoSandbox() =
        HostState()
            .request("x", ControlKind.SANDBOX, "true")
            .with(PresenterInput.Launched(null, sandbox = true))

    private fun launchedIntoSandbox() = HostState().with(PresenterInput.Launched(null, sandbox = true))

    private fun assertFailedOff(
        state: HostState,
        id: String,
        detail: String,
    ) {
        val record = state.sandboxRecords().single()
        assertEquals(id, record.id)
        assertEquals("true", record.value)
        assertEquals(SwitchOutcome.FAILED, record.outcome)
        assertEquals(detail, record.detail)
        assertFalse(state.composer().sandbox.on, "a sandbox that could not be confirmed on is shown off")
        assertNull(state.ops().sandboxConfirming)
        assertFalse(state.ops().launchUnconfirmed)
    }

    @Test
    fun sandboxSwitchNotConfirmedWhenTheSettingsAreRefused() {
        val state = switchedIntoSandbox().settings("s", Lines.controlError("s", "no"))
        assertFailedOff(state, "x", SANDBOX_NOT_CONFIRMED)
    }

    @Test
    fun sandboxSwitchNotConfirmedWhenTheSettingsSayNothing() {
        val state = switchedIntoSandbox().settings("s", settingsSaying("s", null))
        assertFailedOff(state, "x", SANDBOX_NOT_CONFIRMED)
    }

    @Test
    fun sandboxLaunchNotConfirmedWhenTheSettingsAreRefused() {
        val state = launchedIntoSandbox().settings("s", Lines.controlError("s", "no"))
        assertFailedOff(state, "s", SANDBOX_NOT_APPLIED)
    }

    @Test
    fun sandboxLaunchNotConfirmedWhenTheSettingsSayNothing() {
        val state = launchedIntoSandbox().settings("s", settingsSaying("s", null))
        assertFailedOff(state, "s", SANDBOX_NOT_APPLIED)
    }

    @Test
    fun sandboxOffNotConfirmedKeepsTheLastValue() {
        val on = HostState().settings("s0", settingsSaying("s0", """{"sandbox":{"enabled":true}}"""))
        val state =
            on
                .request("x", ControlKind.SANDBOX, "false")
                .with(Lines.controlOk("x"))
                .settings("s", Lines.controlError("s", "no"))
        assertEquals(SANDBOX_NOT_CONFIRMED, state.sandboxRecords().single().detail)
        assertTrue(state.composer().sandbox.on, "turning off unconfirmed leaves what was last read")
    }

    @Test
    fun settingsAskedBeforeTheSwitchTookDoNotSettleIt() {
        val asked =
            HostState()
                .request("s1", ControlKind.SETTINGS)
                .request("x", ControlKind.SANDBOX, "false")
                .with(Lines.controlOk("x"))
                .request("s2", ControlKind.SETTINGS)
        val early = asked.with(settingsSaying("s1", """{"sandbox":{"enabled":true}}"""))
        assertEquals(SwitchOutcome.PENDING, early.sandboxRecords().single().outcome, "s1 was asked before")
        assertEquals(true, early.ops().sandbox, "an older answer still says what the sandbox is")
        val confirmed = early.with(settingsSaying("s2", """{"sandbox":{"enabled":false}}"""))
        assertEquals(SwitchOutcome.APPLIED, confirmed.sandboxRecords().single().outcome)
        assertFalse(confirmed.composer().sandbox.on)
    }

    @Test
    fun settingsAskedBeforeTheRelaunchDoNotSettleIt() {
        val asked =
            HostState()
                .request("s1", ControlKind.SETTINGS)
                .request("x", ControlKind.SANDBOX, "true")
                .with(PresenterInput.Launched(null, sandbox = true))
                .request("s2", ControlKind.SETTINGS)
        val early = asked.with(settingsSaying("s1", "{}"))
        assertEquals(SwitchOutcome.PENDING, early.sandboxRecords().single().outcome, "s1 went to the old CLI")
        assertTrue(early.ops().launchUnconfirmed)
        val confirmed = early.with(settingsSaying("s2", """{"sandbox":{"enabled":true}}"""))
        assertEquals(SwitchOutcome.APPLIED, confirmed.sandboxRecords().single().outcome)
        assertTrue(confirmed.composer().sandbox.on)
    }

    @Test
    fun sandboxNotStartedFails() {
        val refusal =
            CaptureFixtures.readCapture("36-sandbox-unavailable.ndjson").first() as AgentEvent.Result
        val state =
            HostState()
                .request("x", ControlKind.SANDBOX, "true")
                .with(PresenterInput.Launched(null, sandbox = true))
                .with(PresenterInput.SandboxNotStarted("x", refusal.result))
        val record = state.sandboxRecords().single()
        assertEquals(SwitchOutcome.FAILED, record.outcome)
        assertEquals(refusal.result, record.detail)
        assertFalse(state.composer().sandbox.on, "the CLI that started is not in the sandbox")
        assertNull(state.ops().sandboxConfirming)
        assertFalse(state.ops().launchUnconfirmed)
        val unknown = HostState().with(PresenterInput.SandboxNotStarted("y", null)).sandboxRecords().single()
        assertEquals("true", unknown.value)
        assertEquals(SwitchOutcome.FAILED, unknown.outcome)
        assertEquals(SANDBOX_NOT_STARTED, unknown.detail)
    }

    @Test
    fun earlierSettingsAnswerDoesNotSettle() {
        val state =
            HostState()
                .request("s1", ControlKind.SETTINGS)
                .request("x", ControlKind.SANDBOX, "false")
                .with(settingsSaying("s1", """{"sandbox":{"enabled":true}}"""))
        assertEquals(SwitchOutcome.PENDING, state.sandboxRecords().single().outcome)
        assertEquals(true, state.ops().sandbox)
    }

    @Test
    fun sandboxRefusedWhileRunning() {
        val state = HostState().with(PresenterInput.SandboxRefused("x"))
        val record = state.sandboxRecords().single()
        assertEquals("true", record.value)
        assertEquals(SwitchOutcome.REJECTED, record.outcome)
        assertEquals(SANDBOX_REFUSED_TURN, record.detail)
        assertEquals(record, state.composer().sandboxFailure)
        assertSame(state.transcript, state.with(PresenterInput.SandboxRefused("x")).transcript)
    }

    @Test
    fun sandboxSwitchRefusedByTheCli() {
        val state =
            HostState()
                .request("x", ControlKind.SANDBOX, "false")
                .with(Lines.controlError("x", "Cannot change the sandbox"))
        val record = state.sandboxRecords().single()
        assertEquals(SwitchOutcome.REJECTED, record.outcome)
        assertEquals("Cannot change the sandbox", record.detail)
        assertNull(state.ops().sandboxConfirming)
        assertEquals(record, state.composer().sandboxFailure)
    }

    @Test
    fun asksForSettingsAfterSandboxSwitch() {
        val asked = HostState().request("x", ControlKind.SANDBOX, "false")
        assertTrue(asked.ops().asksForSettings(Lines.controlOk("x")))
        val refused = asked.with(Lines.controlError("x", "no"))
        assertFalse(refused.ops().asksForSettings(Lines.controlOk("x")), "a switch already over")
    }

    @Test
    fun bypassEnteredSurvivesOldSwitches() {
        var state =
            HostState()
                .request("m", ControlKind.MODE, "bypassPermissions")
                .with(Lines.controlOk("m", """{"mode":"bypassPermissions"}"""))
        assertTrue(state.ops().bypassEntered)
        repeat(SWITCHES_AFTER) { index ->
            state = state.request("model-$index", ControlKind.MODEL, "opus").with(Lines.controlOk("model-$index"))
        }
        assertTrue(state.ops().switches.none { it.id == "m" }, "the bypass record was pushed out")
        assertTrue(state.ops().bypassEntered)
    }

    @Test
    fun bypassRefusedIsNotEntered() {
        val id = "38-plan-bypass-req-2"
        val state = HostState().request(id, ControlKind.MODE, "bypassPermissions").with(answerOf("38-plan-bypass", id))
        val record = state.ops().switches.single()
        assertEquals(SwitchOutcome.REJECTED, record.outcome)
        assertFalse(state.ops().bypassEntered)
        assertFalse(state.ops().autoRejected)
    }

    @Test
    fun autoRejectedAfterRefusal() {
        val state = HostState().request("a", ControlKind.MODE, "auto").with(Lines.controlError("a", "not available"))
        assertTrue(state.ops().autoRejected)
        assertFalse(state.ops().bypassEntered)
        val applied = HostState().request("a", ControlKind.MODE, "auto").with(Lines.controlOk("a"))
        assertFalse(applied.ops().autoRejected)
    }

    @Test
    fun autoRejectedAfterSendFailed() {
        val state = HostState().request("a", ControlKind.MODE, "auto").with(PresenterInput.ControlSendFailed("a"))
        assertTrue(state.ops().autoRejected)
    }

    private fun recordsOf(
        value: String,
        outcome: SwitchOutcome,
        kind: SwitchKind = SwitchKind.SANDBOX,
    ) = OperationRecords(seq = 1, switches = listOf(SwitchRecord("s", 1, kind, value, outcome)))

    @Test
    fun appliedSandboxOnlyWhenApplied() {
        val pending = recordsOf("true", SwitchOutcome.PENDING)
        assertNull(appliedSandbox(pending, recordsOf("true", SwitchOutcome.FAILED)))
        assertNull(appliedSandbox(pending, recordsOf("true", SwitchOutcome.REJECTED)))
        assertNull(appliedSandbox(pending, pending))
        assertEquals(true, appliedSandbox(pending, recordsOf("true", SwitchOutcome.APPLIED)))
        assertEquals(
            false,
            appliedSandbox(recordsOf("false", SwitchOutcome.PENDING), recordsOf("false", SwitchOutcome.APPLIED)),
        )
    }

    @Test
    fun appliedSandboxIgnoresOtherKindsAndSettledBefore() {
        val modePending = recordsOf("auto", SwitchOutcome.PENDING, SwitchKind.MODE)
        assertNull(appliedSandbox(modePending, recordsOf("auto", SwitchOutcome.APPLIED, SwitchKind.MODE)))
        val done = recordsOf("true", SwitchOutcome.APPLIED)
        assertNull(appliedSandbox(done, done))
        assertNull(appliedSandbox(OperationRecords(), done))
    }

    private companion object {
        const val SWITCHES_AFTER = 25
    }
}
