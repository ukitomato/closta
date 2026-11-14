package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.core.models.RawJson
import dev.ukitomato.closta.core.models.TurnPhase
import dev.ukitomato.closta.presenter.at
import dev.ukitomato.closta.presenter.tree.JsonBool
import dev.ukitomato.closta.presenter.tree.JsonNumber
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonString
import dev.ukitomato.closta.providers.claude.fixtures.CaptureFixtures
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * What the operations console keeps in the transcript: the switches and how each ended, the context usage, the
 * tokens, the compactions, and the effort. Each is read off a capture's own lines or folded from the host's inputs.
 */
class OperationsFoldTest {
    private fun HostState.with(input: PresenterInput) = next(input)

    private fun HostState.with(event: AgentEvent) = next(PresenterInput.Event(event))

    private fun HostState.ops() = transcript.operations

    private fun HostState.request(
        id: String,
        kind: ControlKind,
        value: String? = null,
    ) = with(PresenterInput.ControlRequested(id, kind, value))

    private fun replayed(scenario: String): HostState =
        CaptureReplay.inputs(scenario).fold(HostState()) { state, input -> state.next(input) }

    @Test
    fun `07 set_model is applied, the refused mode is rejected with its sentence, and the switches stay in order`() {
        val switches = replayed("07-set-model-and-mode").ops().switches
        assertEquals(10, switches.size)
        assertEquals((1..10).toList(), switches.map { it.seq })
        val refused = switches.single { it.outcome == SwitchOutcome.REJECTED }
        assertEquals(SwitchKind.MODE, refused.kind)
        assertEquals("bypassPermissions", refused.value)
        assertEquals("07-set-model-and-mode-req-8", refused.id)
        assertEquals(
            "Cannot set permission mode to bypassPermissions because it is disabled by settings or configuration",
            refused.detail,
        )
        assertTrue(switches.filter { it !== refused }.all { it.outcome == SwitchOutcome.APPLIED && it.detail == null })
    }

    @Test
    fun `an answer that comes before its request is known changes nothing, and the request then stays pending`() {
        val before = HostState()
        val early = before.with(Lines.controlOk("r1"))
        assertSame(before.transcript, early.transcript, "an id nobody asked with")
        val asked = early.request("r1", ControlKind.MODEL, "opus")
        assertEquals(
            SwitchOutcome.PENDING,
            asked
                .ops()
                .switches
                .single()
                .outcome,
        )
        assertEquals(
            SwitchOutcome.APPLIED,
            asked
                .with(Lines.controlOk("r1"))
                .ops()
                .switches
                .single()
                .outcome,
        )
    }

    @Test
    fun `an answer is taken once, and a send that failed is failed`() {
        val applied =
            HostState()
                .request(
                    "r1",
                    ControlKind.MODE,
                    "plan",
                ).with(Lines.controlOk("r1", """{"mode":"plan"}"""))
        val again = applied.with(Lines.controlError("r1", "late"))
        assertSame(applied.transcript, again.transcript, "a settled switch is not answered twice")
        val failed =
            HostState()
                .request("r2", ControlKind.MODEL, "opus")
                .with(PresenterInput.ControlSendFailed("r2"))
        assertEquals(
            SwitchOutcome.FAILED,
            failed
                .ops()
                .switches
                .single()
                .outcome,
        )
        val afterwards = failed.with(Lines.controlOk("r2"))
        assertSame(failed.transcript, afterwards.transcript, "an answer after a failed send is not an applied switch")
        val unknown = failed.with(PresenterInput.ControlSendFailed("nobody"))
        assertSame(failed.transcript, unknown.transcript)
    }

    @Test
    fun `a refusal without a sentence says so, and a long one is cut`() {
        val bare =
            HostState()
                .request("r1", ControlKind.MODE, "plan")
                .with(AgentEvent.ControlResponse(RawJson("{}"), "r1", "error", null))
        assertEquals(
            "The request was refused.",
            bare
                .ops()
                .switches
                .single()
                .detail,
        )
        val long =
            HostState().request("r1", ControlKind.MODE, "plan").with(Lines.controlError("r1", "x".repeat(2000)))
        assertEquals(
            MAX_DETAIL,
            long
                .ops()
                .switches
                .single()
                .detail!!
                .length,
        )
    }

