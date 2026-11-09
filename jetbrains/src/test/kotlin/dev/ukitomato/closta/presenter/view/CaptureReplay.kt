package dev.ukitomato.closta.presenter.view

import com.google.gson.JsonParser
import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.core.models.ApprovalDecision
import dev.ukitomato.closta.core.models.AttachmentKind
import dev.ukitomato.closta.core.models.ConversationState
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.providers.claude.fixtures.CaptureFixtures
import java.util.Base64

/**
 * Replays a capture the way the host lived it. Stdout alone is not the conversation: the recorder also wrote
 * the user's messages and its answers to `can_use_tool` on stdin (`recorder/scenarios.mjs`), so those come
 * back here as host inputs, where the recorder sent them — a [PresenterInput.UserSent] right before the
 * `command_lifecycle{queued}` that answers it, a [PresenterInput.Decided] right after each `control_request`.
 */
object CaptureReplay {
    const val THREAD = "thread-1"

    /** What each scenario sent, verbatim from `recorder/scenarios.mjs` (the driver filled `{OUTSIDE}` in). */
    private val SENT: Map<String, List<String>> =
        mapOf(
            "01-baseline-text" to listOf("Respond with exactly one word: pong"),
            "02-tool-bash-autorun" to
                listOf("Run this exact bash command and report its output: echo hello-from-capture"),
            "03-initialize-handshake" to listOf("Respond with exactly one word: pong"),
            "04-tool-autorun-with-ppt-stdio" to
                listOf("Run this exact bash command and report its output: echo should-be-denied"),
            "05-permission-can-use-tool" to
                listOf("Use the Write tool to create the file {OUTSIDE}/note.txt containing exactly the text: hello"),
            "06-context-usage" to emptyList(),
            "07-set-model-and-mode" to emptyList(),
            "08-subagent-task" to
                listOf(
                    "Use the Agent tool to spawn one subagent (subagent_type \"Explore\", run_in_background false) " +
                        "that reads the file NOTES.md in the current directory and reports a one-sentence summary. " +
                        "Then relay the summary.",
                ),
            "09-parallel-subagents" to
                listOf(
                    "Use the Agent tool to spawn two subagents in parallel in a single message " +
                        "(both subagent_type \"Explore\", run_in_background false): " +
                        "one reads NOTES.md and the other reads GUIDE.md in the current directory, " +
                        "each reporting a one-sentence summary. Then relay both.",
                ),
            "10-background-task" to
                listOf(
                    "Use the Agent tool with run_in_background true to run the bash command " +
                        "`sleep 45 && echo bg-done` and report its output once it completes.",
                ),
            "11-background-followup" to
                listOf(
                    "Use the Agent tool with run_in_background true to run the bash command " +
                        "`sleep 40 && echo bg2-done` and report its output once it completes.",
                    "While that runs: respond with exactly one character: 4 (what is 2+2)",
                ),
            "12-subagent-permission" to
                listOf(
                    "Use the Agent tool to spawn a subagent " +
                        "(subagent_type \"general-purpose\", run_in_background false) " +
                        "that uses the Write tool to create the file {OUTSIDE}/probe.txt " +
                        "containing exactly the text hello. " +
                        "Then report done.",
                ),
            "13-ask-timeout" to listOf(ASK),
            "14-ask-answers-updatedinput" to listOf(ASK),
            "15-ask-afktimeout-updatedinput" to listOf(ASK),
            // Recorded with 2.1.282 too, the user's settings left out (recorder/scenarios.mjs ISOLATED).
            "16-permission-suggestion-accept" to
                listOf(
                    "Use the Write tool to create the file {OUTSIDE}/note.txt containing exactly the text: hello. " +
                        "Then use the Read tool to read {OUTSIDE}/note.txt and report its exact content.",
                ),
            "17-edit-approval" to
                listOf(
                    "Use the Edit tool to replace the text old-value with new-value in the file EDITME.md. " +
                        "Then report done.",
                ),
            "18-ask-multi-question" to
                listOf(
                    "Use the AskUserQuestion tool once, with two questions in the same call: " +
                        "first \"AとBどちらがいいですか？\" (header \"選択肢\") with options A (\"Aを選択します\") and " +
                        "B (\"Bを選択します\"), multiSelect false; " +
                        "second \"XとYどちらにしますか？\" (header \"もう一つ\") with options X (\"Xを選択します\") and " +
                        "Y (\"Yを選択します\"), multiSelect false. " +
                        "Then report the answers.",
                ),
            "19-interrupt-background" to
                listOf(
                    "Use the Agent tool with run_in_background true to run the bash command " +
                        "`sleep 60 && echo bg-interrupt-done` and report its output once it completes.",
                ),
            "20-todowrite" to
                listOf(
                    "Use the TodoWrite tool to record a todo list with exactly two items: " +
                        "\"write tests\" (status pending) and \"run build\" (status in_progress). Then report done.",
                ),
            "21-compact" to listOf("Respond with exactly one word: pong", "/compact"),
            // Two CLIs of one session. The first took the Bash turn, the second (`--resume`) took the second
            // prompt.
            "22-resume" to
                listOf(
                    "Run this exact bash command and report its output: echo hello-from-resume",
                    "Respond with exactly one word: pong",
                ),
            // One CLI took two turns, each a file ahead of a sentence (what the files were is in the stdin lines).
            "23-attachments" to
                listOf(
                    "What is the single color of this image? Answer with exactly one word.",
                    "What is the single word written in this PDF? Answer with exactly that word.",
                ),
            // One CLI took MCP control requests only, no user turn (the stdin lines are in 24's stdin file).
            "24-mcp-management" to emptyList(),
            // One CLI took control requests only (get_settings and apply_flag_settings), no user turn.
            "28-effort-live" to emptyList(),
            "29-exit-plan-mode" to
                listOf(
                    "Make a short plan to fix the spelling of the headings in README.md, " +
                        "then call ExitPlanMode with it. " +
                        "Once it is approved, make the fix with the Edit tool and report done.",
                ),
            // The old "Don't answer": AskUserQuestion denied with an empty reason, the API's 400, then one more send
            // (the same 400).
            "30-deny-empty-message" to listOf(ASK, "Say OK."),
            // A second message sent while the first turn ran: the CLI took it into that turn (one result for both).
            "31-send-mid-turn" to
                listOf(
                    "Run the Bash command `sleep 8; echo done` and then tell me its output in one line.",
                    "Also end your reply with the word hi.",
                ),
            // Interrupted while the foreground Bash ran: the turn ends with an error_during_execution result.
            "32-interrupt-foreground" to
                listOf(
                    "Run the Bash command `sleep 30; echo fg-interrupt-done` in the foreground " +
                        "and then tell me its output.",
                ),
            // Three turns of one CLI with two rewind_files control requests between the second and the third.
            "25-rewind-files" to
                listOf(
                    "Use the Write tool to create the file note.txt in the current directory containing exactly the " +
                        "text: first",
                    "Use the Read tool to read note.txt in the current directory, then use the Write tool to " +
                        "overwrite note.txt with exactly the text: second",
                    "Use the Read tool to read note.txt in the current directory and report its content exactly as " +
                        "it is.",
                ),
            // Two CLIs of one session; the second (`--resume --fork-session`) took the second prompt.
            "26-fork-session" to
                listOf(
                    "Run this exact bash command and report its output: echo kiwi-from-fork",
                    "Reply in one line: the word forked, then a space, then the output of the command you ran " +
                        "earlier.",
                ),
            // Two CLIs of one session; the second (`--resume --fork-session --resume-session-at`) took the
            // last prompt.
            "27-resume-session-at" to
                listOf(
                    "Remember the word alpha. Reply with only: ok",
                    "Remember the word bravo too. Reply with only: ok",
                    "List every word I asked you to remember, comma separated, nothing else.",
                ),
            // Checkpoint 4. 33 turned the sandbox on and off with apply_flag_settings around one Bash turn.
            "33-sandbox-live" to listOf(SANDBOX_PROBE),
            // 34, 35 and 40 took control requests only (initialize and get_settings), no user turn.
            "34-sandbox-launch" to emptyList(),
            "35-sandbox-project-setting" to emptyList(),
            // The first CLI refused to start; the second, without the sandbox, took the one Bash turn.
            "36-sandbox-unavailable" to listOf(SANDBOX_PROBE),
            "37-plan-auto" to listOf(PLAN_README),
            "38-plan-bypass" to listOf(PLAN_README),
            // Two CLIs of one session; the second (`--resume --settings`, in the sandbox) took the Bash turn.
            "39-sandbox-resume" to listOf("Respond with exactly one word: pong", SANDBOX_PROBE),
            "40-sandbox-same-id" to emptyList(),
        )

