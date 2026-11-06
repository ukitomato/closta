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
 * One line of a saved record, read: which lines are the conversation, what a user said first, and the events
 * the
 * conversation's own lines become. A line that is not a JSON object reads as none, and so does one without the fields
 * an
 * event needs: nothing here throws for a damaged record. Only counts leave this, never what a line said.
 */
internal object RecordLines {
    /** How many lines from the top of a record are read for its title. */
    const val HEAD_LINES = 200

    /** How many characters of the first sentence the title keeps. */
    const val TITLE_CHARS = 80

    /**
     * The longest line (in bytes) that is read: a longer one is skipped without being parsed, and counted. A line of
     * the conversation is a message, and a tool's result in it can be big, but not past this.
     */
    const val MAX_LINE_BYTES = 1024 * 1024

    private val SESSION_ID =
        Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
    private val WHITESPACE = Regex("\\s+")

    // The lines the conversation is made of say so in their `type`, whatever else a line holds: a line that has no
    // user or assistant type anywhere in it is not one, and is not parsed. (A line that has it only inside a text is
    // parsed, and then read by its own type.)
    private val CONVERSATION_TYPE = Regex("\"type\"\\s*:\\s*\"(?:user|assistant)\"")
    private val STRICT: Gson = GsonBuilder().setStrictness(Strictness.STRICT).create()

    /** Whether [name] is a session id as the CLI makes them (a UUID): what a record is named by. */
    fun isSessionId(name: String): Boolean = SESSION_ID.matches(name)

    /**
     * What the top of a record says: whether a user of the main conversation speaks, and the first sentence he
     * says.
     */
    class HeadScan(
        val sawUser: Boolean,
        val title: String?,
    )

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

    /**
     * Reads the top of a record up to its first user sentence, or [HEAD_LINES] lines. A line over the limit is not a
     * line to read for a title.
     */
    fun scanHead(lines: BoundedLines): HeadScan {
        var sawUser = false
        var title: String? = null
        var read = 0
        while (read < HEAD_LINES && title == null) {
            val line = lines.next() ?: break
            read++
            val row = (line as? BoundedLines.Line.Text)?.text?.takeIf(::mayBeConversation)?.let(::row)
            if (row != null && row.isMainUser()) {
                sawUser = true
                title = sentenceOf(row)
            }
        }
        return HeadScan(sawUser, title)
    }

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

    private fun row(line: String): JsonObject? =
        try {
            STRICT.fromJson(line, JsonElement::class.java) as? JsonObject
        } catch (ignoredDamaged: JsonParseException) {
            null
        }

    /** The first sentence a user line holds: a string content, or the first non-blank text block of a list. */
    private fun sentenceOf(row: JsonObject): String? {
        val text =
            when (val content = (row.get("message") as? JsonObject)?.get("content")) {
                is JsonPrimitive -> content.takeIf { it.isString }?.asString
                is JsonArray ->
                    content
                        .mapNotNull { block -> (block as? JsonObject)?.takeIf { it.string("type") == "text" } }
                        .firstNotNullOfOrNull { it.string("text")?.takeIf(String::isNotBlank) }
                else -> null
            }
        val sentence = text?.trim()?.replace(WHITESPACE, " ")?.takeIf { it.isNotEmpty() }
        // By characters a person sees, not by UTF-16 units: a title is never cut through a pair.
        val points = sentence?.codePoints()?.toArray()
        return if (points == null || points.size <= TITLE_CHARS) sentence else String(points, 0, TITLE_CHARS)
    }
}

// A user line of the main conversation: not a sub-agent's, not a note the CLI wrote for the model and not the summary
// of a compaction. The same rule [RecordLines.eventOf] reads a user line by: what a title is made from is what is read.
private fun JsonObject.isMainUser(): Boolean = string("type") == "user" && !flag("isSidechain") && !isNote()

// What the CLI wrote itself in a user line: a note for the model, or the summary of a compaction.
private fun JsonObject.isNote(): Boolean = flag("isMeta") || flag("isCompactSummary")

private fun JsonObject.string(key: String): String? = (get(key) as? JsonPrimitive)?.takeIf { it.isString }?.asString

private fun JsonObject.flag(key: String): Boolean =
    (get(key) as? JsonPrimitive)?.takeIf { it.isBoolean }?.asBoolean == true

// A message that holds nothing but the results of tool calls.
private fun JsonObject.onlyToolResults(): Boolean {
    val blocks = get("content") as? JsonArray
    val results = blocks?.count { (it as? JsonObject)?.string("type") == "tool_result" }
    return results != null && results > 0 && results == blocks.size()
}
