package dev.ukitomato.closta.presenter

import dev.ukitomato.closta.presenter.tree.JsonArray
import dev.ukitomato.closta.presenter.tree.JsonBool
import dev.ukitomato.closta.presenter.tree.JsonNumber
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonString
import dev.ukitomato.closta.presenter.tree.JsonValue

/** Hand-built trees for the contract's edges. */
object Trees {
    private fun s(value: String) = JsonString(value)

    private fun obj(vararg members: Pair<String, JsonValue>) = JsonObject.of(*members)

    private fun collection(vararg entries: Pair<String, JsonObject>) =
        obj("order" to JsonArray(entries.map { s(it.first) }), "byId" to obj(*entries))

    /** An object [depth] levels deep: `{"a":{"a":…{}}}`. */
    fun nested(depth: Int): JsonObject {
        var value = JsonObject.EMPTY
        repeat(depth - 1) { value = obj("a" to value) }
        return value
    }

    /** An array [depth] levels deep: `[[…[]]]`. */
    fun nestedArray(depth: Int): JsonArray {
        var value = JsonArray.EMPTY
        repeat(depth - 1) { value = JsonArray(listOf(value)) }
        return value
    }

    private fun toolCall(
        args: JsonObject,
        vararg more: Pair<String, JsonValue>,
    ) = obj(
        "type" to s("tool-call"),
        "toolCallId" to s("toolu_1"),
        "toolName" to s("Bash"),
        "argsText" to s(""),
        "args" to args,
        *more,
    )

    private fun tree(part: JsonObject) =
        obj(
            "threads" to
                collection(
                    "t1" to
                        obj(
                            "id" to s("t1"),
                            "isRunning" to JsonBool.FALSE,
                            "messages" to
                                collection(
                                    "m1" to
                                        obj(
                                            "id" to s("m1"),
                                            "role" to s("assistant"),
                                            "parts" to collection("toolu_1" to part),
                                        ),
                                ),
                        ),
                ),
        )

    /** A one-part tree whose part is a tool call with [args]: the part sits at level 10, so args at 11. */
    fun withArgs(args: JsonObject): JsonObject = tree(toolCall(args))

    /** A tree that uses every key the protocol's table names, at every kind of node. */
    fun everyKey(): JsonObject = EveryKey(extra = null).tree()

    /** For each kind of node, a tree like [everyKey] with one key the protocol does not name added there. */
    fun oneExtraKeyEach(): List<Pair<String, JsonObject>> =
        listOf(
            "root",
            "collection",
            "thread",
            "message",
            "status",
            "text",
            "tool-call",
            "attachment",
            "unknown part",
            "approval",
            "option",
            "session",
            "usage",
            "rewind",
            "slash command",
            "file search",
            "selection",
            "applied",
            "model option",
            "switch",
            "context",
            "compaction",
            "saved session",
            "mcp server",
            "notice",
            "task",
            "suggestion",
            "question",
            "question option",
            "rewind",
        ).map { it to EveryKey(extra = it).tree() }

