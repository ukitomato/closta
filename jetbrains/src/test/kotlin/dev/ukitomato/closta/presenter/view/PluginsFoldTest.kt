package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.core.models.RawJson
import dev.ukitomato.closta.providers.claude.fixtures.CaptureFixtures
import org.junit.jupiter.api.Assertions.assertAll
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * The plugins the Plugins tab shows: capture 43's `system/init` holds the list (with `source`) and the capability.
 * An answer to `reload_plugins` and `plugin_errors` have no capture, so those are made by hand from the SDK's types.
 */
class PluginsFoldTest {
    private fun HostState.with(input: PresenterInput) = next(input)

    private fun HostState.with(event: AgentEvent) = next(PresenterInput.Event(event))

    private fun HostState.ops() = transcript.operations

    private fun HostState.request(id: String) = next(PresenterInput.ControlRequested(id, ControlKind.RELOAD_PLUGINS))

    private val init: AgentEvent.SystemInit =
        CaptureFixtures
            .readCapture("43-usage-and-rules.ndjson")
            .filterIsInstance<AgentEvent.SystemInit>()
            .first()

    private fun initWith(
        plugins: String,
        errors: String? = null,
    ) = init.copy(plugins = RawJson(plugins), pluginErrors = errors?.let(::RawJson))

    private val listed =
        """{"name":"a","path":"/p/a","source":"a@market","version":"1.2.0"}"""

    private fun reloadAnswer(
        id: String,
        plugins: String,
        errorCount: Int,
        commands: String = """[{"name":"fresh","description":"New","argumentHint":""}]""",
        mcp: String = """[{"name":"m","status":"connected","tools":[{"name":"t"}]}]""",
    ) = Lines.controlOk(
        id,
        """{"commands":$commands,"agents":[],"plugins":$plugins,"mcpServers":$mcp,"error_count":$errorCount}""",
    )

    @Test
    fun `43 the init lists the five built-in plugins with their source, and says it refuses a reload when busy`() {
        val state = HostState().with(init)
        val plugins = state.ops().plugins!!

        assertAll(
            { assertEquals(5, plugins.plugins.size) },
            { assertEquals("cc-plugin-sec-default", plugins.plugins[0].name) },
            { assertEquals("cc-plugin-sec-default@builtin", plugins.plugins[0].source) },
            { assertNull(plugins.plugins[0].version) },
            { assertTrue(plugins.plugins.all { it.builtIn }) },
            { assertTrue(plugins.errors.isEmpty()) },
            { assertNull(plugins.failedOnReload) },
            { assertTrue(state.ops().refuseIfBusy) },
        )
    }

    @Test
    fun `type only - a row with a version and a source is read, one without a source falls back to its path`() {
        val state =
            HostState().with(initWith("""[$listed,{"name":"b","path":"/p/b"},{"name":"c","path":"builtin"}]"""))
        val rows = state.ops().plugins!!.plugins

        assertAll(
            { assertEquals(PluginRow("a", "1.2.0", "a@market"), rows[0]) },
            { assertEquals(PluginRow("b", null, "/p/b"), rows[1]) },
            { assertFalse(rows[1].builtIn) },
            { assertEquals(PluginRow("c", null, "builtin"), rows[2]) },
            { assertTrue(rows[2].builtIn) },
            { assertFalse(rows[0].builtIn) },
        )
    }

    @Test
    fun `type only - plugin errors are listed with their message`() {
        val errors =
            """[{"plugin":"x@m","type":"path-not-found","message":"No folder"},""" +
                """{"plugin":"inline[0]","type":"generic-error","message":"Bad\u0007"},{"type":"t"}]"""
        val state = HostState().with(initWith("[$listed]", errors))

        assertEquals(
            listOf(
                PluginError("x@m", "path-not-found", "No folder"),
                PluginError("inline[0]", "generic-error", "Bad\u0007"),
            ),
            state.ops().plugins!!.errors,
        )
    }

    @Test
    fun `type only - an init without a capability list says no refusal, and the next init replaces the plugins`() {
        val first = HostState().with(initWith("[$listed]", """[{"plugin":"x","type":"t","message":"m"}]"""))
        val bare = init.copy(capabilities = RawJson("[]"), plugins = RawJson("[]"))
        val second = first.with(bare)

        assertAll(
            { assertTrue(first.ops().refuseIfBusy) },
            { assertFalse(second.ops().refuseIfBusy) },
            { assertEquals(PluginsRecord(emptyList(), emptyList()), second.ops().plugins) },
        )
    }

    @Test
    fun `an init that says what the last one said changes nothing`() {
        val state = HostState().with(init)
        assertSame(state.transcript, state.with(init).transcript)
    }

    @Test
    fun `type only - an init that lists no readable plugins leaves what was shown`() {
        val first = HostState().with(initWith("[$listed]"))
        val broken = first.with(init.copy(plugins = RawJson("not json")))
        assertEquals(first.ops().plugins, broken.ops().plugins)
    }

