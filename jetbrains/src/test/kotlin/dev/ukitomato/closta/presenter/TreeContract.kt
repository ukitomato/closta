package dev.ukitomato.closta.presenter

import dev.ukitomato.closta.presenter.tree.JsonArray
import dev.ukitomato.closta.presenter.tree.JsonBool
import dev.ukitomato.closta.presenter.tree.JsonNull
import dev.ukitomato.closta.presenter.tree.JsonNumber
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonString
import dev.ukitomato.closta.presenter.tree.JsonValue

/**
 * A Kotlin copy of what the webview checks a snapshot and a patch with (the webview's TypeScript: `checkJson`,
 * `checkTree` and `checkPatched`, `checkSegment`, `checkOp` and `checkOps`, the snapshot and patch branches of
 * `parseHostMessage`, and the version read `receive` does before the shape).
 * It is a copy for the tests that keeps the TypeScript's structure, so the projection's trees and the differ's
 * ops can be shown to pass the webview's own checks without Node; the contract fixtures (`TreeContractTest`,
 * `TreeContractOpsTest`) show the copy agrees with the original.
 *
 * Numbers are read the way `JSON.parse` reads them — as doubles — so `1.0` is the safe integer 1 here too.
 * Object members are visited in the order `Object.entries` gives (array-index keys first, ascending), which
 * only matters for where the first of several faults is reported.
 *
 * [strictFault] goes further than the webview: it rejects any key the protocol's table does not name, which the
 * webview allows, to show the projection emits only the contract's vocabulary.
 *
 * It keeps the TypeScript's shape — early returns at the first fault, one branch per field — so it can be read
 * against the original; reshaping it for the complexity rules would make that comparison harder.
 */
@Suppress("ReturnCount", "CyclomaticComplexMethod", "NestedBlockDepth", "LongParameterList", "LargeClass")
object TreeContract {
    const val MAX_DEPTH = 256
    const val PROTOCOL_VERSION = 1

    data class Issue(
        val code: String,
        val at: String,
    )

    /** What `receive` makes of a snapshot. */
    sealed interface Snapshot {
        data object Accepted : Snapshot

        /** Another protocol: fatal before its shape is read. */
        data object Mismatch : Snapshot

        data class Rejected(
            val issue: Issue,
        ) : Snapshot
    }

    fun checkSnapshot(raw: JsonValue): Snapshot {
        if (raw !is JsonObject || raw["type"] !is JsonString) return Snapshot.Rejected(Issue("malformed", "message"))
        if (isOtherProtocol(raw)) return Snapshot.Mismatch
        return snapshotIssue(raw)?.let(Snapshot::Rejected) ?: Snapshot.Accepted
    }

    /**
     * The version `receive` reads before the shape: [raw] is a snapshot that names a protocol, and not this one. The
     * one place the Kotlin copies read the version.
     */
    fun isOtherProtocol(raw: JsonValue?): Boolean {
        val message = raw as? JsonObject ?: return false
        val protocol = message["protocol"]
        return message["type"] == JsonString("snapshot") &&
            isVersion(protocol) &&
            number(protocol) != PROTOCOL_VERSION.toDouble()
    }

    /** The snapshot branch of `parseHostMessage` (`checkSnapshot`): null when it accepts [raw]. */
    fun snapshotIssue(raw: JsonObject): Issue? =
        when {
            !isVersion(raw["protocol"]) -> Issue("malformed", "snapshot.protocol")
            !isNonEmptyString(raw["epoch"]) -> Issue("malformed", "snapshot.epoch")
            !isSafeCount(raw["seq"]) -> Issue("malformed", "snapshot.seq")
            else -> checkTree(raw["tree"], "snapshot.tree")
        }

    /** `checkTree`: null when the webview accepts [raw] as a tree. */
    fun checkTree(
        raw: JsonValue?,
        at: String = "tree",
    ): Issue? {
        if (raw !is JsonObject) return Issue("bad-tree", at)
        checkJson(raw, MAX_DEPTH, at)?.let { return it }
        val fault = collection(raw["threads"], "$at.threads", ::thread, items = true) ?: atLeastOne(raw["threads"], at)
        return fault?.let { Issue("bad-tree", it) }
    }