    private const val SANDBOX_PROBE =
        "Run this exact bash command once and report its output: touch {OUTSIDE}/sandbox-probe.txt. " +
            "If it fails, do not retry it in any other way; just report the error message."

    private const val PLAN_README =
        "Make a short plan to fix the spelling of the headings in README.md, then call ExitPlanMode with it. " +
            "Once it is approved, make the fix with the Edit tool and report done."

    private const val ASK =
        "Use the AskUserQuestion tool to ask the question \"AとBどちらがいいですか？\" " +
            "(header \"選択肢\") with two options: A (\"Aを選択します\") and B (\"Bを選択します\"), multiSelect false."

    /**
     * How the recorder answered each `can_use_tool`: 05 and 12 allowed (any wait), 13 allowed at once (the
     * no-answer path), 14 answered after 5 s, 15 let the AFK timeout run after 5 s. 16 and 17 allowed,
     * 18 answered both questions after 2 s. Only the decision comes back here: what else the recorder sent (16's
     * suggestions and rewritten input) reaches the projection through stdout, not through these inputs.
     */
    private val ANSWERS: Map<String, (String) -> PresenterInput.Decided> =
        mapOf(
            "05-permission-can-use-tool" to { id -> PresenterInput.Decided(ApprovalDecision.Allow(id), 1_000) },
            "12-subagent-permission" to { id -> PresenterInput.Decided(ApprovalDecision.Allow(id), 1_000) },
            "13-ask-timeout" to { id -> PresenterInput.Decided(ApprovalDecision.Allow(id), 0) },
            "14-ask-answers-updatedinput" to { id -> PresenterInput.Decided(ApprovalDecision.Answered(id), 5_000) },
            "15-ask-afktimeout-updatedinput" to { id ->
                PresenterInput.Decided(ApprovalDecision.AfkTimeout(id), 5_000)
            },
            "16-permission-suggestion-accept" to { id -> PresenterInput.Decided(ApprovalDecision.Allow(id), 1_000) },
            "17-edit-approval" to { id -> PresenterInput.Decided(ApprovalDecision.Allow(id), 1_000) },
            "25-rewind-files" to { id -> PresenterInput.Decided(ApprovalDecision.Allow(id), 1_000) },
            "18-ask-multi-question" to { id -> PresenterInput.Decided(ApprovalDecision.Answered(id), 2_000) },
            // Checkpoint 3: the plan's ExitPlanMode, then the Edit it planned; the recorder allowed both at once.
            "29-exit-plan-mode" to { id -> PresenterInput.Decided(ApprovalDecision.Allow(id), 0) },
            "30-deny-empty-message" to { id -> PresenterInput.Decided(ApprovalDecision.Deny(id), 0) },
            // Checkpoint 4, all allowed at once: 36's Bash `touch` (the sandbox was not in force), 37's ExitPlanMode,
            // 38's ExitPlanMode and the Edit after it. 39 asked for nothing (the sandbox ran its Bash), but would be
            // allowed the same way. What else the recorder sent (the setMode in updatedPermissions) reaches the
            // projection through stdout.
            "36-sandbox-unavailable" to { id -> PresenterInput.Decided(ApprovalDecision.Allow(id), 0) },
            "37-plan-auto" to { id -> PresenterInput.Decided(ApprovalDecision.Allow(id), 0) },
            "38-plan-bypass" to { id -> PresenterInput.Decided(ApprovalDecision.Allow(id), 0) },
            "39-sandbox-resume" to { id -> PresenterInput.Decided(ApprovalDecision.Allow(id), 0) },
        )