    @Test
    fun `type only - a reload answer replaces the plugins, the commands and the MCP servers, and drops the errors`() {
        val before =
            HostState()
                .with(initWith("[$listed]", """[{"plugin":"x","type":"t","message":"m"}]"""))
                .with(
                    Lines.controlOk(
                        "init-1",
                        """{"commands":[{"name":"old","description":"Old"}],"models":[]}""",
                    ),
                ).request("r1")
        assertEquals(listOf("r1"), before.ops().reloadWaiting)

        val after = before.with(reloadAnswer("r1", """[{"name":"n","path":"/p/n","version":"2"}]""", 0))

        assertAll(
            { assertEquals(listOf(PluginRow("n", "2", "/p/n")), after.ops().plugins!!.plugins) },
            {
                assertTrue(
                    after
                        .ops()
                        .plugins!!
                        .errors
                        .isEmpty(),
                )
            },
            { assertNull(after.ops().plugins!!.failedOnReload) },
            { assertTrue(after.ops().reloadWaiting.isEmpty()) },
            { assertNull(after.ops().reloadFailure) },
            {
                assertEquals(
                    listOf("fresh"),
                    after.transcript.commands.items
                        .map { it.name },
                )
            },
            { assertTrue(after.transcript.commands.detailed) },
            { assertEquals(listOf("m"), after.ops().mcpServers!!.map { it.name }) },
            { assertEquals(listOf("t"), after.ops().mcpServers!![0].tools) },
            { assertFalse(after.ops().mcpUnreadable) },
        )
    }

    @Test
    fun `type only - an error_count of 2 is kept as failedOnReload, and 0 is none`() {
        val failed = HostState().request("r1").with(reloadAnswer("r1", "[]", 2))
        assertEquals(2, failed.ops().plugins!!.failedOnReload)
        val clean = failed.request("r2").with(reloadAnswer("r2", "[]", 0))
        assertNull(clean.ops().plugins!!.failedOnReload)
    }

    @Test
    fun `type only - a busy refusal is told apart by its error_code, another refusal keeps the CLI's sentence`() {
        val busy =
            HostState()
                .with(initWith("[$listed]"))
                .request("r1")
                .with(refused("r1", "Session is busy", RELOAD_PLUGINS_BUSY))
        assertAll(
            { assertEquals(ReloadFailure.Busy, busy.ops().reloadFailure) },
            { assertTrue(busy.ops().reloadWaiting.isEmpty()) },
            {
                assertEquals(
                    listOf("a"),
                    busy
                        .ops()
                        .plugins!!
                        .plugins
                        .map { it.name },
                )
            },
        )
        val other = busy.request("r2").with(refused("r2", "No way", "other"))
        assertEquals(ReloadFailure.Refused("No way"), other.ops().reloadFailure)
        val plain = other.request("r3").with(Lines.controlError("r3", "Plain"))
        assertEquals(ReloadFailure.Refused("Plain"), plain.ops().reloadFailure)
        val cleared = plain.request("r4").with(reloadAnswer("r4", "[]", 0))
        assertNull(cleared.ops().reloadFailure)
    }

    @Test
    fun `type only - an answer that does not read leaves the plugins and still stops the wait`() {
        val state = HostState().with(initWith("[$listed]")).request("r1")
        val after = state.with(Lines.controlOk("r1", """{"commands":[]}"""))
        assertEquals(state.ops().plugins, after.ops().plugins)
        assertTrue(after.ops().reloadWaiting.isEmpty())
        assertSame(after.transcript, after.with(Lines.controlOk("r1")).transcript, "a second answer")
    }

    @Test
    fun `type only - a reload that could not be written is not waited for, and its late answer names nothing`() {
        val failed =
            HostState()
                .request("p1")
                .with(PresenterInput.ControlSendFailed("p1"))
        assertTrue(failed.ops().reloadWaiting.isEmpty())
        assertNull(failed.ops().reloadFailure)
        assertSame(
            failed.transcript,
            failed.with(Lines.controlOk("p1", """{"plugins":[],"error_count":0}""")).transcript,
        )
    }

    @Test
    fun `type only - a new CLI empties the table of reloads and drops a refusal, and keeps the plugins shown`() {
        val listed = Lines.controlOk("p1", """{"plugins":[{"name":"a","path":"/a"}],"error_count":0}""")
        val refused =
            HostState()
                .request("p1")
                .with(listed)
                .request("p2")
                .request("p3")
                .with(Lines.controlError("p2", "no"))
        assertEquals(ReloadFailure.Refused("no"), refused.ops().reloadFailure)
        val launched = refused.with(PresenterInput.Launched(null))
        assertAll(
            { assertTrue(launched.ops().reloadWaiting.isEmpty()) },
            { assertNull(launched.ops().reloadFailure) },
            { assertEquals(refused.ops().plugins, launched.ops().plugins) },
        )
        assertSame(launched.transcript, launched.with(Lines.controlOk("p3")).transcript)
    }

    @Test
    fun `type only - the sixth reload pushes out the oldest, and a request already known is not recorded twice`() {
        val asked =
            (1..MAX_WAITING + 1).fold(HostState()) { state, n -> state.request("p$n") }
        assertEquals((2..MAX_WAITING + 1).map { "p$it" }, asked.ops().reloadWaiting)
        assertSame(asked.transcript, asked.with(Lines.controlOk("p1")).transcript)
        assertSame(asked.transcript, asked.request("p2").transcript)
    }

    private fun refused(
        id: String,
        error: String,
        code: String,
    ) = AgentEvent.ControlResponse(
        RawJson("""{"subtype":"error","request_id":"$id","error":"$error","error_code":"$code"}"""),
        requestId = id,
        subtype = "error",
        error = error,
    )
}
