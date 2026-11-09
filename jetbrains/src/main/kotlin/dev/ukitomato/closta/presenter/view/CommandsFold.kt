package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonRead
import dev.ukitomato.closta.presenter.tree.JsonValue

// The slash commands the transcript keeps, folded from the two lines that carry them.

/**
 * The `initialize` response carries the slash commands with their descriptions; it replaces any list. A response
 * of another kind, an error, or one with no commands leaves the transcript as it was.
 */
internal fun foldCommandsOfResponse(
    transcript: Transcript,
    event: AgentEvent.ControlResponse,
): Transcript {
    val response = JsonRead.parse(event.response.text).takeIf { event.subtype == "success" }
    val commands = commandsOfResponse(response)
    val withCommands = commands?.let { withCommands(transcript, SlashCommands(it, detailed = true)) } ?: transcript
    // The same response lists the models; one that lists none leaves the ones the transcript has.
    val models = modelsOfResponse(response)?.takeIf { it.isNotEmpty() }
    // And the permission mode the CLI starts in, shown before `system/init` says what the session runs.
    val mode = permissionModeOfResponse(response)
    val operations = withCommands.operations
    val updated =
        operations.copy(
            models = models ?: operations.models,
            startPermissionMode = mode ?: operations.startPermissionMode,
        )
    return if (updated == operations) withCommands else withCommands.withOperations(updated)
}

/** `system/init` names the commands only; it is used while no `initialize` response has given the list. */
internal fun foldCommandsOfInit(
    transcript: Transcript,
    event: AgentEvent.SystemInit,
): Transcript {
    val commands = commandsOfInit(JsonRead.parse(event.slashCommands.text)).takeUnless { transcript.commands.detailed }
    return commands?.let { withCommands(transcript, SlashCommands(it, detailed = false)) } ?: transcript
}

private fun withCommands(
    transcript: Transcript,
    commands: SlashCommands,
): Transcript = if (transcript.commands == commands) transcript else transcript.copy(commands = commands)

/**
 * The permission mode of an `initialize` response (`response.response.current_permission_mode`), or null when it
 * has none.
 * The SDK's type does not declare it; the captures do, and the capture wins.
 */
private fun permissionModeOfResponse(response: JsonValue?): String? =
    (response as? JsonObject)?.obj("response")?.string("current_permission_mode")?.takeIf { it.isNotEmpty() }