    /**
     * What the recorder asked the CLI for with a control request that the host's own record is for, by the
     * request's id (`recorder/scenarios.mjs`): 06's context usage, and 07's switches in the order it sent them.
     */
    private val REQUESTS: Map<String, Map<String, PresenterInput.ControlRequested>> =
        mapOf(
            "06-context-usage" to
                mapOf(
                    "06-context-usage-req-2" to
                        PresenterInput.ControlRequested("06-context-usage-req-2", ControlKind.CONTEXT),
                ),
            "07-set-model-and-mode" to
                buildMap {
                    val models = listOf("opus", "default", "sonnet", "default")
                    models.forEachIndexed { index, model -> request(ControlKind.MODEL, "req-${index + 2}", model) }
                    val modes = listOf("plan", "acceptEdits", "bypassPermissions", "auto", "dontAsk", "manual")
                    modes.forEachIndexed { index, mode -> request(ControlKind.MODE, "req-${index + 6}", mode) }
                },
            // The recorder asked for the list four times, turned the server off and on, reconnected it, and
            // turned a name the CLI does not know off (req-1 is the initialize).
            "24-mcp-management" to
                buildMap {
                    val name = "fake-echo"
                    mcp(ControlKind.MCP_STATUS, 2)
                    mcp(ControlKind.MCP_DISABLE, 3, name)
                    mcp(ControlKind.MCP_STATUS, 4)
                    mcp(ControlKind.MCP_ENABLE, 5, name)
                    mcp(ControlKind.MCP_STATUS, 6)
                    mcp(ControlKind.MCP_RECONNECT, 7, name)
                    mcp(ControlKind.MCP_STATUS, 8)
                    mcp(ControlKind.MCP_DISABLE, 9, "no-such-server")
                },
            // The settings after the initialize (req-1), then an effort and the settings again, three times. The
            // last effort was null (the model's default): the host never sends one, so its record has no value.
            "28-effort-live" to
                buildMap {
                    val efforts = listOf("high", "low", null)
                    effortLive(ControlKind.SETTINGS, 2)
                    efforts.forEachIndexed { index, effort ->
                        effortLive(ControlKind.EFFORT, 3 + index * 2, effort)
                        effortLive(ControlKind.SETTINGS, 4 + index * 2)
                    }
                },
        )

