package dev.ukitomato.closta.presenter

import dev.ukitomato.closta.presenter.tree.JsonArray
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonString
import dev.ukitomato.closta.presenter.tree.JsonValue

// Reading protocol trees in tests: plain paths through objects and collections, nothing of the presenter's own.

fun JsonValue?.at(vararg path: String): JsonObject =
    path.fold(this) { node, key -> (node as JsonObject)[key] } as JsonObject

fun JsonObject.str(key: String): String? = (this[key] as? JsonString)?.value

/** The entries of the collection under [key], in order. */
fun JsonObject.entries(key: String): List<JsonObject> {
    val collection = at(key)
    val byId = collection.at("byId")
    return (collection["order"] as JsonArray).items.map { byId.at((it as JsonString).value) }
}

fun JsonObject.keysOf(key: String): List<String> =
    (at(key)["order"] as JsonArray).items.map {
        (it as JsonString).value
    }

fun JsonObject.messages(): List<JsonObject> = entries("messages")

fun JsonObject.parts(): List<JsonObject> = entries("parts")

fun JsonObject.message(key: String): JsonObject = at("messages", "byId", key)

fun JsonObject.part(key: String): JsonObject = at("parts", "byId", key)

/** The status as `type` or `type/reason`. */
fun JsonObject.status(): String? {
    val status = this["status"] as? JsonObject ?: return null
    return listOfNotNull(status.str("type"), status.str("reason")).joinToString("/")
}

/** Every tool-call part anywhere under [node], by its key. */
fun toolCalls(node: JsonValue): Map<String, JsonObject> {
    val found = LinkedHashMap<String, JsonObject>()

    fun walk(value: JsonValue) {
        when (value) {
            is JsonObject -> {
                if (value.str("type") == "tool-call") found[value.str("toolCallId")!!] = value
                value.entries.forEach { (key, child) -> if (key != "args" && key != "result") walk(child) }
            }
            is JsonArray -> value.items.forEach(::walk)
            else -> Unit
        }
    }
    walk(node)
    return found
}