    /** `checkJson`: JSON within [room] levels, no unsafe keys. The walk keeps its own stack, as the original. */
    fun checkJson(
        raw: JsonValue,
        room: Int,
        at: String,
    ): Issue? {
        val stack = ArrayDeque<Triple<JsonValue, Int, String>>()
        stack.addLast(Triple(raw, 1, at))
        while (stack.isNotEmpty()) {
            val (value, level, where) = stack.removeLast()
            when (value) {
                JsonNull, is JsonString, is JsonBool -> Unit
                is JsonNumber -> if (!number(value).isFinite()) return Issue("malformed", where)
                is JsonArray -> {
                    if (level > room) return Issue("malformed", where)
                    for ((index, item) in value.items.withIndex()) {
                        stack.addLast(Triple(item, level + 1, "$where[$index]"))
                    }
                }
                is JsonObject -> {
                    if (level > room) return Issue("malformed", where)
                    for (key in jsKeyOrder(value)) {
                        val child = value[key]!!
                        if (isUnsafeKey(key, child)) return Issue("unsafe-segment", "$where.$key")
                        stack.addLast(Triple(child, level + 1, "$where.$key"))
                    }
                }
            }
        }
        return null
    }

    private fun isUnsafeKey(
        key: String,
        value: JsonValue,
    ) = key == "__proto__" || (key == "constructor" && value is JsonObject && value.containsKey("prototype"))

    // ---- messages and ops ----

    /** The patch branch of `parseHostMessage`: null when the webview accepts [raw] as a patch. */
    fun checkPatch(raw: JsonValue): Issue? {
        if (raw !is JsonObject || raw["type"] !is JsonString) return Issue("malformed", "message")
        if (!isNonEmptyString(raw["epoch"])) return Issue("malformed", "patch.epoch")
        if (!isSafeCount(raw["seq"])) return Issue("malformed", "patch.seq")
        return checkOps(raw["ops"], "patch.ops")
    }

    /** `checkSegment`: a non-empty string that is not read as an array index and does not reach a prototype. */
    fun checkSegment(
        segment: JsonValue?,
        at: String,
    ): Issue? {
        if (segment !is JsonString || segment.value.isEmpty()) return Issue("malformed", at)
        if (indexSegment.matches(segment.value)) return Issue("index-segment", at)
        if (segment.value in unsafeSegments) return Issue("unsafe-segment", at)
        return null
    }

    private fun checkPath(
        raw: JsonValue?,
        at: String,
    ): Issue? {
        if (raw !is JsonArray) return Issue("malformed", at)
        if (raw.items.isEmpty()) return Issue("empty-path", at)
        if (raw.items.size > MAX_DEPTH) return Issue("malformed", at)
        for ((index, segment) in raw.items.withIndex()) {
            checkSegment(segment, "$at[$index]")?.let { return it }
        }
        return null
    }

    /** `checkOp`: null when the webview accepts [raw] as an op. */
    fun checkOp(
        raw: JsonValue?,
        at: String = "op",
    ): Issue? {
        if (raw !is JsonObject || raw["type"] !is JsonString) return Issue("malformed", at)
        val type = (raw["type"] as JsonString).value
        if (type != "set" && type != "append-text") return Issue("unknown-op", "$at.type")
        checkPath(raw["path"], "$at.path")?.let { return it }
        if (type == "append-text") return if (raw["value"] !is JsonString) Issue("malformed", "$at.value") else null
        val value = raw["value"] ?: return Issue("malformed", "$at.value")
        return checkJson(value, MAX_DEPTH - (raw["path"] as JsonArray).items.size, "$at.value")
    }

    /** `checkOps`: null when the webview accepts [raw] as the ops of a patch. */
    fun checkOps(
        raw: JsonValue?,
        at: String = "ops",
    ): Issue? {
        if (raw !is JsonArray) return Issue("malformed", at)
        for ((index, item) in raw.items.withIndex()) {
            checkOp(item, "$at[$index]")?.let { return it }
        }
        return null
    }

