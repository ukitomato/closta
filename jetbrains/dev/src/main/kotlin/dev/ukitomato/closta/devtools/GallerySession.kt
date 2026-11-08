package dev.ukitomato.closta.devtools

import com.google.gson.JsonArray
import com.google.gson.JsonNull
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import dev.ukitomato.closta.core.models.ApprovalDecision
import dev.ukitomato.closta.core.models.AttachmentKind
import dev.ukitomato.closta.core.models.resolveApproval
import dev.ukitomato.closta.platforms.intellij.session.SessionView
import dev.ukitomato.closta.presenter.view.AttachmentRecord
import dev.ukitomato.closta.presenter.view.ChangedFile
import dev.ukitomato.closta.presenter.view.ControlKind
import dev.ukitomato.closta.presenter.view.PresenterInput
import dev.ukitomato.closta.providers.claude.protocol.StreamJsonCodec
import dev.ukitomato.closta.providers.claude.synthetic.StreamScript

/**
 * A made-up conversation with every kind of row and card, for the gallery: an ask, thinking, tool lines (one folded
 * into Explored, one failed, a sub-agent), a to-do list, a reply with a code block and a table, an allowed Bash card,
 * a turn's end, and then, waiting, a Bash card, a question card with two questions, a plan card and an Edit card. The
 * requests are in the shapes of captures 14 / 18 (AskUserQuestion), 16 / 17 (permission, Edit) and 29 (ExitPlanMode).
 * The longer tail adds attachments, a second Explored group, a long Bash output, a long failure, a Write allow and a
 * Bash deny. [firstTurn] stops after the first turn, and [withMode], [withContextUse] and [withMcp] add what a session
 * says of its permission mode (capture 07), of its context use and of its MCP servers (capture 24). Nothing in it
 * comes from a real session.
 */
@Suppress(
    "MagicNumber",
    "LongMethod",
    "CyclomaticComplexMethod",
    "TooManyFunctions",
) // a script, written out line by line
internal object GallerySession {
    const val FIRST_ASK = "gallery-ask-1"
    private const val SYNTHETIC_MODEL = "claude-synthetic"
    private const val SECOND_ASK = "gallery-ask-2"
    private const val ASK = "Retry up to 3 times when login fails. Fix AuthServiceTest.kt too"
    const val BASH_ID = "gallery-r2"
    private const val QUESTION_ID = "gallery-r3"
    private const val PLAN_ID = "gallery-r4"
    private const val EDIT_ID = "gallery-r5"

    /** Which of the second turn's requests wait (all four for the chat's gallery), or none while its tool runs. */
    enum class Waits(
        val requestIds: Set<String>,
    ) {
        ALL(setOf(BASH_ID, QUESTION_ID, PLAN_ID, EDIT_ID)),
        BASH(setOf(BASH_ID)),
        QUESTION(setOf(QUESTION_ID)),
        PLAN(setOf(PLAN_ID)),
        EDIT(setOf(EDIT_ID)),
        NOTHING(emptySet()),
    }

    /** The whole conversation: the first turn finished, the second waiting on [waits]. [ask] is its first message. */
    fun view(
        waits: Waits = Waits.ALL,
        ask: String = ASK,
        model: String = SYNTHETIC_MODEL,
    ): SessionView =
        Builder(ask, model).run {
            firstTurn(done = true)
            secondTurn(waits)
            flush()
            view
        }

    /** The first turn only, finished ([done]) or still writing its reply. */
    fun firstTurn(
        done: Boolean,
        ask: String = ASK,
        model: String = SYNTHETIC_MODEL,
    ): SessionView =
        Builder(ask, model).run {
            firstTurn(done)
            flush()
            view
        }

    /** [view] with the waiting request [requestId] allowed, as the CLI shows it once the answer reached it. */
    fun allowed(
        view: SessionView,
        requestId: String,
    ): SessionView {
        val decision = ApprovalDecision.Allow(requestId)
        return view.decided(resolveApproval(view.conversation, decision, 0), decision, 1_200)
    }