    @Test
    fun `the 21st switch pushes the oldest out, and its answer is then an answer nobody asked for`() {
        var state = HostState()
        for (n in 1..MAX_SWITCHES + 1) state = state.request("r$n", ControlKind.MODEL, "m$n")
        val kept = state.ops().switches
        assertEquals(MAX_SWITCHES, kept.size)
        assertEquals("r2", kept.first().id)
        assertEquals((2..MAX_SWITCHES + 1).toList(), kept.map { it.seq })
        val answered = state.with(Lines.controlOk("r1"))
        assertSame(state.transcript, answered.transcript, "the pushed-out request's answer is dropped")
        assertEquals(
            SwitchOutcome.APPLIED,
            state
                .with(Lines.controlOk("r2"))
                .ops()
                .switches
                .first()
                .outcome,
        )
    }

    @Test
    fun `06 the answer to the usage request is the context, and a request with no answer is not shown`() {
        val state = replayed("06-context-usage")
        assertEquals(ContextRecord(11529, 1000000, 1.0, 967000), state.ops().context)
        assertTrue(state.ops().waiting.isEmpty(), "answered, so no longer waited for")
        assertTrue(state.ops().switches.isEmpty(), "a usage request is not a switch")
    }

    @Test
    fun `an answer to the usage request while a turn is open sets the thread's context before the turn ends`() {
        // 01's host once its turn has opened and no result has come: the CLI answers in the middle of the turn.
        var state = HostState()
        for (input in CaptureReplay.inputs("01-baseline-text")) {
            state = state.next(input)
            if (state.conversation.turns.any { it.phase == TurnPhase.OPEN }) break
        }
        assertTrue(state.conversation.turns.any { it.phase == TurnPhase.OPEN }, "a turn is open")
        val projector = TreeProjector()

        fun thread(host: HostState) =
            projector.project(listOf(host.source(CaptureReplay.THREAD))).at("threads", "byId", CaptureReplay.THREAD)
        assertNull(thread(state)["context"])
        val answered =
            state
                .request("u1", ControlKind.CONTEXT)
                .with(Lines.controlOk("u1", """{"totalTokens":16575,"maxTokens":200000,"percentage":8}"""))
        // The turn is still open, and the tree is running, as it was; only the context is new.
        assertTrue(answered.conversation.turns.any { it.phase == TurnPhase.OPEN }, "the turn is still open")
        val after = thread(answered)
        assertEquals(JsonBool.TRUE, after["isRunning"])
        assertEquals(JsonNumber("16575"), after.at("context")["totalTokens"])
        assertEquals(JsonNumber("200000"), after.at("context")["maxTokens"])
        assertEquals(JsonNumber("8"), after.at("context")["percentage"])
    }

    @Test
    fun `an error answer or an unreadable body leaves the context as it was, and ends the wait`() {
        val answered = replayed("06-context-usage")
        val again = answered.request("u9", ControlKind.CONTEXT)
        assertEquals(listOf("u9"), again.ops().waiting)
        val refused = again.with(Lines.controlError("u9", "no"))
        assertEquals(answered.ops().context, refused.ops().context)
        assertTrue(refused.ops().waiting.isEmpty())
        val odd = answered.request("u10", ControlKind.CONTEXT).with(Lines.controlOk("u10", """{"totalTokens":"x"}"""))
        assertEquals(answered.ops().context, odd.ops().context)
        assertTrue(odd.ops().waiting.isEmpty())
    }