    // ---- tree ----

    private val roles = setOf("user", "assistant", "system")
    private val displays = setOf("decision", "select", "text")
    private val resolutions = setOf("cancelled", "expired")
    private val noticeKinds = setOf("error", "control-error")
    private val taskStatuses = setOf("running", "complete", "incomplete")
    private val ended = setOf("cancelled", "length", "content-filter", "other", "error")
    private val messageStatuses: Map<String, Set<String>?> =
        mapOf(
            "running" to null,
            "requires-action" to setOf("tool-calls", "interrupt"),
            "complete" to setOf("stop", "unknown"),
            "incomplete" to ended + "tool-calls",
        )
    private val attachmentKinds = setOf("image", "document", "text")
    private val partStatuses: Map<String, Set<String>?> =
        mapOf(
            "running" to null,
            "complete" to null,
            "incomplete" to ended,
        )
    private val toolCallStatuses: Map<String, Set<String>?> =
        mapOf(
            "running" to null,
            "requires-action" to setOf("tool-calls", "interrupt"),
            "complete" to null,
            "incomplete" to ended + "tool-calls",
        )

    private val indexSegment = Regex("^(0|[1-9][0-9]*)$")
    private val unsafeSegments = setOf("__proto__", "constructor", "prototype")

    private fun isId(id: JsonValue?): Boolean = checkSegment(id, "") == null

    private fun isStatus(statuses: Map<String, Set<String>?>): (JsonValue?) -> Boolean =
        { value ->
            val type = (value as? JsonObject)?.get("type") as? JsonString
            if (type == null || type.value !in statuses) {
                false
            } else {
                val reasons = statuses[type.value]
                reasons == null || ((value["reason"] as? JsonString)?.value in reasons)
            }
        }

    private fun optional(
        fields: JsonObject,
        key: String,
        valid: (JsonValue?) -> Boolean,
        at: String,
    ): String? = if (fields.containsKey(key) && !valid(fields[key])) "$at.$key" else null

    private val isString: (JsonValue?) -> Boolean = { it is JsonString }
    private val isBoolean: (JsonValue?) -> Boolean = { it is JsonBool }

    private fun oneOf(values: Set<String>): (JsonValue?) -> Boolean = { it is JsonString && it.value in values }

    private fun entries(raw: JsonValue?): Pair<JsonArray, JsonObject>? {
        if (raw !is JsonObject) return null
        val order = raw["order"] as? JsonArray ?: return null
        val byId = raw["byId"] as? JsonObject ?: return null
        return order to byId
    }

    private fun collection(
        raw: JsonValue?,
        at: String,
        item: (JsonValue?, String, String) -> String?,
        items: Boolean,
    ): String? {
        val (order, byId) = entries(raw) ?: return at
        val seen = LinkedHashSet<String>()
        order.items.forEachIndexed { index, id ->
            if (!isId(id) || (id as JsonString).value in seen || !byId.containsKey(id.value)) return "$at.order[$index]"
            seen += id.value
        }
        jsKeyOrder(byId).firstOrNull { it !in seen }?.let { return "$at.byId.$it" }
        if (!items) return null
        for (id in seen) item(byId[id], id, "$at.byId.$id")?.let { return it }
        return null
    }