    private class Builder(
        private val ask: String,
        model: String = SYNTHETIC_MODEL,
    ) {
        val script = StreamScript("gallery", model)
        var view = SessionView()
        private var taken = 0

        fun flush() {
            script.lines.drop(taken).forEach { view = view.event(PresenterInput.Event(StreamJsonCodec.decode(it))) }
            taken = script.lines.size
        }

        fun line(json: JsonObject) {
            flush()
            view = view.event(PresenterInput.Event(StreamJsonCodec.decode(json.toString())))
        }

        fun allow(requestId: String) {
            flush()
            view = allowed(view, requestId)
        }

        fun deny(requestId: String) {
            flush()
            val decision = ApprovalDecision.Deny(requestId)
            view = view.decided(resolveApproval(view.conversation, decision, 0), decision, 900)
        }

        fun firstTurn(done: Boolean) {
            // Sent with the uuid the CLI knows it by, as a real send is: what can be rewound to depends on it.
            view = view.sent(PresenterInput.UserSent(FIRST_ASK, ask, ATTACHMENTS, uuid = "gallery-c1"))
            script.lifecycle("gallery-c1", "queued")
            script.lifecycle("gallery-c1", "started")
            script.init()
            script.assistant("gm1", listOf(thinking("Find where the retry belongs. AuthService.login calls the API.")))
            script.assistant(
                "gm2",
                listOf(StreamScript.toolUse("gt1", "Read", obj("file_path" to "/work/src/AuthService.kt"))),
            )
            script.toolResult("gt1", "class AuthService")
            script.assistant("gm3", listOf(StreamScript.toolUse("gt2", "Grep", obj("pattern" to "login\\("))))
            script.toolResult("gt2", "3 matches")
            script.assistant(
                "gm4",
                listOf(
                    StreamScript.toolUse("gt3", "Bash", obj("command" to "./gradlew :auth:compileKotlin --offline")),
                ),
            )
            script.toolResult("gt3", "e: AuthService.kt:42: Unresolved reference: retry", isError = true)
            script.assistant(
                "gm5",
                listOf(
                    StreamScript.toolUse(
                        "gt4",
                        "Agent",
                        obj("description" to "Find the callers", "prompt" to "List every caller of AuthService.login"),
                    ),
                ),
            )
            script.toolResult("gt4", "Two callers: LoginController and TokenRefresher")
            script.assistant(
                "gm6",
                listOf(
                    StreamScript.toolUse(
                        "gt5",
                        "TodoWrite",
                        JsonObject().apply {
                            add(
                                "todos",
                                JsonArray().apply {
                                    add(todo("Decide how to retry", "completed"))
                                    add(todo("Fix AuthService", "in_progress"))
                                    add(todo("Add tests and run them", "pending"))
                                },
                            )
                        },
                    ),
                ),
            )
            script.toolResult("gt5", "Todos have been modified successfully.")
            script.assistant(
                "gm7",
                listOf(
                    StreamScript.text("I'll put the retry in `AuthService.login`. Only an `IOException` counts."),
                    StreamScript.toolUse(
                        "gt6",
                        "Bash",
                        obj(
                            "command" to "./gradlew :auth:test --tests '*AuthServiceTest'",
                            "description" to "Run tests",
                        ),
                    ),
                ),
            )
            line(
                canUseTool(
                    "gallery-r1",
                    "Bash",
                    "gt6",
                    obj("command" to "./gradlew :auth:test --tests '*AuthServiceTest'"),
                ),
            )
            allow("gallery-r1")
            script.toolResult("gt6", "BUILD SUCCESSFUL in 12s")
            moreRows()
            script.assistant("gm8", listOf(StreamScript.text(REPLY)))
            if (!done) return
            flush()
            val result = StreamScript("gallery").apply { result("done") }.lines.single()
            line(
                JsonParser.parseString(result).asJsonObject.apply {
                    addProperty("user_message_uuid", "gallery-c1")
                    addProperty("duration_ms", 23_000)
                },
            )
            script.lifecycle("gallery-c1", "completed")
            flush()
            view =
                view.requested(
                    PresenterInput.TurnChangesFound(
                        FIRST_ASK,
                        listOf(ChangedFile("/work/src/AuthService.kt", 12, 3, created = false, deleted = false)),
                    ),
                )
        }

        /** Rows the next fixes look at: an Explored group to open, an empty row, long ones, three answers. */
        private fun moreRows() {
            script.assistant(
                "gm20",
                listOf(
                    StreamScript.toolUse("gt20", "Read", obj("file_path" to "/work/src/RetryPolicy.kt")),
                    StreamScript.toolUse("gt21", "Read", obj("file_path" to "/work/src/AuthServiceTest.kt")),
                    StreamScript.toolUse("gt22", "Grep", obj("pattern" to "RetryPolicy")),
                ),
            )
            script.toolResult("gt20", "class RetryPolicy(val times: Int)\n")
            script.toolResult("gt21", "class AuthServiceTest {\n    @Test fun logsIn() {}\n}\n")
            script.toolResult("gt22", "src/AuthService.kt:12\nsrc/RetryPolicy.kt:3")
            script.assistant("gm21", listOf(StreamScript.toolUse("gt23", "WebFetch", JsonObject())))
            script.toolResult("gt23", "")
            script.assistant(
                "gm22",
                listOf(StreamScript.toolUse("gt24", "Bash", obj("command" to "ls -1 /work/src/auth/generated"))),
            )
            script.toolResult("gt24", (1..16).joinToString("\n") { "Generated%02d.kt".format(it) })
            script.assistant(
                "gm23",
                listOf(StreamScript.toolUse("gt25", "Bash", obj("command" to "./gradlew :auth:lint --offline"))),
            )
            script.toolResult("gt25", LONG_ERROR, isError = true)
            val write =
                obj("file_path" to "/work/src/RetryPolicy.kt", "content" to "class RetryPolicy(val times: Int)\n")
            script.assistant("gm24", listOf(StreamScript.toolUse("gt26", "Write", write)))
            line(canUseTool("gallery-r6", "Write", "gt26", write))
            allow("gallery-r6")
            script.toolResult("gt26", "File created successfully at: /work/src/RetryPolicy.kt")
            script.assistant(
                "gm25",
                listOf(StreamScript.toolUse("gt27", "Bash", obj("command" to "rm -rf /work/build/tmp"))),
            )
            line(canUseTool("gallery-r7", "Bash", "gt27", obj("command" to "rm -rf /work/build/tmp")))
            deny("gallery-r7")
            script.toolResult("gt27", "The user doesn't want to proceed with this tool use.", isError = true)
        }

        fun secondTurn(waits: Waits) {
            val second = "Fix the tests too, and show me a plan when you're done"
            view = view.sent(PresenterInput.UserSent(SECOND_ASK, second, uuid = "gallery-c2"))
            script.lifecycle("gallery-c2", "queued")
            script.lifecycle("gallery-c2", "started")
            script.assistant("gm9", listOf(thinking("Check the test names, then ask how far to go.")))
            val command =
                "git status --short | awk '{print \$1}' | sort | uniq -c; " +
                    "git status --short | grep -v '^ D .agents/' | head -40; " +
                    "git log -3 --format='%h %ad %s' --date=iso"
            script.assistant(
                "gm10",
                listOf(
                    StreamScript.text("First I'll look at what is changed in the working tree."),
                    StreamScript.toolUse("gt7", "Bash", obj("command" to command)),
                ),
            )
            if (waits == Waits.NOTHING) return
            if (BASH_ID in waits.requestIds) {
                line(
                    canUseTool(
                        BASH_ID,
                        "Bash",
                        "gt7",
                        obj("command" to command),
                        JsonArray().apply {
                            add(
                                JsonObject().apply {
                                    addProperty("type", "addRules")
                                    add(
                                        "rules",
                                        JsonArray().apply {
                                            add(obj("toolName" to "Bash", "ruleContent" to "git status:*"))
                                        },
                                    )
                                    addProperty("behavior", "allow")
                                    addProperty("destination", "localSettings")
                                },
                            )
                        },
                    ),
                )
            } else {
                script.toolResult("gt7", "M src/AuthService.kt")
            }
            val questions =
                JsonObject().apply {
                    add(
                        "questions",
                        JsonArray().apply {
                            add(
                                question(
                                    "How long should it wait between retries?",
                                    "Delay",
                                    "Fixed 200ms" to "Waits the same every time. The simplest",
                                    "Exponential backoff (doubling from 200ms, capped at 2 seconds, with jitter) " +
                                        "so that clients do not all hit a busy server again at the same moment" to
                                        "Gentler on a busy server. The tests swap in a fake clock",
                                ),
                            )
                            add(
                                question(
                                    "Which tests should I add?",
                                    "Tests",
                                    "Up to 3 failures" to "Only checks that it gives up on the third try",
                                    "Success and failure" to "Also checks that it stops once a try succeeds",
                                ),
                            )
                        },
                    )
                }
            if (QUESTION_ID in waits.requestIds) {
                script.assistant("gm11", listOf(StreamScript.toolUse("gt8", "AskUserQuestion", questions)))
                line(canUseTool(QUESTION_ID, "AskUserQuestion", "gt8", questions))
            }
            val plan = obj("plan" to PLAN, "planFilePath" to "/home/user/.claude/plans/gallery.md")
            if (PLAN_ID in waits.requestIds) {
                script.assistant("gm12", listOf(StreamScript.toolUse("gt9", "ExitPlanMode", plan)))
                line(canUseTool(PLAN_ID, "ExitPlanMode", "gt9", plan))
            }
            val edit =
                obj(
                    "file_path" to "/work/src/AuthService.kt",
                    "old_string" to "    fun login(c: Credentials) = api.login(c)",
                    "new_string" to
                        "    suspend fun login(c: Credentials) = retry(times = 3) {\n        api.login(c)\n    }",
                ).apply { addProperty("replace_all", false) }
            if (EDIT_ID !in waits.requestIds) return
            script.assistant("gm13", listOf(StreamScript.toolUse("gt10", "Edit", edit)))
            line(
                canUseTool(
                    EDIT_ID,
                    "Edit",
                    "gt10",
                    edit,
                    JsonArray().apply {
                        add(
                            obj("type" to "setMode", "mode" to "acceptEdits", "destination" to "session"),
                        )
                    },
                ),
            )
        }
    }

