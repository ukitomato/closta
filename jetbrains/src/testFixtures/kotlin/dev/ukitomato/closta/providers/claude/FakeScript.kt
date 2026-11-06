package dev.ukitomato.closta.providers.claude

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.core.models.ApprovalDecision
import dev.ukitomato.closta.core.models.Attachment

/**
 * A recorded scenario for [FakeAgentSession]: the events to stream and how the stream ends. No CLI, no
 * process, no clock.
 *
 * An AFK timeout is modelled as a host *decision*, not a duration: a [Beat.AwaitResponse] blocks the
 * stream on an outstanding request until the host answers it via [FakeAgentSession.respondToApproval],
 * and the answer arrives as a value — so a test crosses the "waiting" window without spending real or
 * virtual time.
 */
data class FakeScript(
    val beats: List<Beat>,
    val termination: Termination = Termination.Complete,
)

/** One step the fake plays on its event stream. */
sealed interface Beat {
    /**
     * Put one [AgentEvent] on the stream. The event is built by the caller (a test) from
     * `CaptureFixtures`/`StreamJsonCodec`; the fake never decodes JSON itself.
     */
    data class Emit(
        val event: AgentEvent,
    ) : Beat

    /**
     * Block the stream on an outstanding host-input request until the host answers it (or interrupts).
     * Models the CLI blocking forever on an unanswered `request_id` — reproduced here without
     * any wait, because the resume is a completed value rather than an elapsed timer.
     */
    data class AwaitResponse(
        val requestId: String,
    ) : Beat
}

/**
 * How the fake's event stream ends — the three capture-absent shapes plus normal completion.
 * A new [AgentEvent] variant is deliberately *not* invented for the error cases:
 * the fake only expresses the terminal shape a consumer of the contract can observe.
 */
sealed interface Termination {
    /** The stream completes normally after the last beat. */
    data object Complete : Termination

    /** The stream fails mid- or post-flight — a dropped connection or a dead process. */
    data class Error(
        val cause: Throwable,
    ) : Termination

    /** The stream fails the moment it is collected — a launch that never produced a process. */
    data class LaunchFailure(
        val cause: Throwable,
    ) : Termination
}

/**
 * A send the host made through the session, recorded in order. This is *fake-specific* inspection; the
 * shared [AgentSessionContract] asserts through [AgentEvent]s and `resolveApproval`, never through this.
 */
sealed interface Sent {
    data class UserMessage(
        val text: String,
        val attachments: List<Attachment> = emptyList(),
        val uuid: String? = null,
    ) : Sent

    data class Approval(
        val decision: ApprovalDecision,
        val payload: String?,
        val updatedPermissions: String? = null,
    ) : Sent

    data class SetModel(
        val model: String,
        val requestId: String,
    ) : Sent

    data class SetPermissionMode(
        val mode: String,
        val requestId: String,
    ) : Sent

    data class RequestContextUsage(
        val requestId: String,
    ) : Sent

    data class RequestMcpStatus(
        val requestId: String,
    ) : Sent

    data class SetMcpServerEnabled(
        val name: String,
        val enabled: Boolean,
        val requestId: String,
    ) : Sent

    data class ReconnectMcpServer(
        val name: String,
        val requestId: String,
    ) : Sent

    data class RewindFiles(
        val userMessageId: String,
        val dryRun: Boolean,
        val requestId: String,
    ) : Sent

    data object Interrupt : Sent
}

/**
 * Builds beats that stream [events] verbatim to completion — the ordinary send→turn shape. Pure, so it
 * lives in test fixtures for other tests to reuse; the caller reads the capture (via
 * `CaptureFixtures`) and passes the decoded events, keeping the one decoder in the codec.
 */
fun beatsEmitting(events: List<AgentEvent>): List<Beat> = events.map { Beat.Emit(it) }

/**
 * Builds beats that stream [events] but block on the host after each control request, reproducing the CLI
 * blocking on an unanswered `request_id`. The recorded continuation plays once the host answers.
 * This shape is shared so other tests do not re-derive it.
 */
fun beatsAwaitingAfterControlRequests(events: List<AgentEvent>): List<Beat> =
    buildList {
        for (event in events) {
            add(Beat.Emit(event))
            if (event is AgentEvent.ControlRequest) add(Beat.AwaitResponse(event.requestId))
        }
    }