    private fun approval(
        raw: JsonValue?,
        at: String,
    ): String? {
        if (raw !is JsonObject || !isNonEmptyString(raw["id"])) return at
        val option: (JsonValue?) -> Boolean = { value ->
            value is JsonObject &&
                value["id"] is JsonString &&
                value["kind"] is JsonString &&
                (!value.containsKey("label") || value["label"] is JsonString) &&
                (!value.containsKey("description") || value["description"] is JsonString)
        }
        val suggestion: (JsonValue?) -> Boolean = { value ->
            value is JsonObject &&
                isNonEmptyString(value["id"]) &&
                value["kind"] is JsonString &&
                value["detail"] is JsonString &&
                (!value.containsKey("destination") || value["destination"] is JsonString)
        }
        val questionOption: (JsonValue?) -> Boolean = { value ->
            value is JsonObject &&
                isNonEmptyString(value["id"]) &&
                value["label"] is JsonString &&
                (!value.containsKey("description") || value["description"] is JsonString)
        }
        val question: (JsonValue?) -> Boolean = { value ->
            value is JsonObject &&
                isNonEmptyString(value["id"]) &&
                value["prompt"] is JsonString &&
                value["multiSelect"] is JsonBool &&
                value["options"].let { it is JsonArray && it.items.all(questionOption) }
        }
        return optional(raw, "display", oneOf(displays), at)
            ?: optional(raw, "prompt", isString, at)
            ?: optional(raw, "options", { it is JsonArray && it.items.all(option) }, at)
            ?: optional(raw, "allowFreeform", isBoolean, at)
            ?: optional(raw, "dismissible", isBoolean, at)
            ?: optional(raw, "approved", isBoolean, at)
            ?: optional(raw, "isAutomatic", isBoolean, at)
            ?: optional(raw, "optionId", isString, at)
            ?: optional(raw, "text", isString, at)
            ?: optional(raw, "reason", isString, at)
            ?: optional(raw, "resolution", oneOf(resolutions), at)
            ?: optional(raw, "input", { it is JsonObject }, at)
            ?: optional(raw, "suggestions", { it is JsonArray && it.items.all(suggestion) }, at)
            ?: optional(raw, "questions", { it is JsonArray && it.items.all(question) }, at)
            ?: optional(raw, "acceptedSuggestions", { it is JsonArray && it.items.all { id -> id is JsonString } }, at)
            ?: optional(raw, "updatedInput", { it is JsonObject }, at)
            ?: optional(raw, "failure", isString, at)
            ?: optional(raw, "failures", ::isSafeCount, at)
    }

    private fun part(
        raw: JsonValue?,
        id: String,
        at: String,
        deep: Boolean = true,
    ): String? {
        if (raw !is JsonObject || raw["type"] !is JsonString) return at
        return when ((raw["type"] as JsonString).value) {
            "text", "reasoning" ->
                if (raw["text"] !is JsonString) "$at.text" else optional(raw, "status", isStatus(partStatuses), at)
            "attachment" ->
                when {
                    raw["name"] !is JsonString -> "$at.name"
                    (raw["kind"] as? JsonString)?.value !in attachmentKinds -> "$at.kind"
                    raw["mediaType"] !is JsonString -> "$at.mediaType"
                    else -> if (isCount(raw["size"])) null else "$at.size"
                }
            "tool-call" ->
                when {
                    (raw["toolCallId"] as? JsonString)?.value != id -> "$at.toolCallId"
                    raw["toolName"] !is JsonString -> "$at.toolName"
                    raw["argsText"] !is JsonString -> "$at.argsText"
                    raw["args"] !is JsonObject -> "$at.args"
                    else ->
                        optional(raw, "isError", isBoolean, at)
                            ?: optional(raw, "status", isStatus(toolCallStatuses), at)
                            ?: raw["approval"]?.let { approval(it, "$at.approval") }
                            ?: raw["messages"]?.let { nested(it, "$at.messages", ::message, deep) }
                }
            else -> null
        }
    }

    private fun message(
        raw: JsonValue?,
        id: String,
        at: String,
        deep: Boolean = true,
    ): String? {
        if (raw !is JsonObject || (raw["id"] as? JsonString)?.value != id) return "$at.id"
        if (!oneOf(roles)(raw["role"])) return "$at.role"
        return optional(raw, "status", isStatus(messageStatuses), at)
            ?: optional(raw, "createdAt", { it is JsonNumber && number(it).isFinite() }, at)
            ?: nested(raw["parts"], "$at.parts", ::part, deep)
    }