    @Test
    fun `six usage requests with no answer keep the newest five, and the oldest one's answer is dropped`() {
        var state = HostState()
        for (n in 1..MAX_WAITING + 1) state = state.request("u$n", ControlKind.CONTEXT)
        assertEquals((2..MAX_WAITING + 1).map { "u$it" }, state.ops().waiting)
        val body = """{"totalTokens":5,"maxTokens":10,"percentage":50}"""
        val late = state.with(Lines.controlOk("u1", body))
        assertSame(state.transcript, late.transcript)
        val kept = state.with(Lines.controlOk("u2", body))
        assertEquals(ContextRecord(5, 10, 50.0, null), kept.ops().context)
        assertEquals((3..MAX_WAITING + 1).map { "u$it" }, kept.ops().waiting)
    }

    @Test
    fun `a failed send of a usage request is no longer waited for`() {
        val state = HostState().request("u1", ControlKind.CONTEXT).with(PresenterInput.ControlSendFailed("u1"))
        assertTrue(state.ops().waiting.isEmpty())
    }

    @Test
    fun `10 the tokens are the last result's totals over the models, not a sum of results`() {
        val results =
            CaptureReplay
                .inputs("10-background-task")
                .map { it to ((it as? PresenterInput.Event)?.event as? AgentEvent.Result) }
        val states = ArrayList<TokenTotals>()
        var state = HostState()
        for ((input, result) in results) {
            state = state.next(input)
            if (result != null) states += state.ops().tokens!!
        }
        assertEquals(2, states.size)
        // 261 and then 1512 output tokens, from the one model: each result replaces the one before.
        assertEquals(listOf(261L, 1512L), states.map { it.output })
        assertEquals(listOf(4L, 22L), states.map { it.input })
        assertEquals(listOf(27517L, 116597L), states.map { it.cacheRead })
        assertEquals(listOf(8514L, 26626L), states.map { it.cacheCreation })
        assertEquals(0.21456340000000002, state.conversation.usage.sessionCostUsd)
    }

    @Test
    fun `a result that names no model says nothing of the tokens`() {
        val usage = """{"m":{"inputTokens":3,"outputTokens":4,"cacheReadInputTokens":5,"cacheCreationInputTokens":6}}"""
        val counted = HostState().with(Lines.result(null, modelUsage = usage))
        assertEquals(TokenTotals(3, 4, 5, 6), counted.ops().tokens)
        val bare = counted.with(Lines.result(null))
        assertSame(counted.transcript.operations.tokens, bare.ops().tokens)
        val odd = counted.with(Lines.result(null, modelUsage = """{"m":{"inputTokens":"x"},"n":7}"""))
        assertEquals(TokenTotals(0, 0, 0, 0), odd.ops().tokens, "a figure that is not a number counts as none")
        assertNull(HostState().with(Lines.result(null)).ops().tokens)
    }

    @Test
    fun `21 the compaction is kept with its trigger and both counts, and compacting follows the status`() {
        var state = HostState()
        val seen = ArrayList<Pair<AgentEvent, Boolean>>()
        for (input in CaptureReplay.inputs("21-compact")) {
            state = state.next(input)
            val event = (input as? PresenterInput.Event)?.event
            if (event is AgentEvent.SystemStatus) seen += event to state.ops().compacting
        }
        assertEquals(
            listOf("requesting", "compacting", null),
            seen
                .map {
                    it.first as AgentEvent.SystemStatus
                }.map { it.status }
                .distinct(),
        )
        assertTrue(seen.single { (it.first as AgentEvent.SystemStatus).status == "compacting" }.second)
        assertTrue(!state.ops().compacting, "the status after it says it is over")
        assertEquals(listOf(CompactionRecord(1, "manual", 21719, 3378)), state.ops().compactions)
    }

