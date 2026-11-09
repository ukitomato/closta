package dev.ukitomato.closta.providers.claude.protocol

import com.google.gson.JsonArray
import com.google.gson.JsonElement
import com.google.gson.JsonNull
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import dev.ukitomato.closta.core.models.Attachment
import dev.ukitomato.closta.core.models.AttachmentKind
import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction
import java.util.Base64

/**
 * The write direction: a host intent becomes one stream-json line for the CLI's stdin.
 *
 * The other half of the same wire vocabulary the [StreamJsonCodec] reads. Keeping both directions in
 * one place is deliberate — they are the front and back of the same protocol, and splitting them
 * across specs would let a CLI version bump be followed by one and not the other.
 *
 * Every function is pure: ids and opaque payloads are arguments, and there is no clock, no random and
 * no IO. The same arguments produce the same line, byte for byte. When to send a line — and where the
 * ids come from — is the session's concern, not this object's. Opaque payloads
 * (`updatedInput`, answers) are the caller's JSON, embedded as-is rather than modelled here, because
 * their contents are provider-specific and do not belong in a typed shape.
 *
 * The shapes come from measurements: stdin is not captured by the CLI, so those measurements are the source of
 * truth for this direction.
 */
@Suppress("TooManyFunctions") // one function per stdin wire message — the write half of the protocol vocabulary
object StdinEncoder {
    private const val PDF = "application/pdf"

    /**
     * A user turn: `{"type":"user","message":{"role":"user","content":<content>},...}`.
     * [content] is the message body text the caller wants to send.
     *
     * Without [attachments] the content is the text itself, as it always was. With them it is an array of blocks
     * (capture 23, `23-attachments.stdin.jsonl`): the attachments first, in order, then the text (none when there is
     * none). An image is
     * `{type:image, source:{type:base64, media_type, data}}`, a PDF `{type:document, source:{type:base64,
     * media_type:application/pdf, data}}`, and a text file a text block of its name, a blank line and its body.
     * The bytes and the name never appear in a failure's message.
     */
    fun userMessage(
        sessionId: String,
        uuid: String,
        content: String,
        attachments: List<Attachment> = emptyList(),
    ): String {
        val message =
            JsonObject().apply {
                addProperty("role", "user")
                if (attachments.isEmpty()) {
                    addProperty("content", content)
                } else {
                    add(
                        "content",
                        JsonArray().apply {
                            attachments.forEach { add(attachmentBlock(it)) }
                            // A message of files only has no sentence to send: a block of no text is left out, not sent
                            // (what the API does with one is not recorded, so none is risked).
                            if (content.isNotEmpty()) add(textBlock(content))
                        },
                    )
                }
            }
        val line =
            JsonObject().apply {
                addProperty("type", "user")
                add("message", message)
                addProperty("session_id", sessionId)
                add("parent_tool_use_id", JsonNull.INSTANCE)
                addProperty("uuid", uuid)
                // Everything the host sends as a user message was typed by the user; without the mark the CLI treats
                // it as unattributed (sdk.d.ts 0.3.317 `SDKMessageOrigin`).
                add("origin", JsonObject().apply { addProperty("kind", "human") })
            }
        return line.toString()
    }

    private fun textBlock(text: String): JsonObject =
        JsonObject().apply {
            addProperty("type", "text")
            addProperty("text", text)
        }

    private fun attachmentBlock(attachment: Attachment): JsonObject =
        when (attachment.kind) {
            AttachmentKind.IMAGE -> base64Block("image", attachment.mediaType, attachment.bytes)
            AttachmentKind.DOCUMENT -> base64Block("document", PDF, attachment.bytes)
            AttachmentKind.TEXT -> textBlock("${attachment.name}\n\n${utf8(attachment.bytes)}")
        }

    private fun base64Block(
        type: String,
        mediaType: String,
        bytes: ByteArray,
    ): JsonObject =
        JsonObject().apply {
            addProperty("type", type)
            add(
                "source",
                JsonObject().apply {
                    addProperty("type", "base64")
                    addProperty("media_type", mediaType)
                    addProperty("data", Base64.getEncoder().encodeToString(bytes))
                },
            )
        }