    private fun thread(
        raw: JsonValue?,
        id: String,
        at: String,
        deep: Boolean = true,
    ): String? {
        if (raw !is JsonObject || (raw["id"] as? JsonString)?.value != id) return "$at.id"
        if (raw["isRunning"] !is JsonBool) return "$at.isRunning"
        return optional(raw, "session", ::isSession, at)
            ?: optional(raw, "usage", ::isUsage, at)
            ?: optional(raw, "commands", ComposerContract::isSlashCommands, at)
            ?: optional(raw, "fileSearch", ComposerContract::isFileSearch, at)
            ?: optional(raw, "selection", ComposerContract::isSelectionAnswer, at)
            ?: optional(raw, "applied", ComposerContract::isApplyAnswer, at)
            ?: OperationsContract.fault(raw, at)
            ?: HistoryContract.fault(raw, at)
            ?: McpContract.fault(raw, at)
            ?: nested(raw["messages"], "$at.messages", ::message, deep)
            ?: raw["notices"]?.let { nested(it, "$at.notices", ::notice, deep) }
            ?: raw["tasks"]?.let { nested(it, "$at.tasks", ::task, deep) }
    }

    private fun isSession(value: JsonValue?): Boolean =
        value is JsonObject &&
            listOf("model", "permissionMode", "cwd", "version").all { value[it] is JsonString }

    private fun isUsage(value: JsonValue?): Boolean =
        value is JsonObject &&
            value["costUsd"].let { it is JsonNumber && number(it).isFinite() } &&
            OperationsContract.tokenKeys.all { key -> !value.containsKey(key) || isCount(value[key]) }

    private fun isCount(value: JsonValue?): Boolean = isSafeCount(value)

    private fun notice(
        raw: JsonValue?,
        id: String,
        at: String,
    ): String? {
        if (raw !is JsonObject || (raw["id"] as? JsonString)?.value != id) return "$at.id"
        if (!oneOf(noticeKinds)(raw["kind"])) return "$at.kind"
        if (raw["text"] !is JsonString) return "$at.text"
        return optional(raw, "requestId", isString, at)
    }

    private fun task(
        raw: JsonValue?,
        id: String,
        at: String,
    ): String? {
        if (raw !is JsonObject || (raw["id"] as? JsonString)?.value != id) return "$at.id"
        if (raw["background"] !is JsonBool) return "$at.background"
        if (!oneOf(taskStatuses)(raw["status"])) return "$at.status"
        return optional(raw, "toolCallId", isString, at)
            ?: optional(raw, "agentType", isString, at)
            ?: optional(raw, "reason", isString, at)
    }

    // deep: the node and everything under it. Shallow: its own fields, with the collections under it by shape only.
    private fun nested(
        raw: JsonValue?,
        at: String,
        item: (JsonValue?, String, String) -> String?,
        deep: Boolean,
    ): String? =
        when {
            deep -> collection(raw, at, item, true)
            entries(raw) == null -> at
            else -> null
        }

    private enum class Kind { THREAD, MESSAGE, PART, NOTICE, TASK }

    private fun check(
        kind: Kind,
        raw: JsonValue?,
        id: String,
        at: String,
        deep: Boolean,
    ): String? =
        when (kind) {
            Kind.THREAD -> thread(raw, id, at, deep)
            Kind.MESSAGE -> message(raw, id, at, deep)
            Kind.PART -> part(raw, id, at, deep)
            Kind.NOTICE -> notice(raw, id, at)
            Kind.TASK -> task(raw, id, at)
        }

    private fun deepCheck(kind: Kind): (JsonValue?, String, String) -> String? =
        { raw, id, at -> check(kind, raw, id, at, true) }

    /**
     * `checkPatched`: null when the tree the applier left after [ops] passes the webview's check along each op's
     * path — every collection on the way still agrees with its order, every node keeps its own fields, and what
     * the op wrote is checked whole. [ops] are in their wire form and already passed [checkOps].
     */
    fun checkPatched(
        raw: JsonValue,
        ops: List<JsonValue>,
        at: String = "tree",
    ): Issue? {
        if (raw !is JsonObject) return Issue("bad-tree", at)
        for (op in ops) {
            val path = ((op as JsonObject)["path"] as JsonArray).items.map { (it as JsonString).value }
            if (path[0] != "threads") continue
            val fault =
                walkCollection(raw["threads"], path, 1, "$at.threads", Kind.THREAD) ?: atLeastOne(raw["threads"], at)
            if (fault != null) return Issue("bad-tree", fault)
        }
        return null
    }