    @Test
    fun `a status that only names the mode does not end compacting, and a boundary with no counts is no compaction`() {
        val compacting = HostState().with(Lines.statusOnly("compacting"))
        assertTrue(compacting.ops().compacting)
        val moded = compacting.with(Lines.status("plan"))
        assertSame(
            compacting.transcript,
            moded.transcript,
            "capture 07: a mode switch is answered with status null and a mode",
        )
        assertTrue(!moded.with(Lines.statusOnly(null)).ops().compacting)
        assertTrue(!moded.with(Lines.statusOnly("requesting")).ops().compacting)
        val noCounts = compacting.with(Lines.compactBoundary("""{"trigger":"auto"}"""))
        assertSame(compacting.transcript, noCounts.transcript)
        val noTrigger = compacting.with(Lines.compactBoundary("""{"pre_tokens":9,"post_tokens":3}"""))
        assertEquals(CompactionRecord(1, "unknown", 9, 3), noTrigger.ops().compactions.single())
    }

    @Test
    fun `compactions and switches share one count of seq, and 20 compactions are kept`() {
        var state = HostState().request("r1", ControlKind.MODE, "plan")
        for (n in 1..MAX_COMPACTIONS + 1) {
            state = state.with(Lines.compactBoundary("""{"trigger":"auto","pre_tokens":$n,"post_tokens":1}"""))
        }
        assertEquals(
            1,
            state
                .ops()
                .switches
                .single()
                .seq,
        )
        assertEquals(MAX_COMPACTIONS, state.ops().compactions.size)
        assertEquals(
            3,
            state
                .ops()
                .compactions
                .first()
                .seq,
            "the first compaction was seq 2, and it is the one pushed out",
        )
        assertEquals(MAX_COMPACTIONS + 2, state.ops().seq)
    }

    @Test
    fun `03 the initialize response gives the models, and one without models leaves the ones it has`() {
        val state = replayed("03-initialize-handshake")
        val models = state.ops().models
        assertEquals(11, models.size)
        val default = models.first { it.value == "default" }
        assertEquals("claude-opus-5-5", default.resolvedModel)
        assertEquals("Default (recommended)", default.displayName)
        assertEquals(true, default.supportsEffort)
        assertEquals(listOf("low", "medium", "high", "xhigh", "max"), default.supportedEffortLevels)
        // The one model of 2.1.319's list that says nothing of effort.
        val haiku = models.first { it.value == "claude-haiku-4-5-20251001" }
        assertNull(haiku.supportsEffort)
        assertNull(haiku.supportedEffortLevels)
        val kept = state.with(Lines.initialized("""{"commands":[{"name":"x","description":"d"}]}"""))
        assertEquals(models, kept.ops().models)
        assertSame(models, kept.ops().models)
        val odd = state.with(Lines.initialized("""{"models":[{"displayName":"no value"},7]}"""))
        assertEquals(models, odd.ops().models, "a list with no model in it is not a list of models")
    }

    @Test
    fun `the effort the session was started with is kept, and none is none`() {
        assertEquals("high", HostState().with(PresenterInput.Launched("high")).ops().effort)
        assertNull(HostState().with(PresenterInput.Launched(null)).ops().effort)
        assertNull(HostState().with(PresenterInput.Launched("")).ops().effort)
    }

    @Test
    fun `a refused effort restart is a record that is over, with the sentence a person reads`() {
        val state = HostState().with(PresenterInput.EffortRefused("e1", "high"))
        val record = state.ops().switches.single()
        assertEquals(SwitchKind.EFFORT, record.kind)
        assertEquals("high", record.value)
        assertEquals(SwitchOutcome.REJECTED, record.outcome)
        assertEquals("A turn is running", record.detail)
        assertSame(state.transcript, state.with(PresenterInput.EffortRefused("e1", "high")).transcript)
    }

    @Test
    fun `a usage request made, and one that fails, leave the tree and every message in it the same objects`() {
        val state = replayed("01-baseline-text")
        val projector = TreeProjector()
        val before = projector.project(listOf(state.source("t")))
        val asked = state.request("u1", ControlKind.CONTEXT)
        assertSame(before, projector.project(listOf(asked.source("t"))), "the wait is not in the tree")
        val failed = asked.with(PresenterInput.ControlSendFailed("u1"))
        assertSame(before, projector.project(listOf(failed.source("t"))))
    }

    // ---- the rewind of the files ----

    private fun HostState.rewind() = transcript.operations.rewind