    /** The body of a text attachment: strictly UTF-8, and a failure says nothing of what the bytes were. */
    private fun utf8(bytes: ByteArray): String =
        try {
            Charsets.UTF_8
                .newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(bytes))
                .toString()
        } catch (
            @Suppress("SwallowedException") failure: CharacterCodingException,
        ) {
            throw IllegalArgumentException("a text attachment is not UTF-8")
        }

    /**
     * `initialize`. The two mcp-server fields must be *arrays* of strings: the CLI rejects `{}` with
     * "sdkMcpServers and webSearchIsolationExemptMcpServers must be arrays of strings".
     *
     * [sdkMcpServers] names the in-process MCP servers the host answers for; the default is the empty array,
     * so a call without it writes the same line as before the parameter existed.
     */
    fun initialize(
        requestId: String,
        sdkMcpServers: List<String> = emptyList(),
    ): String =
        controlRequest(requestId) {
            addProperty("subtype", "initialize")
            add("hooks", JsonObject())
            add("sdkMcpServers", JsonArray().apply { sdkMcpServers.forEach(::add) })
            add("webSearchIsolationExemptMcpServers", JsonArray())
            // The host shows a stop control per task, so an interrupt leaves background tasks running
            // (sdk.d.ts 0.3.317).
            addProperty("perTaskStopAffordance", true)
        }

    /** `interrupt` as a control_request. See also [cancelRequest] for the top-level form. */
    fun interrupt(requestId: String): String =
        controlRequest(requestId) {
            addProperty("subtype", "interrupt")
        }

    /**
     * `stop_task` as a control_request: stops the one task whose CLI id is [taskId]. The shape is the SDK's
     * `SDKControlStopTaskRequest` (`subtype` `stop_task` and `task_id`, sdk.d.ts 0.3.282); no capture holds it yet.
     */
    fun stopTask(
        requestId: String,
        taskId: String,
    ): String =
        controlRequest(requestId) {
            addProperty("subtype", "stop_task")
            addProperty("task_id", taskId)
        }

    /**
     * The other interrupt form the CLI accepts: a top-level `control_cancel_request`. Both are
     * provided; which one a session sends is the session's decision.
     */
    fun cancelRequest(requestId: String): String =
        JsonObject()
            .apply {
                addProperty("type", "control_cancel_request")
                addProperty("request_id", requestId)
            }.toString()

    /** `set_model`: a live model change without a restart. */
    fun setModel(
        requestId: String,
        model: String,
    ): String =
        controlRequest(requestId) {
            addProperty("subtype", "set_model")
            addProperty("model", model)
        }

    /** `set_permission_mode`: a live permission-mode change. */
    fun setPermissionMode(
        requestId: String,
        mode: String,
    ): String =
        controlRequest(requestId) {
            addProperty("subtype", "set_permission_mode")
            addProperty("mode", mode)
        }

    /**
     * `get_context_usage`: how much of the context window is used. [detail] is `summary` or `full` (capture 06 line 2
     * holds the answer to the summary form: `totalTokens`, `maxTokens`, `percentage`, `autoCompactThreshold`).
     */
    fun getContextUsage(
        requestId: String,
        detail: String = "summary",
    ): String =
        controlRequest(requestId) {
            addProperty("subtype", "get_context_usage")
            addProperty("detail", detail)
        }

    /**
     * `get_settings`: the settings in effect. Its answer's `response.applied` says what the session sends with
     * its next request: `model` (the model really used, known before the first message) and `effort` (null for a model
     * that takes none). Capture 28, lines 2, 4, 6 and 8; `SDKControlGetSettingsRequest` in sdk.d.ts 0.3.282.
     */
    fun getSettings(requestId: String): String =
        controlRequest(requestId) {
            addProperty("subtype", "get_settings")
        }

    /**
     * `apply_flag_settings` with only `effortLevel`: the effort changes in place, from the next request on,
     * without a restart; the answer is a success without a body. A null [effortLevel] is written as JSON null, which
     * puts the model's own default back (capture 28, lines 3, 5 and 7; `SDKControlApplyFlagSettingsRequest`).
     */
    fun applyEffort(
        requestId: String,
        effortLevel: String?,
    ): String =
        controlRequest(requestId) {
            addProperty("subtype", "apply_flag_settings")
            val settings = JsonObject()
            if (effortLevel ==
                null
            ) {
                settings.add("effortLevel", JsonNull.INSTANCE)
            } else {
                settings.addProperty("effortLevel", effortLevel)
            }
            add("settings", settings)
        }

    /**
     * `mcp_status`: which MCP servers the session has (capture 24 holds the answer: `mcpServers`, each with
     * `name`, `status`, `config`, `scope`, `source`, and for a connected one `serverInfo` and `tools`).
     */
    fun mcpStatus(requestId: String): String =
        controlRequest(requestId) {
            addProperty("subtype", "mcp_status")
        }

    /** `mcp_toggle`: turns the server [serverName] on or off (capture 24, `24-mcp-management.stdin.jsonl`). */
    fun mcpToggle(
        requestId: String,
        serverName: String,
        enabled: Boolean,
    ): String =
        controlRequest(requestId) {
            addProperty("subtype", "mcp_toggle")
            addProperty("serverName", serverName)
            addProperty("enabled", enabled)
        }

    /** `mcp_reconnect`: reconnects the server [serverName] (capture 24). */
    fun mcpReconnect(
        requestId: String,
        serverName: String,
    ): String =
        controlRequest(requestId) {
            addProperty("subtype", "mcp_reconnect")
            addProperty("serverName", serverName)
        }

    /**
     * `rewind_files`: puts the files back as they were before the user line whose uuid is [userMessageId], or with
     * [dryRun] says what would change (capture 25, `25-rewind-files.stdin.jsonl`, lines 6 and 7).
     */
    fun rewindFiles(
        requestId: String,
        userMessageId: String,
        dryRun: Boolean,
    ): String =
        controlRequest(requestId) {
            addProperty("subtype", "rewind_files")
            addProperty("user_message_id", userMessageId)
            addProperty("dry_run", dryRun)
        }

    /**
     * Answering `can_use_tool` with allow. [updatedInput] is the caller's opaque JSON object (the
     * possibly-rewritten tool input), embedded verbatim.
     *
     * [updatedPermissions] is the caller's JSON array — typically the request's
     * `permission_suggestions` passed back unchanged to accept them (measured in capture 16: the
     * suggestion then takes effect). When `null` the key is left out, so the line is byte-identical to
     * what this function wrote before the parameter existed.
     */
    fun allow(
        requestId: String,
        updatedInput: String,
        updatedPermissions: String? = null,
    ): String =
        controlResponse(requestId) {
            addProperty("behavior", "allow")
            add("updatedInput", JsonParser.parseString(updatedInput))
            if (updatedPermissions != null) {
                add("updatedPermissions", JsonParser.parseString(updatedPermissions))
            }
        }

    /**
     * Answering a `mcp_message` request: the JSON-RPC answer ([jsonRpc], the caller's JSON, embedded as-is) goes in
     * `response.mcp_response` of a success `control_response` keyed to the request's `request_id` (the shape
     * `@anthropic-ai/claude-agent-sdk`'s `sdk.mjs` writes).
     */
    fun mcpResponse(
        requestId: String,
        jsonRpc: String,
    ): String =
        controlResponse(requestId) {
            add("mcp_response", JsonParser.parseString(jsonRpc))
        }

    /**
     * Answering `can_use_tool` with deny and a message shown to the model. A blank [message] is replaced by the CLI's
     * own rejection: the CLI makes the message an error tool_result, and the API refuses an empty one with a 400 for
     * the rest of the conversation.
     */
    fun deny(
        requestId: String,
        message: String,
    ): String =
        controlResponse(requestId) {
            addProperty("behavior", "deny")
            addProperty("message", message.ifBlank { REJECTED })
        }

    /** What the CLI tells the model when the user rejects a tool in its terminal (the capture's subagent Bash). */
    private const val REJECTED =
        "The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, " +
            "the new_string was NOT written to the file). STOP what you are doing and wait for the user to tell you " +
            "how to proceed."

    /** Answering `can_use_tool` with cancelled (the request was withdrawn before an answer). */
    fun cancelled(requestId: String): String =
        controlResponse(requestId) {
            addProperty("behavior", "cancelled")
        }

    /** `{"type":"control_request","request_id":<id>,"request":{...}}`. */
    private fun controlRequest(
        requestId: String,
        buildRequest: JsonObject.() -> Unit,
    ): String =
        JsonObject()
            .apply {
                addProperty("type", "control_request")
                addProperty("request_id", requestId)
                add("request", JsonObject().apply(buildRequest))
            }.toString()

    /**
     * `{"type":"control_response","response":{"subtype":"success","request_id":<id>,"response":<payload>}}`.
     * The reply is keyed to the top-level `request_id`, not to any `tool_use_id` inside the request.
     */
    private fun controlResponse(
        requestId: String,
        buildPayload: JsonObject.() -> Unit,
    ): String {
        val payload: JsonElement = JsonObject().apply(buildPayload)
        val response =
            JsonObject().apply {
                addProperty("subtype", "success")
                addProperty("request_id", requestId)
                add("response", payload)
            }
        return JsonObject()
            .apply {
                addProperty("type", "control_response")
                add("response", response)
            }.toString()
    }
}
