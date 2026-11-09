package dev.ukitomato.closta.providers.claude.history

import com.google.gson.Gson
import com.google.gson.GsonBuilder
import com.google.gson.JsonArray
import com.google.gson.JsonElement
import com.google.gson.JsonObject
import com.google.gson.JsonParseException
import com.google.gson.JsonPrimitive
import com.google.gson.Strictness
import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.core.models.RawJson

/**
 * One line of a saved record, read: which lines are the conversation, and the events the conversation's own lines
 * become. A line that is not a JSON object reads as none, and so does one without the fields an event needs: nothing
 * here throws for a damaged record. Only counts leave this, never what a line said.
 */
internal object RecordLines {
    /**
     * The longest line (in bytes) that is read: a longer one is skipped without being parsed, and counted. A line of
     * the conversation is a message, and a tool's result in it can be big, but not past this.
     */
    const val MAX_LINE_BYTES = 1024 * 1024

    private val SESSION_ID =
        Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")

    // The lines the conversation is made of say so in their `type`, whatever else a line holds: a line that has no
    // user or assistant type anywhere in it is not one, and is not parsed. (A line that has it only inside a text is
    // parsed, and then read by its own type.)
    private val CONVERSATION_TYPE = Regex("\"type\"\\s*:\\s*\"(?:user|assistant)\"")

    private val STRICT: Gson = GsonBuilder().setStrictness(Strictness.STRICT).create()

    /** Whether [name] is a session id as the CLI makes them (a UUID): what a record is named by. */
    fun isSessionId(name: String): Boolean = SESSION_ID.matches(name)

    /** A conversation line made an event, and whether it only holds the results of tool calls. */
    class Kept(
        val event: AgentEvent,
        val onlyResults: Boolean,
        /** The `parentUuid` of a user line: the line before it in the chain. Null if it has none. */
        val parentUuid: String? = null,
    )

    private class Ids(
        val uuid: String,
        val sessionId: String,
        val timestamp: String,
    )

    /** Whether a line says it is a user or an assistant line: the only ones worth parsing. */
    fun mayBeConversation(line: String): Boolean = CONVERSATION_TYPE.containsMatchIn(line)

    /** The conversation's own lines, as the lines of stdout the same fold draws; every other line is none. */
    fun eventOf(line: String): Kept? {
        val row = (if (mayBeConversation(line)) row(line) else null) ?: return null
        val ids = idsOf(row)
        val message = row.get("message") as? JsonObject
        return if (row.flag("isSidechain") || ids == null || message == null) null else eventOf(row, ids, message)
    }

    private fun eventOf(
        row: JsonObject,
        ids: Ids,
        message: JsonObject,
    ): Kept? =
        when (row.string("type")) {
            "user" -> userOf(row, ids, message)
            "assistant" ->
                Kept(
                    AgentEvent.Assistant(
                        uuid = ids.uuid,
                        sessionId = ids.sessionId,
                        timestamp = ids.timestamp,
                        requestId = row.string("requestId").orEmpty(),
                        message = RawJson(message.toString()),
                        wireToolInputs = raw(row, "wireToolInputs"),
                    ),
                    onlyResults = false,
                )
            else -> null
        }

    // A note the CLI wrote for the model, and a summary it wrote of a compaction, are not what the user said.
    private fun userOf(
        row: JsonObject,
        ids: Ids,
        message: JsonObject,
    ): Kept? =
        if (row.isNote()) {
            null
        } else {
            Kept(
                AgentEvent.User(
                    uuid = ids.uuid,
                    sessionId = ids.sessionId,
                    timestamp = ids.timestamp,
                    message = RawJson(message.toString()),
                    toolUseResult = raw(row, "toolUseResult"),
                ),
                onlyResults = message.onlyToolResults(),
                parentUuid = row.string("parentUuid"),
            )
        }

    private fun idsOf(row: JsonObject): Ids? {
        val uuid = row.string("uuid")
        val sessionId = row.string("sessionId")
        val timestamp = row.string("timestamp")
        return if (uuid != null && sessionId != null && timestamp != null) Ids(uuid, sessionId, timestamp) else null
    }

    private fun raw(
        row: JsonObject,
        key: String,
    ): RawJson? = row.get(key)?.takeUnless { it.isJsonNull }?.let { RawJson(it.toString()) }

    /** [line] as a JSON object, or null when it is not one. */
    fun row(line: String): JsonObject? =
        try {
            STRICT.fromJson(line, JsonElement::class.java) as? JsonObject
        } catch (ignoredDamaged: JsonParseException) {
            null
        }
}

// A user line of the main conversation: not a sub-agent's, not a note the CLI wrote for the model and not the summary
// of a compaction. The same rule [RecordLines.eventOf] reads a user line by: what a title is made from is what is read.
internal fun JsonObject.isMainUser(): Boolean = string("type") == "user" && !flag("isSidechain") && !isNote()

// What the CLI wrote itself in a user line: a note for the model, or the summary of a compaction.
private fun JsonObject.isNote(): Boolean = flag("isMeta") || flag("isCompactSummary")

internal fun JsonObject.string(key: String): String? = (get(key) as? JsonPrimitive)?.takeIf { it.isString }?.asString

private fun JsonObject.flag(key: String): Boolean =
    (get(key) as? JsonPrimitive)?.takeIf { it.isBoolean }?.asBoolean == true

// A message that holds nothing but the results of tool calls.
private fun JsonObject.onlyToolResults(): Boolean {
    val blocks = get("content") as? JsonArray
    val results = blocks?.count { (it as? JsonObject)?.string("type") == "tool_result" }
    return results != null && results > 0 && results == blocks.size()
}
