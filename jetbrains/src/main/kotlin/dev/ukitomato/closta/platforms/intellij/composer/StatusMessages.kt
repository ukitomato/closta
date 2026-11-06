package dev.ukitomato.closta.platforms.intellij.composer

import dev.ukitomato.closta.platforms.intellij.ClostaBundle

// What the line under the composer says, decided without the IDE: who said it, and for how long. Free of
// `com.intellij`.

/** Who put a message on the status line. */
enum class StatusSource { HINT, REFUSAL, SWITCH, SESSION }

/**
 * One message for the status line, posted at [at] (ms). It goes after [ttlMs] (never, when null) or, when
 * [untilKeystroke], at the next key typed into the composer. [error] only colours it: it decides nothing.
 */
data class StatusMessage(
    val text: String,
    val source: StatusSource,
    val error: Boolean,
    val at: Long,
    val ttlMs: Long?,
    val untilKeystroke: Boolean,
)

/**
 * The messages posted to the status line. The newest one still alive is shown; with none, the base (what the
 * composer's state says all along, such as "Esc to stop").
 */
class StatusMessages {
    private val posted = ArrayList<StatusMessage>()

    /** Whether a posted message is still alive (as of the last [shown]): the line has to be looked at again. */
    val pending: Boolean get() = posted.isNotEmpty()

    fun post(message: StatusMessage) {
        posted += message
    }

    /** A key was typed: the messages that last until then go. */
    fun keystroke() {
        posted.removeAll { it.untilKeystroke }
    }

    /** Drops every message (a message was sent). */
    fun clear() = posted.clear()

    /** What the line shows at [nowMs]: the newest message alive, else [base]. */
    fun shown(
        nowMs: Long,
        base: StatusMessage?,
    ): StatusMessage? {
        posted.removeAll { message -> message.ttlMs?.let { nowMs - message.at >= it } == true }
        return posted.lastOrNull() ?: base
    }
}

/** Why nothing can be sent now, or [NONE]. */
enum class SendBlock { NONE, STARTING, CLOSED }

/** What the composer says when a message cannot be sent; null when it can. */
fun sendBlockReason(block: SendBlock): String? =
    when (block) {
        SendBlock.NONE -> null
        SendBlock.STARTING -> ClostaBundle.message("composer.block.starting")
        SendBlock.CLOSED -> ClostaBundle.message("composer.block.closed")
    }

/** What the model and mode buttons say while the session is not up yet, and the empty model list. */
val WAITING_FOR_CLI: String get() = ClostaBundle.message("composer.waitingForCli")
