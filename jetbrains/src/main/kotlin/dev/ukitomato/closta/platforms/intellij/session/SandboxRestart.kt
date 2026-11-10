package dev.ukitomato.closta.platforms.intellij.session

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.presenter.view.SwitchKind
import dev.ukitomato.closta.presenter.view.SwitchOutcome
import dev.ukitomato.closta.presenter.view.composerState
import dev.ukitomato.closta.providers.claude.launch.ClaudeLaunchSpec

/**
 * What a restart into the sandbox carries over from the conversation, as the launch flags take them. Null leaves the
 * flag as the session was launched with it.
 */
data class CarriedChoices(
    val mode: String?,
    val model: String?,
    val effort: String?,
)

private const val BYPASS_MODE = "bypassPermissions"
private const val DEFAULT_MODEL = "default"

/** The conversation's permission mode (never `bypassPermissions`), its model (none for "default") and its effort. */
fun carriedChoices(view: SessionView): CarriedChoices {
    val composer = composerState(view.conversation, view.transcript)
    // A model switch the CLI applied is what the next request goes with, whether or not the list names it.
    val switched =
        view.transcript.operations.switches
            .lastOrNull { it.kind == SwitchKind.MODEL && it.outcome == SwitchOutcome.APPLIED }
            ?.value
    return CarriedChoices(
        mode = composer.mode?.takeIf { it != BYPASS_MODE },
        model = (switched ?: composer.model.value).takeIf { it != DEFAULT_MODEL },
        effort = composer.effort,
    )
}

/**
 * The spec a restart launches. After a message was [sent], or for a [SessionOpening.Resume], it resumes the session
 * by its own id (`--resume=<sessionId>`, without the fork and the cut). A New or a Fork with nothing sent yet starts as
 * it was launched (a New keeps its `--session-id`: capture 40). The [carried] mode, model and effort win over the
 * launch's, and [sandbox] is the given value.
 */
fun restartSpec(
    launched: ClaudeLaunchSpec,
    opening: SessionOpening,
    sent: Boolean,
    carried: CarriedChoices,
    sandbox: Boolean,
): ClaudeLaunchSpec {
    val opened =
        if (sent || opening is SessionOpening.Resume) {
            launched.copy(resume = launched.sessionId, forkSession = false, resumeSessionAt = null)
        } else {
            launched
        }
    return opened.copy(
        permissionMode = carried.mode ?: launched.permissionMode,
        model = carried.model ?: launched.model,
        effort = carried.effort ?: launched.effort,
        sandbox = sandbox,
    )
}

/** How one CLI process of a session ended. */
internal sealed interface ProcessEnd {
    /** It closed its output on its own. */
    data object Ended : ProcessEnd

    /** Asked into the sandbox, it ended before saying anything but a `result`; [detail] is that result's sentence. */
    data class NotStarted(
        val detail: String?,
    ) : ProcessEnd

    /** The host stopped it to start it again in the sandbox, for the switch [switchId]. */
    data class Restart(
        val switchId: String,
    ) : ProcessEnd
}

/**
 * Holds back a sandboxed CLI's `result` lines until it says anything else: a CLI that cannot sandbox writes one
 * error `result` and exits before `initialize` (capture 36), and that result is not the conversation's. A CLI not asked
 * into the sandbox is started from its first line.
 */
internal class SandboxStartWatch(
    sandboxed: Boolean,
) {
    /** Whether the CLI said something other than a `result`. */
    var started: Boolean = !sandboxed
        private set
    private val held = mutableListOf<AgentEvent.Result>()

    /** The events to fold now for [event]: none while it is held, the held ones and [event] once the CLI started. */
    fun pass(event: AgentEvent): List<AgentEvent> =
        when {
            started -> listOf(event)
            event is AgentEvent.Result -> {
                held += event
                emptyList()
            }
            else -> {
                started = true
                (held + event).also { held.clear() }
            }
        }

    /** The sentence of the last error result held back, if any. */
    val detail: String? get() = held.lastOrNull { it.isError }?.result
}
