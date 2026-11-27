package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.presenter.tree.JsonArray
import dev.ukitomato.closta.presenter.tree.JsonBool
import dev.ukitomato.closta.presenter.tree.JsonNumber
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonString
import dev.ukitomato.closta.presenter.tree.JsonValue

/** One thing an MCP server's form asks for, read from its schema. [title] is the key when the schema gives none. */
sealed interface ElicitationField {
    val key: String
    val title: String
    val description: String?
    val required: Boolean

    /** A line of text, held to [format] and to the length bounds when the schema gives them. */
    data class Text(
        override val key: String,
        override val title: String,
        override val description: String?,
        override val required: Boolean,
        val format: TextFormat?,
        val minLength: Int?,
        val maxLength: Int?,
        val default: String?,
    ) : ElicitationField

    /** One of [options], or several of them when [multi]. */
    data class Choice(
        override val key: String,
        override val title: String,
        override val description: String?,
        override val required: Boolean,
        val options: List<ChoiceOption>,
        val multi: Boolean,
        val default: List<String>,
    ) : ElicitationField

    data class Number(
        override val key: String,
        override val title: String,
        override val description: String?,
        override val required: Boolean,
        val integer: Boolean,
        val minimum: Double?,
        val maximum: Double?,
        val default: Double?,
    ) : ElicitationField

    data class Toggle(
        override val key: String,
        override val title: String,
        override val description: String?,
        override val required: Boolean,
        val default: Boolean?,
    ) : ElicitationField
}

enum class TextFormat { EMAIL, URI, DATE, DATE_TIME }

/** An option of a choice: the [value] the answer sends and the [label] the user reads. */
data class ChoiceOption(
    val value: String,
    val label: String,
)

private val FORMATS =
    mapOf(
        "email" to TextFormat.EMAIL,
        "uri" to TextFormat.URI,
        "date" to TextFormat.DATE,
        "date-time" to TextFormat.DATE_TIME,
    )

// A schema keyword that gives a property more than one shape, or none of the shapes read here.
private val ALTERNATIVES = listOf("oneOf", "anyOf", "allOf")

/**
 * The fields the schema [schema] (the request's `requested_schema`) asks for, in [order] (the server's
 * `property_order`) and then the schema's own. An empty list when there is no schema or it has no properties; null when
 * the form is one Closta cannot fill in: a nested object, an array that is not a list of strings to choose from,
 * `oneOf`/`anyOf`, or a type this reads no further. The user then answers in the server's own terms or declines.
 */
@Suppress("ReturnCount") // a form Closta cannot fill in is null wherever it is found
fun elicitationFields(
    schema: JsonValue?,
    order: List<String>?,
): List<ElicitationField>? {
    if (schema == null) return emptyList()
    val root = schema as? JsonObject ?: return null
    val properties = root["properties"] ?: return emptyList()
    val members = (properties as? JsonObject)?.entries ?: return null
    val required =
        root
            .array("required")
            ?.items
            .orEmpty()
            .mapNotNull { (it as? JsonString)?.value }
            .toSet()
    val fields =
        members.map { (key, shape) ->
            val property = shape as? JsonObject ?: return null
            fieldOf(key, property, key in required) ?: return null
        }
    val rank = order.orEmpty().withIndex().associate { (index, key) -> key to index }
    return fields.sortedBy { rank[it.key] ?: Int.MAX_VALUE }
}

private fun fieldOf(
    key: String,
    property: JsonObject,
    required: Boolean,
): ElicitationField? {
    if (ALTERNATIVES.any(property::containsKey)) return null
    val title = property.string("title")?.takeIf { it.isNotBlank() } ?: key
    val description = property.string("description")
    return when (property.string("type")) {
        "string" -> stringField(key, title, description, required, property)
        "number", "integer" -> numberField(key, title, description, required, property)
        "boolean" ->
            ElicitationField.Toggle(key, title, description, required, (property["default"] as? JsonBool)?.value)
        "array" -> multiField(key, title, description, required, property)
        else -> null
    }
}

private fun stringField(
    key: String,
    title: String,
    description: String?,
    required: Boolean,
    property: JsonObject,
): ElicitationField? {
    val choices = property["enum"]
    val default = property.string("default")
    return if (choices == null) {
        ElicitationField.Text(
            key,
            title,
            description,
            required,
            format = property.string("format")?.let(FORMATS::get),
            minLength = property.index("minLength"),
            maxLength = property.index("maxLength"),
            default = default,
        )
    } else {
        optionsOf(choices, property.array("enumNames"))?.let {
            ElicitationField.Choice(
                key,
                title,
                description,
                required,
                it,
                multi = false,
                default = listOfNotNull(default),
            )
        }
    }
}

private fun numberField(
    key: String,
    title: String,
    description: String?,
    required: Boolean,
    property: JsonObject,
): ElicitationField =
    ElicitationField.Number(
        key,
        title,
        description,
        required,
        integer = property.string("type") == "integer",
        minimum = property.double("minimum"),
        maximum = property.double("maximum"),
        default = property.double("default"),
    )

private fun multiField(
    key: String,
    title: String,
    description: String?,
    required: Boolean,
    property: JsonObject,
): ElicitationField? {
    val items = property.obj("items")
    val options = items?.let { optionsOf(it["enum"], it.array("enumNames")) } ?: return null
    val default =
        property
            .array("default")
            ?.items
            .orEmpty()
            .mapNotNull { (it as? JsonString)?.value }
    return ElicitationField.Choice(key, title, description, required, options, multi = true, default = default)
}

// The values of an `enum` and their labels; null when it is not a list of strings, so the field cannot be read.
private fun optionsOf(
    values: JsonValue?,
    names: JsonArray?,
): List<ChoiceOption>? {
    val words =
        (values as? JsonArray)
            ?.items
            ?.map { (it as? JsonString)?.value }
            ?.takeIf { list -> list.all { it != null } }
            ?.filterNotNull() ?: return null
    return words.mapIndexed { index, value ->
        ChoiceOption(value, (names?.items?.getOrNull(index) as? JsonString)?.value ?: value)
    }
}

private fun JsonObject.double(key: String): Double? = (this[key] as? JsonNumber)?.text?.toDoubleOrNull()
