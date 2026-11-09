package dev.ukitomato.closta.presenter.diff

import dev.ukitomato.closta.presenter.tree.JsonArray
import dev.ukitomato.closta.presenter.tree.JsonBool
import dev.ukitomato.closta.presenter.tree.JsonNull
import dev.ukitomato.closta.presenter.tree.JsonNumber
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonString
import dev.ukitomato.closta.presenter.tree.JsonValue
import java.util.Random

/**
 * Contract-shaped trees — threads, messages, parts (text, reasoning, tool calls with arguments, results, statuses,
 * approvals and a sub-agent's messages under them) — and edits of them the way the projection makes them: an
 * input touches a few nodes and rebuilds the path down to them, so every other branch stays the same object. The
 * edits are the ones the projection makes: a message or a part inserted in the middle of an order, text appended
 * to a streaming part, a status changed or dropped, an approval added and resolved, a result arriving, a part
 * moving to another message (the approval-only part), a sub-agent's messages appearing, arguments
 * changing, a thread starting or closing.
 *
 * [edits] counts the edits by kind, and only those that changed the tree — an edit that picked a node and left it
 * as it was (the same status again, a field removed that was not there) counts nothing — so a test can show the
 * steps reach each change. It also counts the first draw of each sequence (how many messages the first thread
 * starts with), so a test can show the sequences spread over every value of it.
 */