    /** [view] after the CLI said the permission mode is [mode] (`system/status`, as capture 07 answers a switch). */
    fun withMode(
        view: SessionView,
        mode: String,
    ): SessionView =
        view.event(
            PresenterInput.Event(
                StreamJsonCodec.decode(
                    JsonObject()
                        .apply {
                            addProperty("type", "system")
                            addProperty("subtype", "status")
                            add("status", JsonNull.INSTANCE)
                            addProperty("permissionMode", mode)
                            addProperty("uuid", "gallery-mode")
                            addProperty("session_id", "gallery")
                        }.toString(),
                ),
            ),
        )

    /**
     * [view] after the host asked for the context used and the CLI answered `get_context_usage` (capture 06) with
     * [percent] of a 200000-token window used, in the capture's fields (`totalTokens`, `maxTokens`, `percentage`).
     */
    fun withContextUse(
        view: SessionView,
        percent: Int,
    ): SessionView {
        val max = 200_000L
        val body =
            JsonObject().apply {
                addProperty("totalTokens", max * percent / 100)
                addProperty("maxTokens", max)
                addProperty("percentage", percent)
            }
        val answer =
            JsonObject().apply {
                addProperty("type", "control_response")
                add(
                    "response",
                    JsonObject().apply {
                        addProperty("subtype", "success")
                        addProperty("request_id", "gallery-context")
                        add("response", body)
                    },
                )
            }
        return view
            .requested(PresenterInput.ControlRequested("gallery-context", ControlKind.CONTEXT))
            .event(PresenterInput.Event(StreamJsonCodec.decode(answer.toString())))
    }

