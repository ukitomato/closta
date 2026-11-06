package dev.ukitomato.closta.core.interfaces

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.core.models.ApprovalDecision
import dev.ukitomato.closta.core.models.Attachment
import kotlinx.coroutines.flow.Flow

/**
 * The seam to a running agent. Core drives one conversation through this contract without knowing
 * that behind it a `claude` CLI is spoken to over bidirectional stream-json; the concrete shape
 * (argv, stdin framing, the `Channel(UNLIMITED)` stdout pump) belongs to the provider.
 *
 * This is the *minimal skeleton* of what core asks of a session: subscribe to the event stream, and
 * send what the use cases issue — a user message, an approval response, a live model change, an
 * interrupt, and so on. It grows by **forward evolution** (new methods, default arguments) so that
 * existing callers are not broken. A breaking change is a deliberate redesign of the contract.
 *
 * Second implementation (not a test fake): `ClaudeSession` in `providers/claude`. Test fake: a
 * recording stand-in in the test source.
 *
 * The vocabulary stays core's: [events] carries [AgentEvent] and [respondToApproval] takes
 * [ApprovalDecision]. No provider-shaped type crosses this seam.
 */
@Suppress("TooManyFunctions") // one function per thing core asks of a session, each a use case
interface AgentSession {
    /**
     * The agent's stdout, one [AgentEvent] per line, for the read side to fold into `ConversationState`
     * (the pump lives at the composition root, not in the use cases). None of
     * the use cases consumes this; it is part of the contract because reading events is something
     * core requires of a session.
     */
    val events: Flow<AgentEvent>

    /**
     * Sends a user message to the agent. [attachments] go with it, before the text; the default, none, writes
     * the message as it was written before the parameter existed. [uuid] is the id the caller gave the
     * message, so that it can later be named to the agent (a rewind of the files); the default, null, lets the
     * session mint one as it did before the parameter existed.
     */
    suspend fun sendUserMessage(
        text: String,
        attachments: List<Attachment> = emptyList(),
        uuid: String? = null,
    )

    /**
     * Returns the host's decision about a pending approval to the agent. [decision] carries the outcome
     * kind ([ApprovalDecision]); [payload] is the host's raw, provider-shaped response body
     * (answers / updatedInput) passed through opaquely — core never builds or reads it — and is null for
     * a plain allow/deny/afk. Its precise framing is the provider's.
     *
     * [updatedPermissions] is the permission suggestions the user accepted along with an allow: a JSON array
     * string in the provider's own shape, passed through opaquely like [payload]. Null leaves the
     * answer as it was before the parameter existed.
     */
    suspend fun respondToApproval(
        decision: ApprovalDecision,
        payload: String? = null,
        updatedPermissions: String? = null,
    )

    /**
     * Changes the model live, without restarting the session. [requestId] is minted by the caller and written
     * as the request's own id, so that the answer (a `ControlResponse` event with the same id) can be matched to what
     * was asked: the caller records the request before it calls this, and an answer can then never be folded first.
     * It is an opaque mark of correlation: core does not know its shape.
     */
    suspend fun setModel(
        model: String,
        requestId: String,
    )

    /** Changes the permission mode live. [requestId] is the caller's mark of correlation, as for [setModel]. */
    suspend fun setPermissionMode(
        mode: String,
        requestId: String,
    )

    /**
     * Asks how much of the context window is used. It only issues the request, without waiting for the answer:
     * the answer comes back as a `ControlResponse` event carrying [requestId], as for [setModel].
     */
    suspend fun requestContextUsage(requestId: String)

    /**
     * Asks for the settings in effect: the answer, a `ControlResponse` carrying [requestId], says the effort
     * and the model the session's next request goes with. Only issues the request, as [requestContextUsage].
     */
    suspend fun requestSettings(requestId: String)

    /**
     * Changes the effort live, without restarting the session; null puts the model's own default back. Only
     * issues the request; the answer carries [requestId], as for [setModel].
     */
    suspend fun setEffort(
        effort: String?,
        requestId: String,
    )

    /**
     * Asks which MCP servers the session has and in what state. It only issues the request, without waiting
     * for the answer: the answer comes back as a `ControlResponse` event carrying [requestId], as for
     * [requestContextUsage].
     */
    suspend fun requestMcpStatus(requestId: String)

    /**
     * Turns the MCP server named [name] on or off. [enabled] is the wanted value, not a flip, so the same
     * request twice leaves the same state. Only issues the request; the answer is a `ControlResponse` carrying
     * [requestId]. The CLI keeps the choice for the project, as a terminal's `/mcp` does.
     */
    suspend fun setMcpServerEnabled(
        name: String,
        enabled: Boolean,
        requestId: String,
    )

    /** Reconnects the MCP server named [name]. Only issues the request; the answer carries [requestId]. */
    suspend fun reconnectMcpServer(
        name: String,
        requestId: String,
    )

    /**
     * Puts the files back as they were before the user message [userMessageId] (the `uuid` it was sent with), or, with
     * [dryRun], only asks what would change. It only issues the request: the answer comes back as a
     * `ControlResponse` carrying [requestId], as for [requestContextUsage]. The conversation is not changed.
     */
    suspend fun rewindFiles(
        userMessageId: String,
        dryRun: Boolean,
        requestId: String,
    )

    /** Interrupts whatever the agent is currently doing. */
    suspend fun interrupt()

    /**
     * Stops one running task (a background agent or command) by the CLI's own [taskId], leaving the rest of the
     * session as it is. Like [interrupt] it only issues the request: the task's end comes back as an event.
     */
    suspend fun stopTask(taskId: String)
}