    private fun MutableMap<String, PresenterInput.ControlRequested>.effortLive(
        kind: ControlKind,
        number: Int,
        value: String? = null,
    ) {
        val id = "28-effort-live-req-$number"
        put(id, PresenterInput.ControlRequested(id, kind, value))
    }

    private fun MutableMap<String, PresenterInput.ControlRequested>.mcp(
        kind: ControlKind,
        number: Int,
        value: String? = null,
    ) {
        val id = "24-mcp-management-req-$number"
        put(id, PresenterInput.ControlRequested(id, kind, value))
    }

    private fun MutableMap<String, PresenterInput.ControlRequested>.request(
        kind: ControlKind,
        suffix: String,
        value: String,
    ) {
        val id = "07-set-model-and-mode-$suffix"
        put(id, PresenterInput.ControlRequested(id, kind, value))
    }

    /**
     * What the recorder sent with each message of [scenario], from the stdin lines it kept: for each user
     * line, the points of the blocks ahead of its sentence. The recorder named no file, so the names are the tests'
     * own marks.
     */
    private fun attachedOf(scenario: String): List<List<AttachmentRecord>> {
        val stdin = CaptureFixtures.manifestStdin("$scenario.ndjson") ?: return emptyList()
        return CaptureFixtures
            .nonBlankLines(CaptureFixtures.textOf(stdin.file))
            .map { JsonParser.parseString(it).asJsonObject }
            .filter { it["type"].asString == "user" }
            .map { line ->
                val content = line["message"].asJsonObject["content"]
                if (!content.isJsonArray) {
                    emptyList()
                } else {
                    content.asJsonArray.map { it.asJsonObject }.filter { it["type"].asString != "text" }.mapIndexed {
                        index,
                        block,
                        ->
                        val source = block["source"].asJsonObject
                        val kind =
                            if (block["type"].asString ==
                                "image"
                            ) {
                                AttachmentKind.IMAGE
                            } else {
                                AttachmentKind.DOCUMENT
                            }
                        AttachmentRecord(
                            "attachment-${index + 1}",
                            kind,
                            source["media_type"].asString,
                            Base64
                                .getDecoder()
                                .decode(source["data"].asString)
                                .size
                                .toLong(),
                        )
                    }
                }
            }
    }