    /**
     * [view] after the host asked for the MCP servers and the CLI answered with three (capture 24's `mcp_status`
     * answer): one connected with two tools, one that failed, one that needs a sign-in.
     */
    fun withMcp(view: SessionView): SessionView {
        val servers =
            JsonArray().apply {
                add(
                    obj("name" to "github", "status" to "connected", "scope" to "user", "source" to "user").apply {
                        add(
                            "tools",
                            JsonArray().apply {
                                add(obj("name" to "search_issues"))
                                add(obj("name" to "create_pull_request"))
                            },
                        )
                    },
                )
                add(
                    obj(
                        "name" to "postgres",
                        "status" to "failed",
                        "scope" to "project",
                        "source" to "project",
                        "error" to "Connection closed: spawn npx ENOENT",
                    ),
                )
                add(obj("name" to "linear", "status" to "needs-auth", "scope" to "user", "source" to "user"))
            }
        val answer =
            JsonObject().apply {
                addProperty("type", "control_response")
                add(
                    "response",
                    JsonObject().apply {
                        addProperty("subtype", "success")
                        addProperty("request_id", "gallery-mcp")
                        add("response", JsonObject().apply { add("mcpServers", servers) })
                    },
                )
            }
        return view
            .requested(PresenterInput.ControlRequested("gallery-mcp", ControlKind.MCP_STATUS))
            .event(PresenterInput.Event(StreamJsonCodec.decode(answer.toString())))
    }