    // The op went on into this node's fields.
    private fun walkItem(
        raw: JsonValue?,
        id: String,
        path: List<String>,
        index: Int,
        at: String,
        kind: Kind,
    ): String? {
        // The type decides the rest of a part's fields: a new one is checked whole.
        if (path[index] == "type") return check(kind, raw, id, at, true)
        val fault = check(kind, raw, id, at, false)
        if (fault != null || raw !is JsonObject) return fault
        val key = path[index]
        val below =
            when (kind) {
                Kind.THREAD ->
                    when (key) {
                        "messages" -> Kind.MESSAGE
                        "notices" -> Kind.NOTICE
                        "tasks" -> Kind.TASK
                        else -> null
                    }
                Kind.MESSAGE -> Kind.PART.takeIf { key == "parts" }
                Kind.PART -> Kind.MESSAGE.takeIf { key == "messages" && raw["type"] == JsonString("tool-call") }
                Kind.NOTICE, Kind.TASK -> null
            }
        return below?.let { walkCollection(raw[key], path, index + 1, "$at.$key", it) }
    }

    private fun walkCollection(
        raw: JsonValue?,
        path: List<String>,
        index: Int,
        at: String,
        kind: Kind,
    ): String? {
        val key = path.getOrNull(index)
        // The op wrote the collection or its byId: check it whole.
        val wroteAll = index == path.size || (key == "byId" && index + 1 == path.size)
        if (wroteAll) return collection(raw, at, deepCheck(kind), true)
        // It wrote the order: check that order and byId still agree.
        if (key == "order") return collection(raw, at, deepCheck(kind), false)
        if (key != "byId") return if (entries(raw) == null) at else null
        val id = path[index + 1]
        val entity = "$at.byId.$id"
        // It wrote an entity: check the agreement, and the entity whole.
        if (index + 2 == path.size) {
            return collection(raw, at, deepCheck(kind), false)
                ?: check(kind, entries(raw)?.second?.get(id), id, entity, true)
        }
        // It went on into an entity. The applier makes a missing one on the way, so the id must already be in order.
        val (order, byId) = entries(raw) ?: return at
        if (order.items.none { it == JsonString(id) }) return entity
        return walkItem(byId[id], id, path, index + 2, entity, kind)
    }

    private fun atLeastOne(
        threads: JsonValue?,
        at: String,
    ): String? = if (entries(threads)?.first?.items?.isEmpty() == true) "$at.threads.order" else null

    // ---- json ----

    fun number(value: JsonValue?): Double = (value as JsonNumber).text.toDouble()

    private const val MAX_SAFE_INTEGER = 9_007_199_254_740_991.0

    fun isSafeCount(value: JsonValue?): Boolean {
        if (value !is JsonNumber) return false
        val number = number(value)
        return number.isFinite() && number == Math.floor(number) && Math.abs(number) <= MAX_SAFE_INTEGER && number >= 0
    }

    private fun isVersion(value: JsonValue?): Boolean = isSafeCount(value) && number(value) >= 1

    private fun isNonEmptyString(value: JsonValue?): Boolean = value is JsonString && value.value.isNotEmpty()

    private val arrayIndex = Regex("^(0|[1-9][0-9]*)$")
    private const val MAX_ARRAY_INDEX = 4_294_967_294L

    /** The order `Object.keys` gives: integer-like keys (array indices) ascending, then the rest as inserted. */
    fun jsKeyOrder(value: JsonObject): List<String> {
        val (indices, names) =
            value.keys.partition {
                arrayIndex.matches(it) &&
                    (it.toLongOrNull() ?: Long.MAX_VALUE) <= MAX_ARRAY_INDEX
            }
        return indices.sortedBy { it.toLong() } + names
    }

