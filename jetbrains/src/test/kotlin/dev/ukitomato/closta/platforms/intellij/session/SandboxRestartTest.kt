package dev.ukitomato.closta.platforms.intellij.session

import dev.ukitomato.closta.presenter.view.ControlKind
import dev.ukitomato.closta.presenter.view.PresenterInput
import dev.ukitomato.closta.providers.claude.fixtures.CaptureFixtures
import dev.ukitomato.closta.providers.claude.launch.ClaudeLaunchSpec
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** The launch a restart into the sandbox makes, and the choices it carries over from the conversation. */
class SandboxRestartTest {
    private val none = CarriedChoices(mode = null, model = null, effort = null)

    @Test
    fun afterAMessageResumesTheSession() {
        val argv = restartSpec(ClaudeLaunchSpec(sessionId = ID), SessionOpening.New, true, none, true).toArgv()
        assertTrue("--resume=$ID" in argv, "$argv")
        assertFalse(argv.any { it.startsWith("--session-id") }, "$argv")
        assertTrue("--settings" in argv, "$argv")
    }

    @Test
    fun beforeFirstMessageKeepsSessionId() {
        val argv = restartSpec(ClaudeLaunchSpec(sessionId = ID), SessionOpening.New, false, none, true).toArgv()
        assertTrue("--session-id=$ID" in argv, "$argv")
        assertFalse(argv.any { it.startsWith("--resume") }, "$argv")
        assertTrue("--settings" in argv, "$argv")
    }

    @Test
    fun resumeOpeningAlwaysResumes() {
        val launched = ClaudeLaunchSpec(sessionId = ID, resume = ID)
        val argv = restartSpec(launched, SessionOpening.Resume(ID), false, none, true).toArgv()
        assertTrue("--resume=$ID" in argv, "$argv")
        assertFalse(argv.any { it.startsWith("--session-id") }, "$argv")
    }

    @Test
    fun forkBeforeFirstMessageKeepsForkFlags() {
        val launched = ClaudeLaunchSpec(sessionId = ID, resume = PARENT, forkSession = true)
        val argv = restartSpec(launched, SessionOpening.Fork(PARENT), false, none, true).toArgv()
        assertEquals(launched.copy(sandbox = true).toArgv(), argv)
        assertTrue("--resume=$PARENT" in argv && "--fork-session" in argv && "--session-id=$ID" in argv, "$argv")
    }

    @Test
    fun afterAMessageDropsForkAndCut() {
        val launched =
            ClaudeLaunchSpec(sessionId = ID, resume = PARENT, forkSession = true, resumeSessionAt = CUT)
        val argv = restartSpec(launched, SessionOpening.Fork(PARENT, LINE), true, none, true).toArgv()
        assertTrue("--resume=$ID" in argv, "$argv")
        assertFalse("--fork-session" in argv, "$argv")
        assertFalse(argv.any { it.startsWith("--resume-session-at") }, "$argv")
        assertFalse(argv.any { it.startsWith("--session-id") }, "$argv")
    }

    @Test
    fun bypassIsNotCarried() {
        val view =
            SessionView()
                .requested(PresenterInput.ControlRequested(SWITCH, ControlKind.MODE, "bypassPermissions"))
                .event(PresenterInput.Event(CaptureFixtures.parse(success(SWITCH))))
        val carried = carriedChoices(view)
        assertNull(carried.mode)
        val launched = ClaudeLaunchSpec(sessionId = ID, permissionMode = "acceptEdits")
        assertEquals("acceptEdits", restartSpec(launched, SessionOpening.New, true, carried, true).permissionMode)
    }

    @Test
    fun choicesWinOverTheLaunchAndADefaultModelIsNone() {
        val launched = ClaudeLaunchSpec(sessionId = ID, permissionMode = "default", model = "sonnet", effort = "low")
        val spec = restartSpec(launched, SessionOpening.New, true, CarriedChoices("plan", "opus", "high"), true)
        assertEquals(Triple("plan", "opus", "high"), Triple(spec.permissionMode, spec.model, spec.effort))
        assertTrue(spec.sandbox)
        assertNull(carriedChoices(SessionView()).model, "a session with no model chosen carries none")
    }

    private fun success(id: String) =
        """{"type":"control_response","response":{"subtype":"success","request_id":"$id"}}"""

    private companion object {
        const val ID = "0f8fad5b-d9cb-469f-a165-70867728950e"
        const val PARENT = "336ed47b-2675-4317-b3f5-a3b48abb03a2"
        const val CUT = "9c4f7a1e-2b3d-4e5f-8a6b-7c8d9e0f1a2b"
        const val LINE = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d"
        const val SWITCH = "switch-1"
    }
}
