package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonRead
import dev.ukitomato.closta.providers.claude.fixtures.CaptureFixtures
import org.junit.jupiter.api.Assertions.assertAll
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * `list_permission_rules`: capture 43 holds one answer (an ask and a deny from the project's settings, no allow). The
 * shapes it does not hold are made by hand from the SDK's type.
 */
class PermissionRulesTest {
    private fun body(text: String) = JsonRead.parse(text) as JsonObject

    private fun state(inner: String) = body("""{"state":{"originalCwd":"/w","managedOnly":false,$inner}}""")

    @Test
    fun `43 the answer reads as one ask and one deny, no allow, no folders and no errors`() {
        val request = "43-usage-and-rules-req-4"
        val answer =
            CaptureFixtures
                .readCapture(
                    "43-usage-and-rules.ndjson",
                ).filterIsInstance<AgentEvent.ControlResponse>()
                .single {
                    it.requestId == request
                }
        val state =
            HostState()
                .next(PresenterInput.ControlRequested(request, ControlKind.PERMISSION_RULES))
                .next(PresenterInput.Event(answer))
        val rules = state.transcript.operations.rules!!

        assertAll(
            { assertEquals(listOf("ask", "deny"), rules.rules.map { it.behavior }) },
            { assertEquals(0, rules.rules.count { it.behavior == "allow" }) },
            { assertEquals("Bash(git push:*)", rules.rules[0].rule) },
            { assertEquals("Any Bash command starting with ", rules.rules[0].prefix) },
            { assertEquals("git push", rules.rules[0].emphasis) },
            { assertNull(rules.rules[0].suffix) },
            { assertEquals("projectSettings", rules.rules[0].source) },
            { assertEquals("persistent", rules.rules[0].editability) },
            { assertNull(rules.rules[1].prefix) },
            { assertTrue(rules.directories.isEmpty()) },
            { assertTrue(rules.errors.isEmpty()) },
            { assertFalse(rules.managedOnly) },
            { assertFalse(rules.withheld) },
            { assertTrue(rules.originalCwd.endsWith("/cwd")) },
            {
                assertTrue(
                    state.transcript.operations.rulesWaiting
                        .isEmpty(),
                )
            },
            { assertNull(state.transcript.operations.rulesFailure) },
        )
    }

    @Test
    fun `type only - notInEffect and managedOnly are read, and an absent notInEffect is false`() {
        val read =
            permissionRulesOf(
                body(
                    """{"state":{"originalCwd":"/w","managedOnly":true,"rules":[""" +
                        """{"behavior":"allow","source":"userSettings","rule":"Read","editability":"readonly",""" +
                        """"notInEffect":true},{"behavior":"allow","source":"policySettings","rule":"Bash",""" +
                        """"editability":"readonly"}]}}""",
                ),
            )!!

        assertAll(
            { assertTrue(read.managedOnly) },
            { assertEquals(listOf(true, false), read.rules.map { it.notInEffect }) },
        )
    }

    @Test
    fun `type only - an error with a file and one without are both kept`() {
        val read =
            permissionRulesOf(
                state(
                    """"rules":[],"errors":[{"file":"/w/.claude/settings.json","path":"","message":"bad json"},""" +
                        """{"path":"x","message":"no file"}]""",
                ),
            )!!

        assertEquals(
            listOf(SettingsError("/w/.claude/settings.json", "bad json"), SettingsError(null, "no file")),
            read.errors,
        )
    }

    @Test
    fun `type only - a rule of a behavior that is not allow, ask or deny is left out and an unknown source stays`() {
        val read =
            permissionRulesOf(
                state(
                    """"rules":[{"behavior":"maybe","source":"session","rule":"A","editability":"session"},""" +
                        """{"behavior":"deny","source":"somethingNew","rule":"B","editability":"readonly"}]""",
                ),
            )!!

        assertEquals(listOf("B"), read.rules.map { it.rule })
        assertEquals("somethingNew", read.rules.single().source)
    }

    @Test
    fun `type only - a withheld answer says so, and its folders are read`() {
        val read =
            permissionRulesOf(
                body(
                    """{"state":{"rules":[],"workspaceDirectories":[{"path":"/a","source":"cliArg"}],""" +
                        """"originalCwd":"","managedOnly":false,"withheld":true}}""",
                ),
            )!!

        assertTrue(read.withheld)
        assertEquals(listOf(WorkspaceDirectory("/a", "cliArg")), read.directories)
    }

    @Test
    fun `type only - an answer with no state reads as nothing`() {
        assertNull(permissionRulesOf(body("""{"other":1}""")))
    }

    @Test
    fun `type only - the text of a record says counts and no rule, path or message`() {
        val read =
            permissionRulesOf(
                state(
                    """"rules":[{"behavior":"deny","source":"session","rule":"Secret","editability":"session"}],""" +
                        """"workspaceDirectories":[{"path":"/private","source":"cliArg"}],""" +
                        """"errors":[{"file":"/home/me/x","path":"","message":"hidden words"}]""",
                ),
            )!!
        val shown = read.toString() + read.rules + read.directories + read.errors

        assertAll(
            { assertFalse("Secret" in shown) },
            { assertFalse("/private" in shown) },
            { assertFalse("hidden words" in shown) },
            { assertFalse("/home/me" in shown) },
        )
    }

    private fun HostState.with(input: PresenterInput) = next(input)

    private fun HostState.with(event: AgentEvent) = next(PresenterInput.Event(event))

    private fun HostState.ops() = transcript.operations

    private fun HostState.request(
        id: String,
        kind: ControlKind,
    ) = with(PresenterInput.ControlRequested(id, kind, null))

    private val oneRule =
        """{"state":{"rules":[{"behavior":"deny","source":"session","rule":"Bash","editability":"session"}],""" +
            """"workspaceDirectories":[],"originalCwd":"/w","managedOnly":false}}"""

    @Test
    fun `type only - the rules answer is kept and the request stops waiting`() {
        val asked = HostState().request("r1", ControlKind.PERMISSION_RULES)
        assertEquals(listOf("r1"), asked.ops().rulesWaiting)
        val answered = asked.with(Lines.controlOk("r1", oneRule))
        assertEquals(
            listOf("Bash"),
            answered
                .ops()
                .rules!!
                .rules
                .map { it.rule },
        )
        assertTrue(answered.ops().rulesWaiting.isEmpty())
        assertNull(answered.ops().rulesFailure)
        assertSame(
            answered.transcript,
            answered.with(Lines.controlOk("r1")).transcript,
            "a second answer changes nothing",
        )
    }

    @Test
    fun `type only - a refused rules request keeps the sentence and the rules before it`() {
        val before =
            HostState().request("r1", ControlKind.PERMISSION_RULES).with(Lines.controlOk("r1", oneRule))
        val refused = before.request("r2", ControlKind.PERMISSION_RULES).with(Lines.controlError("r2", "not now"))
        assertEquals("not now", refused.ops().rulesFailure)
        assertEquals(before.ops().rules, refused.ops().rules)
        assertTrue(refused.ops().rulesWaiting.isEmpty())
        val cleared = refused.request("r3", ControlKind.PERMISSION_RULES).with(Lines.controlOk("r3", oneRule))
        assertNull(cleared.ops().rulesFailure, "an answer that reads clears the refusal")
    }

    @Test
    fun `type only - the sixth rules request pushes out the oldest, and its answer changes nothing`() {
        val asked =
            (1..MAX_WAITING + 1).fold(HostState()) { state, n -> state.request("r$n", ControlKind.PERMISSION_RULES) }
        assertEquals((2..MAX_WAITING + 1).map { "r$it" }, asked.ops().rulesWaiting)
        assertSame(asked.transcript, asked.with(Lines.controlOk("r1", oneRule)).transcript)
        assertSame(asked.transcript, asked.request("r2", ControlKind.PERMISSION_RULES).transcript)
    }

    @Test
    fun `type only - a rules request that could not be written is not waited for`() {
        val failed =
            HostState()
                .request("r1", ControlKind.PERMISSION_RULES)
                .with(PresenterInput.ControlSendFailed("r1"))
        assertTrue(failed.ops().rulesWaiting.isEmpty())
        assertNull(failed.ops().rulesFailure)
        assertSame(failed.transcript, failed.with(Lines.controlOk("r1", oneRule)).transcript)
        assertNull(failed.ops().rules)
    }

    @Test
    fun `type only - a new CLI empties the table of rules requests and drops a refusal, and keeps the rules shown`() {
        val state =
            HostState()
                .request("r1", ControlKind.PERMISSION_RULES)
                .request("r2", ControlKind.PERMISSION_RULES)
                .with(Lines.controlError("r1", "no"))
        assertEquals("no", state.ops().rulesFailure)
        val launched = state.with(PresenterInput.Launched(null))
        assertTrue(launched.ops().rulesWaiting.isEmpty())
        assertNull(launched.ops().rulesFailure)
        assertSame(launched.transcript, launched.with(Lines.controlOk("r2", oneRule)).transcript)
    }
}