    // ---- stricter than the webview ----

    private val rootKeys = setOf("threads")
    private val collectionKeys = setOf("order", "byId")
    private val threadKeys =
        setOf(
            "id",
            "isRunning",
            "messages",
            "session",
            "usage",
            "notices",
            "tasks",
            "commands",
            "fileSearch",
            "selection",
            "applied",
            "models",
            "switches",
            "context",
            "rewind",
            "compactions",
            "compacting",
            "effort",
            "startPermissionMode",
            "savedSessions",
            "savedSessionsUnreadable",
            "restoredUntil",
            "restoredCount",
            "restoredPartly",
            "mcpServers",
            "mcpServersUnreadable",
            "appliedModel",
        )
    private val sessionKeys = setOf("model", "permissionMode", "cwd", "version")
    private val usageKeys = setOf("costUsd") + OperationsContract.tokenKeys
    private val noticeKeys = setOf("id", "kind", "text", "requestId")
    private val taskKeys = setOf("id", "toolCallId", "agentType", "background", "status", "reason")
    private val suggestionKeys = setOf("id", "kind", "detail", "destination")
    private val questionKeys = setOf("id", "prompt", "multiSelect", "options")
    private val questionOptionKeys = setOf("id", "label", "description")
    private val messageKeys = setOf("id", "role", "status", "createdAt", "parts")
    private val statusKeys = setOf("type", "reason", "error")
    private val textKeys = setOf("type", "text", "status")
    private val attachmentKeys = setOf("type", "name", "kind", "mediaType", "size")
    private val toolCallKeys =
        setOf(
            "type",
            "toolCallId",
            "toolName",
            "argsText",
            "args",
            "result",
            "isError",
            "status",
            "approval",
            "messages",
        )
    private val unknownPartKeys = setOf("type")
    private val approvalKeys =
        setOf(
            "id",
            "display",
            "prompt",
            "options",
            "allowFreeform",
            "dismissible",
            "approved",
            "isAutomatic",
            "optionId",
            "text",
            "reason",
            "resolution",
            "input",
            "suggestions",
            "questions",
            "acceptedSuggestions",
            "updatedInput",
            "failure",
            "failures",
        )
    private val optionKeys = setOf("id", "kind", "label", "description")

    /**
     * Where [tree] — already accepted by [checkTree] — has a key the protocol's table does not name, as an issue with
     * the code `unknown-key`; null when it has none. Leaf values (args, result, a status's error) are the
     * CLI's and are not looked into.
     */
    fun strictFault(
        tree: JsonObject,
        at: String = "tree",
    ): Issue? =
        extra(tree, rootKeys, at)
            ?: collectionFault(tree["threads"] as JsonObject, "$at.threads") { thread, where ->
                extra(thread, threadKeys, where)
                    ?: (thread["session"] as? JsonObject)?.let { extra(it, sessionKeys, "$where.session") }
                    ?: (thread["usage"] as? JsonObject)?.let { extra(it, usageKeys, "$where.usage") }
                    ?: ComposerContract.strictFault(thread, where)
                    ?: OperationsContract.strictFault(thread, where)
                    ?: HistoryContract.strictFault(thread, where)
                    ?: McpContract.strictFault(thread, where)
                    ?: messagesFault(thread["messages"] as JsonObject, "$where.messages")
                    ?: (thread["notices"] as? JsonObject)?.let {
                        collectionFault(it, "$where.notices") { notice, there -> extra(notice, noticeKeys, there) }
                    }
                    ?: (thread["tasks"] as? JsonObject)?.let {
                        collectionFault(it, "$where.tasks") { task, there -> extra(task, taskKeys, there) }
                    }
            }

    private fun messagesFault(
        messages: JsonObject,
        at: String,
    ): Issue? =
        collectionFault(messages, at) { message, where ->
            extra(message, messageKeys, where)
                ?: (message["status"] as? JsonObject)?.let { extra(it, statusKeys, "$where.status") }
                ?: collectionFault(message["parts"] as JsonObject, "$where.parts", ::partFault)
        }