    private class EveryKey(
        private val extra: String?,
    ) {
        private fun JsonObject.kind(kind: String): JsonObject =
            if (kind !=
                extra
            ) {
                this
            } else {
                JsonObject.of(*(entries.map { it.key to it.value } + ("unnamedKey" to s("x"))).toTypedArray())
            }

        fun tree(): JsonObject {
            val thread =
                obj(
                    "id" to s("t1"),
                    "isRunning" to JsonBool.TRUE,
                    "messages" to collection("m1" to message()),
                    "session" to
                        obj(
                            "model" to s("claude-sonnet-5-5"),
                            "permissionMode" to s("default"),
                            "cwd" to s("/work"),
                            "version" to s("2.1.0"),
                        ).kind("session"),
                    "usage" to
                        obj(
                            "costUsd" to JsonNumber("0.25"),
                            "inputTokens" to JsonNumber.of(10),
                            "outputTokens" to JsonNumber.of(20),
                            "cacheReadInputTokens" to JsonNumber.of(30),
                            "cacheCreationInputTokens" to JsonNumber.of(40),
                        ).kind("usage"),
                    *composer(),
                    *operations(),
                    *history(),
                    *mcp(),
                    "notices" to
                        collection(
                            "notice-1" to
                                obj(
                                    "id" to s("notice-1"),
                                    "kind" to s("control-error"),
                                    "text" to s("no"),
                                    "requestId" to s("r1"),
                                ).kind("notice"),
                        ),
                    "tasks" to
                        collection(
                            "k1" to
                                obj(
                                    "id" to s("k1"),
                                    "toolCallId" to s("toolu_1"),
                                    "agentType" to s("Explore"),
                                    "background" to JsonBool.TRUE,
                                    "status" to s("incomplete"),
                                    "reason" to s("stopped"),
                                ).kind("task"),
                        ),
                ).kind("thread")
            return obj("threads" to collection("t1" to thread)).kind("root")
        }

        // What a thread says for the composer: a place for the selection and the lines written by an apply,
        // as the other two kinds are not named.
        private fun composer(): Array<Pair<String, JsonValue>> =
            arrayOf(
                "commands" to
                    JsonArray(
                        listOf(
                            obj(
                                "name" to s("config"),
                                "description" to s("Set a setting by key"),
                                "argumentHint" to s("key=value"),
                            ).kind("slash command"),
                        ),
                    ),
                "fileSearch" to
                    obj(
                        "commandId" to s("c7"),
                        "match" to s("App"),
                        "paths" to JsonArray(listOf(s("src/App.kt"))),
                        "truncated" to JsonBool.TRUE,
                        "failure" to s("failed"),
                    ).kind("file search"),
                "selection" to
                    obj(
                        "commandId" to s("c8"),
                        "path" to s("src/App.kt"),
                        "startLine" to JsonNumber.of(3),
                        "endLine" to JsonNumber.of(5),
                    ).kind("selection"),
                "applied" to
                    obj(
                        "commandId" to s("c9"),
                        "path" to s("src/App.kt"),
                        "startLine" to JsonNumber.of(3),
                        "endLine" to JsonNumber.of(5),
                        "undoable" to JsonBool.TRUE,
                    ).kind("applied"),
            )

        // A message the host did not send because of its files: a refusal that is over at once, with no detail.
        private fun attachmentSwitch(): JsonObject =
            obj(
                "seq" to JsonNumber.of(4),
                "kind" to s("attachment"),
                "value" to s("too-large"),
                "outcome" to s("rejected"),
            )

        // What a thread says for the operations console: one of each kind of node, with every key it may have.
        // The answer to the last rewind-files.
        private fun rewindEntry(): Pair<String, JsonValue> =
            "rewind" to
                obj(
                    "commandId" to s("c1"),
                    "messageId" to s("m1"),
                    "dryRun" to JsonBool.TRUE,
                    "outcome" to s("done"),
                    "files" to JsonArray(listOf(s("/work/note.txt"))),
                    "filesTotal" to JsonNumber.of(1),
                    "insertions" to JsonNumber.of(1),
                    "deletions" to JsonNumber.of(1),
                    "detail" to s("shown"),
                ).kind("rewind")

        private fun operations(): Array<Pair<String, JsonValue>> =
            arrayOf(
                "models" to
                    JsonArray(
                        listOf(
                            obj(
                                "value" to s("default"),
                                "resolvedModel" to s("claude-opus-4-8[1m]"),
                                "displayName" to s("Default"),
                                "description" to s("Opus 4.8"),
                                "supportsEffort" to JsonBool.TRUE,
                                "supportedEffortLevels" to JsonArray(listOf(s("low"), s("high"))),
                            ).kind("model option"),
                        ),
                    ),
                "switches" to
                    JsonArray(
                        listOf(
                            obj(
                                "seq" to JsonNumber.of(1),
                                "kind" to s("mode"),
                                "value" to s("bypassPermissions"),
                                "outcome" to s("rejected"),
                                "detail" to s("refused"),
                            ).kind("switch"),
                            obj(
                                "seq" to JsonNumber.of(3),
                                "kind" to s("resume"),
                                "value" to s("336ed47b-2675-4317-b3f5-a3b48abb03a2"),
                                "outcome" to s("rejected"),
                                "detail" to s("A turn is running"),
                            ),
                            attachmentSwitch(),
                        ),
                    ),
                rewindEntry(),
                "context" to
                    obj(
                        "totalTokens" to JsonNumber.of(16575),
                        "maxTokens" to JsonNumber.of(200000),
                        "percentage" to JsonNumber("8"),
                        "autoCompactThreshold" to JsonNumber.of(167000),
                    ).kind("context"),
                "compactions" to
                    JsonArray(
                        listOf(
                            obj(
                                "seq" to JsonNumber.of(2),
                                "trigger" to s("manual"),
                                "preTokens" to JsonNumber.of(20072),
                                "postTokens" to JsonNumber.of(1235),
                            ).kind("compaction"),
                        ),
                    ),
                "compacting" to JsonBool.TRUE,
                "effort" to s("high"),
                "startPermissionMode" to s("acceptEdits"),
                "appliedModel" to s("claude-sonnet-4-6"),
            )

        // What a thread says of the history of sessions: a saved session with every key it may have.
        private fun history(): Array<Pair<String, JsonValue>> =
            arrayOf(
                "savedSessions" to
                    JsonArray(
                        listOf(
                            obj(
                                "id" to s("336ed47b-2675-4317-b3f5-a3b48abb03a2"),
                                "title" to s("Run this exact bash command"),
                                "updatedAt" to JsonNumber("1759400000000"),
                                "current" to JsonBool.TRUE,
                            ).kind("saved session"),
                        ),
                    ),
                "savedSessionsUnreadable" to JsonBool.TRUE,
                "restoredUntil" to s("m1"),
                "restoredCount" to JsonNumber.of(1),
                "restoredPartly" to JsonBool.TRUE,
            )

        // What a thread says of its MCP servers: a server with every key it may have, and the unreadable flag.
        private fun mcp(): Array<Pair<String, JsonValue>> =
            arrayOf(
                "mcpServers" to
                    JsonArray(
                        listOf(
                            obj(
                                "name" to s("fake-echo"),
                                "status" to s("failed"),
                                "source" to s("dynamic"),
                                "builtIn" to JsonBool.FALSE,
                                "tools" to JsonArray(listOf(s("echo"))),
                                "error" to s("connection refused"),
                            ).kind("mcp server"),
                        ),
                    ),
                "mcpServersUnreadable" to JsonBool.TRUE,
            )

        private fun message(): JsonObject {
            val text =
                obj(
                    "type" to s("text"),
                    "text" to s("hi"),
                    "status" to obj("type" to s("complete")),
                ).kind("text")
            val reasoning = obj("type" to s("reasoning"), "text" to s(""), "status" to obj("type" to s("running")))
            val unknown = obj("type" to s("redacted_thinking")).kind("unknown part")
            val attachment =
                obj(
                    "type" to s("attachment"),
                    "name" to s("a.png"),
                    "kind" to s("image"),
                    "mediaType" to s("image/png"),
                    "size" to JsonNumber.of(4),
                ).kind("attachment")
            val parts =
                collection(
                    "m1:0" to text,
                    "m1:1" to reasoning,
                    "toolu_1" to call(),
                    "m1:3" to unknown,
                    "m1:a4" to attachment,
                ).kind("collection")
            return obj(
                "id" to s("m1"),
                "role" to s("assistant"),
                "status" to obj("type" to s("complete"), "reason" to s("stop")),
                "createdAt" to JsonNumber("1759400000000"),
                "parts" to parts,
            ).kind("message")
        }

        private fun call(): JsonObject {
            val status =
                obj(
                    "type" to s("incomplete"),
                    "reason" to s("error"),
                    "error" to obj("any" to JsonArray(listOf(s("leaf")))),
                ).kind("status")
            val nested =
                obj(
                    "id" to s("n1"),
                    "role" to s("user"),
                    "parts" to collection("n1:0" to obj("type" to s("text"), "text" to s("go"))),
                )
            return toolCall(
                obj("command" to JsonArray(listOf(s("ls")))),
                "result" to JsonArray(listOf(obj("type" to s("text")))),
                "isError" to JsonBool.FALSE,
                "status" to status,
                "approval" to approval(),
                "messages" to collection("n1" to nested),
            ).kind("tool-call")
        }

        private fun approval(): JsonObject {
            val option =
                obj(
                    "id" to s("A"),
                    "kind" to s("answer"),
                    "label" to s("A"),
                    "description" to s("pick A"),
                ).kind("option")
            return obj(
                "id" to s("req-1"),
                "display" to s("select"),
                "prompt" to s("Which?"),
                "options" to JsonArray(listOf(option)),
                "allowFreeform" to JsonBool.FALSE,
                "dismissible" to JsonBool.TRUE,
                "approved" to JsonBool.TRUE,
                "isAutomatic" to JsonBool.FALSE,
                "optionId" to s("A"),
                "text" to s("A"),
                "reason" to s("chosen"),
                "resolution" to s("cancelled"),
                "input" to obj("command" to JsonArray(listOf(s("ls")))),
                "suggestions" to
                    JsonArray(
                        listOf(
                            obj(
                                "id" to s("s1"),
                                "kind" to s("setMode"),
                                "detail" to s("acceptEdits"),
                                "destination" to s("session"),
                            ).kind("suggestion"),
                        ),
                    ),
                "acceptedSuggestions" to JsonArray(listOf(s("s1"))),
                "updatedInput" to obj("command" to s("ls -la")),
                "failure" to s("The answer could not be sent."),
                "failures" to JsonNumber.of(2),
                "questions" to
                    JsonArray(
                        listOf(
                            obj(
                                "id" to s("q1"),
                                "prompt" to s("Which?"),
                                "multiSelect" to JsonBool.FALSE,
                                "options" to
                                    JsonArray(
                                        listOf(
                                            obj(
                                                "id" to s("A"),
                                                "label" to s("A"),
                                                "description" to s("pick A"),
                                            ).kind("question option"),
                                        ),
                                    ),
                            ).kind("question"),
                        ),
                    ),
            ).kind("approval")
        }
    }
}