    fun scenarios(): List<String> =
        CaptureFixtures
            .manifest()
            .scenarios
            .map { it.scenario }
            .sorted()

    /**
     * The capture's events with the host's inputs put back where the recorder sent them. With [uuids], each message
     * is sent under the uuid the recorder gave it (the `command_uuid` of its lifecycle, which the CLI's record keeps
     * as the user line's uuid: captures 25 and 27), as the host does.
     */
    fun inputs(
        scenario: String,
        uuids: Boolean = false,
    ): List<PresenterInput> {
        val sent = SENT.getValue(scenario).iterator()
        val attached = attachedOf(scenario)
        val seen = HashSet<String>()
        val inputs = mutableListOf<PresenterInput>()
        var sends = 0
        for (event in CaptureFixtures.readCapture("$scenario.ndjson")) {
            if (event is AgentEvent.CommandLifecycle && event.state == "queued" && seen.add(event.commandUuid)) {
                sends++
                inputs +=
                    PresenterInput.UserSent(
                        "send-$sends",
                        sent.next(),
                        attached.getOrElse(sends - 1) { emptyList() },
                        uuid = event.commandUuid.takeIf { uuids },
                    )
            }
            // The host records a request before it sends it, so before the CLI's answer to it.
            if (event is AgentEvent.ControlResponse) {
                event.requestId?.let { REQUESTS[scenario]?.get(it) }?.let { inputs += it }
            }
            inputs += PresenterInput.Event(event)
            if (event is AgentEvent.ControlRequest) inputs += ANSWERS.getValue(scenario)(event.requestId)
        }
        check(!sent.hasNext()) { "$scenario: the scenario sent more than the capture shows taken" }
        return inputs
    }

    /** One input and everything after it. */
    class Step(
        val input: PresenterInput,
        val conversation: ConversationState,
        val transcript: Transcript,
        val tree: JsonObject,
    )

    /** Folds core and the transcript per input, as the host does ([HostState]), and projects after every input. */
    fun replay(
        scenario: String,
        projector: TreeProjector = TreeProjector(),
        uuids: Boolean = false,
    ): List<Step> {
        var state = HostState()
        check(projector.project(listOf(state.source(THREAD))).size == 1)
        return inputs(scenario, uuids).map { input ->
            state = state.next(input)
            Step(input, state.conversation, state.transcript, projector.project(listOf(state.source(THREAD))))
        }
    }

    fun finalTree(scenario: String): JsonObject = replay(scenario).last().tree
}