class ShapedTrees(
    private val random: Random,
    private val edits: DiffChecks.Coverage,
) {
    private var serial = 0

    private fun id(prefix: String): String = "$prefix${++serial}"

    private fun chance(percent: Int): Boolean = random.nextInt(PERCENT) < percent

    private fun <T> pick(items: List<T>): T = items[random.nextInt(items.size)]

    /** A tree of one thread with one to [START_MESSAGES] messages, the first draw of the sequence. */
    fun start(): JsonObject {
        val messages = random.nextInt(START_MESSAGES) + 1
        edits.count("start with $messages messages")
        return obj("threads" to collection(listOf(thread(messages))))
    }

    /** [tree] after up to [MAX_EDITS] edits, or [tree] itself. */
    fun step(tree: JsonObject): JsonObject {
        if (chance(NOTHING)) return tree.also { edits.count("nothing") }
        var next = tree
        repeat(random.nextInt(MAX_EDITS) + 1) { next = edit(next) }
        return next
    }

    private val kinds =
        listOf<Pair<String, (JsonObject) -> JsonObject?>>(
            "message inserted" to ::insertMessage,
            "part inserted" to ::insertPart,
            "text appended" to ::appendText,
            "text rewritten" to ::rewriteText,
            "status changed" to ::changeStatus,
            "status dropped" to ::dropStatus,
            "approval added" to ::addApproval,
            "approval resolved" to ::resolveApproval,
            "result added" to ::addResult,
            "part moved" to ::movePart,
            "sub-agent started" to ::startSubAgent,
            "args changed" to ::changeArgs,
            "running toggled" to ::toggleRunning,
            "thread closed" to ::closeThread,
            "thread added" to ::addThread,
            "message rebuilt equal" to ::rebuildMessage,
        )

    private fun edit(tree: JsonObject): JsonObject {
        val (kind, change) = pick(kinds)
        val next = change(tree) ?: return tree
        edits.count(kind)
        return next
    }

    // ---- building nodes ----

    private fun s(value: String) = JsonString(value)

    private fun obj(vararg members: Pair<String, JsonValue>) = JsonObject.of(*members)

    private fun collection(entries: List<Pair<String, JsonObject>>): JsonObject =
        obj("order" to JsonArray(entries.map { s(it.first) }), "byId" to JsonObject.of(*entries.toTypedArray()))

    private fun thread(messages: Int): Pair<String, JsonObject> {
        val key = id("t")
        val items = List(messages) { message(nested = false) }
        return key to
            obj("id" to s(key), "isRunning" to JsonBool.of(random.nextBoolean()), "messages" to collection(items))
    }

    private fun message(nested: Boolean): Pair<String, JsonObject> {
        val key = id(if (nested) "n" else "m")
        val role = if (nested || chance(HALF)) "assistant" else "user"
        val members = mutableListOf<Pair<String, JsonValue>>("id" to s(key), "role" to s(role))
        if (!nested && role == "assistant") members += "status" to pick(messageStatuses)
        if (chance(HALF)) members += "createdAt" to JsonNumber.of(CREATED + serial)
        members += "parts" to collection(List(random.nextInt(MAX_NEW_PARTS) + 1) { part(key, nested) })
        return key to JsonObject.of(*members.toTypedArray())
    }

    private fun part(
        message: String,
        nested: Boolean,
    ): Pair<String, JsonObject> =
        if (chance(TOOL_CALL)) {
            val key = id("toolu_")
            key to toolCall(key, nested)
        } else {
            val kind = if (chance(REASONING)) "reasoning" else "text"
            "$message:${++serial}" to
                obj("type" to s(kind), "text" to s(pick(textPool)), "status" to pick(partStatuses))
        }

    private fun toolCall(
        key: String,
        nested: Boolean,
    ): JsonObject {
        val members =
            mutableListOf<Pair<String, JsonValue>>(
                "type" to s("tool-call"),
                "toolCallId" to s(key),
                "toolName" to s(pick(listOf("Bash", "Read", "Task", "Edit"))),
                "argsText" to s("{\"command\":\"ls"),
                "args" to obj("command" to s("ls"), "files" to JsonArray(listOf(s("a.kt")))),
                "status" to pick(toolStatuses),
            )
        if (!nested && chance(SUB_AGENT)) members += "messages" to collection(listOf(message(nested = true)))
        return JsonObject.of(*members.toTypedArray())
    }

    private val textPool = listOf("", "The build", "思考中", "x😀", "Let me check")
    private val suffixPool = listOf(" runs", " Gradle.", "😀", "。", "\n- item", "a")

    private fun status(
        type: String,
        reason: String? = null,
    ): JsonObject = if (reason == null) obj("type" to s(type)) else obj("type" to s(type), "reason" to s(reason))

    private val messageStatuses =
        listOf(
            status("running"),
            status("requires-action", "tool-calls"),
            status("complete", "stop"),
            status("incomplete", "cancelled"),
        )
    private val partStatuses = listOf(status("running"), status("complete"), status("incomplete", "cancelled"))
    private val toolStatuses =
        listOf(
            status("running"),
            status("requires-action", "tool-calls"),
            status("complete"),
            status("incomplete", "error"),
        )

    // ---- where things are ----

    private class Places {
        val messageCollections = ArrayList<List<String>>()
        val partCollections = ArrayList<List<String>>()
        val messages = ArrayList<List<String>>()
        val texts = ArrayList<List<String>>()
        val toolCalls = ArrayList<List<String>>()
        val threads = ArrayList<List<String>>()
    }

    private fun places(tree: JsonObject): Places {
        val places = Places()
        for (thread in tree.at(listOf("threads", "byId")).keys) {
            val path = listOf("threads", "byId", thread)
            places.threads += path
            messages(tree, path + "messages", places)
        }
        return places
    }

    private fun messages(
        tree: JsonObject,
        collection: List<String>,
        places: Places,
    ) {
        places.messageCollections += collection
        for (message in tree.at(collection + "byId").keys) {
            val path = collection + listOf("byId", message)
            places.messages += path
            places.partCollections += path + "parts"
            val parts = path + listOf("parts", "byId")
            for (key in tree.at(parts).keys) part(tree, parts + key, places)
        }
    }

    private fun part(
        tree: JsonObject,
        path: List<String>,
        places: Places,
    ) {
        val part = tree.at(path)
        if (part["type"] != s("tool-call")) {
            places.texts += path
            return
        }
        places.toolCalls += path
        if (part.containsKey("messages")) messages(tree, path + "messages", places)
    }

    // ---- reading and rebuilding along a path (the generator's own, so the applier is not used to make inputs) ----

    private fun JsonObject.at(path: List<String>): JsonObject = path.fold(this) { node, key -> node[key] as JsonObject }

    private fun JsonObject.with(
        key: String,
        value: JsonValue,
    ): JsonObject {
        val builder = JsonObject.Builder()
        entries.forEach { (name, member) -> builder.put(name, member) }
        return builder.put(key, value).build()
    }

    private fun JsonObject.without(key: String): JsonObject {
        val builder = JsonObject.Builder()
        entries.forEach { (name, member) -> if (name != key) builder.put(name, member) }
        return builder.build()
    }

    private fun update(
        node: JsonObject,
        path: List<String>,
        change: (JsonObject) -> JsonObject,
    ): JsonObject =
        if (path.isEmpty()) {
            change(node)
        } else {
            node.with(path[0], update(node[path[0]] as JsonObject, path.drop(1), change))
        }

    private fun keysOf(collection: JsonObject): List<String> =
        (collection["order"] as JsonArray).items.map {
            (it as JsonString).value
        }

    private fun inserted(
        collection: JsonObject,
        entry: Pair<String, JsonObject>,
        position: Int,
    ): JsonObject {
        val keys = keysOf(collection).toMutableList()
        keys.add(position, entry.first)
        val byId = (collection["byId"] as JsonObject).with(entry.first, entry.second)
        return collection.with("order", JsonArray(keys.map(::s))).with("byId", byId)
    }

    private fun removed(
        collection: JsonObject,
        key: String,
    ): JsonObject {
        val keys = keysOf(collection).filter { it != key }
        val byId = (collection["byId"] as JsonObject).without(key)
        return collection.with("order", JsonArray(keys.map(::s))).with("byId", byId)
    }

    // Inserts at a random position, and counts the inserts that land between two entries.
    private fun insertAnywhere(
        tree: JsonObject,
        collection: List<String>,
        entry: Pair<String, JsonObject>,
        what: String,
    ): JsonObject {
        val size = keysOf(tree.at(collection)).size
        val position = random.nextInt(size + 1)
        if (position in 1 until size) edits.count("$what inserted in the middle")
        return update(tree, collection) { inserted(it, entry, position) }
    }

    // [tree] with the node at [path] changed by [change]; null when the node comes out equal, so that an edit that
    // changed nothing is not counted.
    private fun changedAt(
        tree: JsonObject,
        path: List<String>,
        change: (JsonObject) -> JsonObject,
    ): JsonObject? {
        val old = tree.at(path)
        val new = change(old)
        return if (new == old) null else update(tree, path) { new }
    }

    // ---- the edits; null when the tree has nothing to apply one to, or the edit would change nothing ----

    private fun insertMessage(tree: JsonObject): JsonObject? {
        val collections = places(tree).messageCollections
        val collection = pick(collections)
        val nested = collection.size > MESSAGES_OF_A_THREAD
        return insertAnywhere(tree, collection, message(nested), "message")
    }

    private fun insertPart(tree: JsonObject): JsonObject? {
        val collections = places(tree).partCollections.ifEmpty { return null }
        val collection = pick(collections)
        val nested = collection.size > PARTS_OF_A_TOP_MESSAGE
        return insertAnywhere(tree, collection, part(collection[collection.size - 2], nested), "part")
    }

    private fun appendText(tree: JsonObject): JsonObject? {
        val texts = places(tree).texts.ifEmpty { return null }
        return changedAt(tree, pick(texts)) { it.with("text", s((it["text"] as JsonString).value + pick(suffixPool))) }
    }

    private fun rewriteText(tree: JsonObject): JsonObject? {
        val texts = places(tree).texts.ifEmpty { return null }
        return changedAt(tree, pick(texts)) { it.with("text", s(pick(textPool).reversed() + "!")) }
    }

    private fun changeStatus(tree: JsonObject): JsonObject? {
        val places = places(tree)
        val choice = random.nextInt(STATUS_TARGETS)
        val (targets, statuses) =
            when (choice) {
                0 -> places.messages.filter { tree.at(it)["status"] != null } to messageStatuses
                1 -> places.texts to partStatuses
                else -> places.toolCalls to toolStatuses
            }
        val target = targets.ifEmpty { return null }.let(::pick)
        return changedAt(tree, target) { it.with("status", pick(statuses)) }
    }

    private fun dropStatus(tree: JsonObject): JsonObject? {
        val texts = places(tree).texts.filter { tree.at(it).containsKey("status") }.ifEmpty { return null }
        return changedAt(tree, pick(texts)) { it.without("status") }
    }

    private fun addApproval(tree: JsonObject): JsonObject? {
        val calls = places(tree).toolCalls.filter { !tree.at(it).containsKey("approval") }.ifEmpty { return null }
        val approval =
            obj(
                "id" to s(id("req-")),
                "display" to s(pick(listOf("decision", "select"))),
                "prompt" to s("Run ls?"),
                "options" to JsonArray(listOf(obj("id" to s("allow"), "kind" to s("allow"), "label" to s("Allow")))),
            )
        return changedAt(tree, pick(calls)) {
            it.with("approval", approval).with("status", status("requires-action", "tool-calls"))
        }
    }

    private fun resolveApproval(tree: JsonObject): JsonObject? {
        val calls =
            places(tree)
                .toolCalls
                .filter {
                    (tree.at(it)["approval"] as? JsonObject)?.containsKey("approved") == false
                }.ifEmpty { return null }
        return changedAt(tree, pick(calls)) { call ->
            val approval = call["approval"] as JsonObject
            val answered =
                if (chance(HALF)) {
                    approval.with("approved", JsonBool.TRUE).with("optionId", s("allow"))
                } else {
                    approval.with("approved", JsonBool.FALSE).with("resolution", s("cancelled"))
                }
            call.with("approval", answered).with("status", status("running"))
        }
    }

    private fun addResult(tree: JsonObject): JsonObject? {
        val calls = places(tree).toolCalls.filter { !tree.at(it).containsKey("result") }.ifEmpty { return null }
        val result =
            pick(
                listOf(
                    s("ok\n"),
                    JsonArray(listOf(obj("type" to s("text"), "text" to s("done")))),
                    obj("stdout" to s("a.kt"), "exitCode" to JsonNumber.of(0), "0" to JsonNull),
                ),
            )
        return changedAt(tree, pick(calls)) {
            it.with("result", result).with("isError", JsonBool.of(chance(QUARTER))).with("status", status("complete"))
        }
    }

    // The approval-only part moves to the latest assistant message: gone from one, appended to another.
    private fun movePart(tree: JsonObject): JsonObject? {
        val collections = places(tree).partCollections
        val from = pick(collections)
        val to = collections.filter { it != from && it.size == from.size }
        if (keysOf(tree.at(from)).size < 2 || to.isEmpty()) return null
        val key = pick(keysOf(tree.at(from)))
        val part = tree.at(from + listOf("byId", key))
        edits.count("part removed")
        val without = update(tree, from) { removed(it, key) }
        return update(without, pick(to)) { inserted(it, key to part, keysOf(it).size) }
    }

    private fun startSubAgent(tree: JsonObject): JsonObject? {
        val calls =
            places(tree)
                .toolCalls
                .filter { it.size == TOP_TOOL_CALL && !tree.at(it).containsKey("messages") }
                .ifEmpty { return null }
        return changedAt(tree, pick(calls)) { it.with("messages", collection(listOf(message(nested = true)))) }
    }

    // Counted as "args changed" only when the arguments changed; a removal only when the field was there.
    private fun changeArgs(tree: JsonObject): JsonObject? {
        val target = places(tree).toolCalls.ifEmpty { return null }.let(::pick)
        val args = tree.at(target + "args")
        val changed = editArgs(args)
        return if (changed == args) {
            null
        } else {
            update(tree, target) {
                it.with("args", changed).with("argsText", s((it["argsText"] as JsonString).value + " -la"))
            }
        }
    }

    private fun editArgs(args: JsonObject): JsonObject =
        when (random.nextInt(ARGS_CHANGES)) {
            0 -> args.with("command", s((args["command"] as? JsonString)?.value.orEmpty() + " -la"))
            1 -> args.with("timeout", JsonNumber.of(random.nextInt(TIMEOUTS).toLong()))
            2 -> args.with("files", JsonArray(listOf(s("a.kt"), s("b.kt"))))
            else -> args.without("files").also { if (it != args) edits.count("args field removed") }
        }

    private fun toggleRunning(tree: JsonObject): JsonObject? {
        val thread = pick(places(tree).threads)
        return changedAt(tree, thread) { it.with("isRunning", JsonBool.of((it["isRunning"] as JsonBool).value.not())) }
    }

    // A thread that closes leaves the root's collection, and the next one comes in the same patch.
    private fun closeThread(tree: JsonObject): JsonObject {
        val threads = tree["threads"] as JsonObject
        val closing = pick(keysOf(threads))
        val opened = thread(messages = 1)
        return obj("threads" to inserted(removed(threads, closing), opened, keysOf(threads).size - 1))
    }

    private fun addThread(tree: JsonObject): JsonObject? {
        val threads = tree["threads"] as JsonObject
        if (keysOf(threads).size >= MAX_THREADS) return null
        return tree.with("threads", inserted(threads, thread(messages = 1), random.nextInt(keysOf(threads).size + 1)))
    }

    // A fresh projector builds equal nodes that are other objects.
    private fun rebuildMessage(tree: JsonObject): JsonObject {
        val message = pick(places(tree).messages)
        return update(tree, message) { DiffChecks.deepCopy(it) as JsonObject }
    }

    companion object {
        /** The most messages [start] gives the first thread: it draws one to this many. */
        const val START_MESSAGES = 4

        private const val PERCENT = 100
        private const val HALF = 50
        private const val QUARTER = 25
        private const val NOTHING = 5
        private const val MAX_EDITS = 3
        private const val MAX_NEW_PARTS = 3
        private const val TOOL_CALL = 40
        private const val REASONING = 30
        private const val SUB_AGENT = 30
        private const val STATUS_TARGETS = 3
        private const val ARGS_CHANGES = 4
        private const val TIMEOUTS = 600
        private const val MAX_THREADS = 3
        private const val CREATED = 1_759_400_000_000L

        // Path lengths: a thread's messages are at ["threads","byId",t,"messages"], a top-level message's parts
        // at […,"byId",m,"parts"], and a tool call of a top-level message at […,"parts","byId",p].
        private const val MESSAGES_OF_A_THREAD = 4
        private const val PARTS_OF_A_TOP_MESSAGE = 7
        private const val TOP_TOOL_CALL = 9
    }
}
