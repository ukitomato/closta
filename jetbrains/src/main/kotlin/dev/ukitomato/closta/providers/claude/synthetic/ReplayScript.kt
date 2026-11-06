package dev.ukitomato.closta.providers.claude.synthetic

import com.google.gson.JsonObject

/**
 * A turn the spike replays, as the stream-json lines the CLI would print: the turn starts, the session says init, an
 * Edit is streamed and answered, then [reply] is streamed in pieces of [chunkChars] characters, and the turn ends. The
 * user's words are not here: the CLI does not echo them.
 */
object ReplayScript {
    private const val EDIT_ID = "toolu_spike_edit"
    private const val COMMAND = "spike-command"

    fun lines(
        reply: String,
        chunkChars: Int = 8,
        sessionId: String = "spike-replay",
    ): List<String> {
        val script = StreamScript(sessionId)
        script.lifecycle(COMMAND, "queued")
        script.lifecycle(COMMAND, "started")
        script.init()
        script.streamTool("msg_spike_1", EDIT_ID, "Edit", EDIT_INPUT)
        script.toolResult(EDIT_ID, "The file has been updated successfully.")
        script.streamText("msg_spike_2", reply, chunkChars)
        script.result(reply)
        script.lifecycle(COMMAND, "completed")
        return script.lines
    }

    private val EDIT_INPUT =
        JsonObject().apply {
            addProperty("file_path", "/spike/src/main/kotlin/AuthService.kt")
            addProperty("old_string", "fun login(c: Credentials) =\n    api.login(c)")
            addProperty(
                "new_string",
                "suspend fun login(c: Credentials) =\n    retry(times = 3, backoff = 200.milliseconds) {\n" +
                    "        api.login(c)\n    }",
            )
        }
}