    private fun HostState.rewindAsked(
        id: String,
        dryRun: Boolean = true,
        sendsAt: Int = 0,
    ) = with(PresenterInput.RewindRequested(id, "c-$id", "send-2", dryRun, sendsAt, 0))

    private fun recorded(requestId: String): AgentEvent =
        CaptureFixtures.readCapture("25-rewind-files.ndjson").filterIsInstance<AgentEvent.ControlResponse>().single {
            it.requestId == requestId
        }

    @Test
    fun `25 the dry run's answer is done with the file and the lines, and the real one's is done without files`() {
        val dry = HostState().rewindAsked("25-rewind-files-req-2").with(recorded("25-rewind-files-req-2")).rewind()!!
        assertEquals(RewindOutcome.DONE, dry.outcome)
        assertEquals(1, dry.files.size)
        assertTrue(dry.files.single().endsWith("/cwd/note.txt"))
        assertEquals(1, dry.filesTotal)
        assertEquals(1L, dry.insertions)
        assertEquals(1L, dry.deletions)
        assertEquals("c-25-rewind-files-req-2", dry.commandId)
        assertTrue(dry.dryRun)
        val real =
            HostState()
                .rewindAsked("25-rewind-files-req-3", dryRun = false)
                .with(recorded("25-rewind-files-req-3"))
                .rewind()!!
        assertEquals(RewindOutcome.DONE, real.outcome)
        assertTrue(real.files.isEmpty())
        assertEquals(0, real.filesTotal)
        assertFalse(real.dryRun)
    }

    @Test
    fun `a rewind the CLI cannot do is refused with its error, and an error answer or a failed write is failed`() {
        val refused =
            HostState()
                .rewindAsked("r1")
                .with(Lines.controlOk("r1", """{"canRewind":false,"error":"$NO_CHECKPOINT"}"""))
                .rewind()!!
        assertEquals(RewindOutcome.REFUSED, refused.outcome)
        assertEquals(NO_CHECKPOINT, refused.detail)
        val bare = HostState().rewindAsked("r2").with(Lines.controlOk("r2", """{"canRewind":false}""")).rewind()!!
        assertEquals(RewindOutcome.REFUSED, bare.outcome)
        assertEquals("The request was refused.", bare.detail)
        val errored = HostState().rewindAsked("r3").with(Lines.controlError("r3", "boom")).rewind()!!
        assertEquals(RewindOutcome.FAILED, errored.outcome)
        assertEquals("boom", errored.detail)
        val unsent = HostState().rewindAsked("r4").with(PresenterInput.ControlSendFailed("r4")).rewind()!!
        assertEquals(RewindOutcome.FAILED, unsent.outcome)
        assertEquals(REWIND_SEND_FAILED, unsent.detail)
    }

    @Test
    fun `a success whose body cannot be read is failed, not the CLI's refusal`() {
        for (answer in listOf(
            Lines.controlOk("r1"),
            Lines.controlOk("r1", """{"canRewind":"yes"}"""),
            Lines.controlOk("r1", "[]"),
        )) {
            val record = HostState().rewindAsked("r1").with(answer).rewind()!!
            assertEquals(RewindOutcome.FAILED, record.outcome)
            assertEquals(REWIND_UNREADABLE, record.detail)
        }
    }

    @Test
    fun `a rewind the host did not send is a record that is over at once, and an answer for it changes nothing`() {
        val state = HostState().with(PresenterInput.RewindNotSent("c9", "send-2", false, REWIND_CHECK_FIRST))
        val record = state.rewind()!!
        assertEquals(RewindOutcome.FAILED, record.outcome)
        assertEquals(REWIND_CHECK_FIRST, record.detail)
        assertEquals("c9", record.commandId)
        assertSame(state.transcript, state.with(Lines.controlOk("anything", """{"canRewind":true}""")).transcript)
    }

