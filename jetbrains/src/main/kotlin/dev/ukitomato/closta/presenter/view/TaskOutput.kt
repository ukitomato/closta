package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.presenter.tree.JsonBool
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonRead

/**
 * The end of a shell task's output as the CLI last gave it: [text] has been through [terminalText]; [totalBytes] is the
 * size of the whole output and [truncated] says [text] is only its tail. A refusal has no text and a [failure], the
 * CLI's sentence.
 */
data class TaskOutputRecord(
    val taskId: String,
    val text: String,
    val totalBytes: Long,
    val truncated: Boolean,
    val failure: String?,
) {
    // The output is what a command printed: only the task and the length are written to a log.
    override fun toString(): String = "TaskOutputRecord(task=$taskId, length=${text.length})"
}

/**
 * The output of the task [ControlRequested.value] was asked under the request's id. Each request replaces the one
 * before (only the newest is waited for), and the output kept is dropped when it is another task's or a refusal.
 */
internal fun OperationRecords.taskOutputAsked(input: PresenterInput.ControlRequested): OperationRecords {
    val taskId = input.value ?: return this
    return copy(
        outputAsk = input.requestId to taskId,
        output = output?.takeIf { it.taskId == taskId && it.failure == null },
    )
}

/**
 * The answer to the request asked last. A success that reads is the output (a body with no `output` does not read: the
 * last one stays); a refusal is kept with the CLI's sentence. Either way nothing waits any more.
 */
internal fun OperationRecords.taskOutputAnswered(event: AgentEvent.ControlResponse): OperationRecords {
    val (_, taskId) = outputAsk ?: return this
    val read =
        if (event.subtype == "success") {
            outputOf(taskId, JsonRead.parse(event.response.text) as? JsonObject)
        } else {
            TaskOutputRecord(taskId, "", 0, false, plainSentenceOf(event.error))
        }
    return copy(outputAsk = null, output = read ?: output)
}

/** The `response` of a success as a record of [taskId]'s output; null when it has no `output`. */
private fun outputOf(
    taskId: String,
    answer: JsonObject?,
): TaskOutputRecord? {
    val body = answer?.obj("response")
    val raw = body?.string("output")
    return raw?.let {
        val total = body.number("total_bytes")?.takeIf { size -> size.isFinite() && size >= 0 }?.toLong()
        val truncated = (body["truncated"] as? JsonBool)?.value == true
        TaskOutputRecord(taskId, terminalText(it), total ?: it.toByteArray().size.toLong(), truncated, null)
    }
}

/** The CLI process ended: its tasks are gone with it, and nothing waits for an answer from it. */
internal fun OperationRecords.processEnded(): OperationRecords = copy(outputAsk = null, processEnded = true)

/** The tasks of the CLI that ended or was replaced are not running: its list is not the next one's. */
internal fun Transcript.withoutTasks(): Transcript =
    if (background.live.isEmpty()) this else copy(background = background.copy(live = emptyList()))

/** What a poll of a task's output does at a tick of the clock. */
enum class OutputPoll {
    /** The last request is not answered yet: nothing is sent. */
    WAIT,

    /** The task runs: ask again. */
    ASK,

    /** The task is gone from the running list: ask once more, for what it wrote last, then stop. */
    ASK_LAST,

    /** The task is over and its last output was read, or the CLI refused: the clock stops. */
    STOP,
}

/**
 * What the next tick does. Only one request is ever out ([asking]); a refusal ([failed]) stops the clock; once the
 * CLI is gone or replaced ([stopped]) nothing is asked; once the
 * task is no longer running ([live]), one more request ([lastAsked] says it was sent) reads what it wrote at the end.
 */
fun outputPoll(
    asking: Boolean,
    live: Boolean,
    lastAsked: Boolean,
    failed: Boolean,
    stopped: Boolean = false,
): OutputPoll =
    when {
        stopped || failed -> OutputPoll.STOP
        asking -> OutputPoll.WAIT
        live -> OutputPoll.ASK
        !lastAsked -> OutputPoll.ASK_LAST
        else -> OutputPoll.STOP
    }