    private fun partFault(
        part: JsonObject,
        at: String,
    ): Issue? {
        val status = (part["status"] as? JsonObject)?.let { extra(it, statusKeys, "$at.status") }
        return when ((part["type"] as JsonString).value) {
            "text", "reasoning" -> extra(part, textKeys, at) ?: status
            "attachment" -> extra(part, attachmentKeys, at)
            "tool-call" ->
                extra(part, toolCallKeys, at)
                    ?: status
                    ?: (part["approval"] as? JsonObject)?.let { approvalFault(it, "$at.approval") }
                    ?: (part["messages"] as? JsonObject)?.let { messagesFault(it, "$at.messages") }
            else -> extra(part, unknownPartKeys, at)
        }
    }

    private fun approvalFault(
        approval: JsonObject,
        at: String,
    ): Issue? =
        extra(approval, approvalKeys, at)
            ?: (approval["options"] as? JsonArray)?.items?.withIndex()?.firstNotNullOfOrNull { (index, option) ->
                extra(option as JsonObject, optionKeys, "$at.options[$index]")
            }
            ?: (approval["suggestions"] as? JsonArray)?.items?.withIndex()?.firstNotNullOfOrNull { (index, item) ->
                extra(item as JsonObject, suggestionKeys, "$at.suggestions[$index]")
            }
            ?: (approval["questions"] as? JsonArray)?.items?.withIndex()?.firstNotNullOfOrNull { (index, item) ->
                val question = item as JsonObject
                extra(question, questionKeys, "$at.questions[$index]")
                    ?: (question["options"] as JsonArray).items.withIndex().firstNotNullOfOrNull { (position, option) ->
                        extra(option as JsonObject, questionOptionKeys, "$at.questions[$index].options[$position]")
                    }
            }

    private fun collectionFault(
        collection: JsonObject,
        at: String,
        item: (JsonObject, String) -> Issue?,
    ): Issue? {
        extra(collection, collectionKeys, at)?.let { return it }
        val byId = collection["byId"] as JsonObject
        return byId.keys.firstNotNullOfOrNull { key -> item(byId[key] as JsonObject, "$at.byId.$key") }
    }

    private fun extra(
        node: JsonObject,
        allowed: Set<String>,
        at: String,
    ): Issue? = node.keys.firstOrNull { it !in allowed }?.let { Issue("unknown-key", "$at.$it") }

    /**
     * Where [tree] has an array that is not a collection's `order` of strings, outside the leaf values the CLI
     * provides (args, result, a status's error), an approval's options and the lists replaced whole; null when it
     * has none. A position in any other array would be what an op addresses, which the protocol forbids.
     */
    fun entityArrayFault(
        value: JsonValue,
        at: String = "tree",
    ): String? =
        when (value) {
            is JsonArray -> at
            is JsonObject ->
                value.entries.firstNotNullOfOrNull { (key, child) ->
                    when {
                        key in leafKeys -> null
                        key == "order" && child is JsonArray -> orderFault(child, at)
                        else -> entityArrayFault(child, "$at.$key")
                    }
                }
            else -> null
        }

    private val leafKeys =
        setOf(
            "args",
            "result",
            "error",
            "options",
            "input",
            "suggestions",
            "questions",
            "acceptedSuggestions",
            "updatedInput",
            // The slash commands and a file search's paths are replaced whole, never addressed by position.
            "commands",
            "paths",
            // The models, the switches and the compactions are replaced whole as well.
            "models",
            "switches",
            "compactions",
            // The saved sessions are replaced whole as well.
            "savedSessions",
            // And so are the MCP servers.
            "mcpServers",
            // The paths a dry run of a rewind said would change are replaced whole with the rest of its answer.
            "files",
        )

    private fun orderFault(
        order: JsonArray,
        at: String,
    ): String? = if (order.items.all { it is JsonString }) null else "$at.order"
}