    @Test
    fun `more than 200 files are 200 and the total, and only the last rewind is kept`() {
        val many = (1..201).joinToString(",") { "\"/p/$it\"" }
        val state =
            HostState().rewindAsked("r1").with(Lines.controlOk("r1", """{"canRewind":true,"filesChanged":[$many]}"""))
        val record = state.rewind()!!
        assertEquals(MAX_REWIND_FILES, record.files.size)
        assertEquals(201, record.filesTotal)
        val second = state.rewindAsked("r2", sendsAt = 3)
        assertEquals("r2", second.rewind()!!.requestId)
        assertEquals(RewindOutcome.PENDING, second.rewind()!!.outcome)
        assertTrue(second.rewind()!!.files.isEmpty())
        // The first one's answer, late, is for an id that is not the last: nothing.
        assertSame(second.transcript, second.with(Lines.controlOk("r1", """{"canRewind":true}""")).transcript)
        // An answer is taken once.
        val done = second.with(Lines.controlOk("r2", """{"canRewind":true}"""))
        assertSame(done.transcript, done.with(Lines.controlError("r2", "late")).transcript)
    }

    @Test
    fun `the tree's rewind follows the record, carries no host mark, and is absent until one is asked`() {
        val projector = TreeProjector()
        val none = HostState()

        fun rewindOf(state: HostState): JsonObject? =
            projector.project(listOf(state.source("t"))).at("threads", "byId", "t")["rewind"] as? JsonObject
        assertNull(rewindOf(none))
        val asked = none.rewindAsked("r1", sendsAt = 7)
        val pending = rewindOf(asked)!!
        assertEquals(
            setOf("commandId", "messageId", "dryRun", "outcome", "files", "filesTotal", "insertions", "deletions"),
            pending.keys,
        )
        assertEquals("pending", (pending["outcome"] as JsonString).value)
        val body = """{"canRewind":true,"filesChanged":["/a"],"insertions":2,"deletions":3}"""
        val done = asked.with(Lines.controlOk("r1", body))
        val node = rewindOf(done)!!
        assertEquals("done", (node["outcome"] as JsonString).value)
        assertEquals("2", (node["insertions"] as JsonNumber).text)
        assertEquals("1", (node["filesTotal"] as JsonNumber).text)
    }

    private companion object {
        const val MAX_DETAIL = 500
        const val NO_CHECKPOINT = "No file checkpoint found for this message."
    }

    // The permission mode an `initialize` answer names, on a synthetic answer: every capture has
    // default or acceptEdits, so the edges are read here.
    private fun modeAnswer(
        mode: String,
        subtype: String = "success",
    ) = AgentEvent.ControlResponse(RawJson("""{"response":{"current_permission_mode":$mode}}"""), "r1", subtype, null)

    private fun startMode(
        transcript: Transcript,
        event: AgentEvent.ControlResponse,
    ) = foldCommandsOfResponse(transcript, event).operations.startPermissionMode

    @Test
    fun `the start mode is read from an initialize answer, and not from a bad one`() {
        assertEquals("plan", startMode(Transcript(), modeAnswer("\"plan\"")))
        val noKey = AgentEvent.ControlResponse(RawJson("""{"response":{"commands":[]}}"""), "r1", "success", null)
        assertNull(startMode(Transcript(), noKey), "no key")
        assertNull(startMode(Transcript(), modeAnswer("\"\"")), "an empty word is no mode")
        assertNull(startMode(Transcript(), modeAnswer("5")), "not a string")
        assertNull(startMode(Transcript(), modeAnswer("\"plan\"", subtype = "error")), "an error answer says nothing")
    }

    @Test
    fun `an answer with no mode leaves the one the transcript has, and a new one replaces it`() {
        val planned = foldCommandsOfResponse(Transcript(), modeAnswer("\"plan\""))
        val without = foldCommandsOfResponse(planned, modeAnswer("\"\""))
        assertEquals("plan", without.operations.startPermissionMode)
        assertSame(planned, foldCommandsOfResponse(planned, modeAnswer("\"plan\"")), "the same word changes nothing")
        assertEquals("auto", startMode(planned, modeAnswer("\"auto\"")))
    }
}