    private fun thinking(text: String) =
        JsonObject().apply {
            addProperty("type", "thinking")
            addProperty("thinking", text)
            addProperty("signature", "gallery")
        }

    private fun todo(
        content: String,
        status: String,
    ) = obj("content" to content, "status" to status, "activeForm" to content)

    private fun question(
        text: String,
        header: String,
        vararg options: Pair<String, String>,
    ) = JsonObject().apply {
        addProperty("question", text)
        addProperty("header", header)
        add(
            "options",
            JsonArray().apply {
                options.forEach { (label, description) ->
                    add(
                        obj(
                            "label" to label,
                            "description" to description,
                        ),
                    )
                }
            },
        )
        addProperty("multiSelect", false)
    }

    private fun canUseTool(
        requestId: String,
        tool: String,
        toolUseId: String,
        input: JsonObject,
        suggestions: JsonArray? = null,
    ) = JsonObject().apply {
        addProperty("type", "control_request")
        addProperty("request_id", requestId)
        add(
            "request",
            JsonObject().apply {
                addProperty("subtype", "can_use_tool")
                addProperty("tool_name", tool)
                addProperty("display_name", tool)
                add("input", input)
                if (suggestions != null) add("permission_suggestions", suggestions)
                addProperty("tool_use_id", toolUseId)
            },
        )
    }

    private fun obj(vararg fields: Pair<String, String>) =
        JsonObject().apply { fields.forEach { (key, value) -> addProperty(key, value) } }

    private val ATTACHMENTS =
        listOf(
            AttachmentRecord("login-screen.png", AttachmentKind.IMAGE, "image/png", 48_000),
            AttachmentRecord("retry-spec.pdf", AttachmentKind.DOCUMENT, "application/pdf", 210_000),
            AttachmentRecord("AuthServiceTest.kt", AttachmentKind.TEXT, "text/plain", 3_200),
            AttachmentRecord("error-log-2026-11-01.txt", AttachmentKind.TEXT, "text/plain", 9_800),
            AttachmentRecord("sequence-diagram.png", AttachmentKind.IMAGE, "image/png", 76_000),
        )

    private const val LONG_ERROR =
        "e: file:///work/src/auth/AuthService.kt:42:17 Unresolved reference 'retry' while resolving the call " +
            "AuthService.login(Credentials) from LoginController.onSubmit(LoginForm) in module :auth, " +
            "the compiler also cannot infer the type of the lambda passed to it, so nothing after it was checked"

    private val REPLY =
        """
        |Done. When `login` fails, it waits 200ms and tries again, up to 3 times.
        |
        |```kotlin
        |suspend fun login(c: Credentials) = retry(times = 3, backoff = 200.milliseconds) {
        |    api.login(c)
        |}
        |```
        |
        |- Only an `IOException` counts (an authentication failure returns at once)
        |- I added 2 tests to `AuthServiceTest`
        |
        || Case | Calls | Result |
        ||---|---|---|
        || All 3 fail | 3 | Exception |
        || Second try succeeds | 2 | Success |
        """.trimMargin()

    private val PLAN =
        """
        |# Retry tests
        |
        |1. Add a case to `AuthServiceTest` where all 3 tries fail
        |2. Swap in a fake clock so the waits take no time
        |3. Check with `./gradlew :auth:test`
        """.trimMargin()
}
