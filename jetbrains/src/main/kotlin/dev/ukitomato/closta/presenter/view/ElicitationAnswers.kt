@file:Suppress("TooManyFunctions") // one reading and one writing per kind of field

package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.presenter.tree.JsonArray
import dev.ukitomato.closta.presenter.tree.JsonBool
import dev.ukitomato.closta.presenter.tree.JsonNumber
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonString
import dev.ukitomato.closta.presenter.tree.JsonText
import dev.ukitomato.closta.presenter.tree.JsonValue
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.format.DateTimeParseException
import kotlin.math.abs
import kotlin.math.floor

/** What the user put in one field. A number is held as the text typed, and checked when the answer is made. */
sealed interface ElicitationValue {
    data class Text(
        val text: String,
    ) : ElicitationValue

    data class Choices(
        val values: List<String>,
    ) : ElicitationValue

    data class Flag(
        val on: Boolean,
    ) : ElicitationValue
}

/** Why a field's value cannot go; the screen words it. */
enum class ElicitationProblem {
    REQUIRED,
    TOO_SHORT,
    TOO_LONG,
    NOT_A_NUMBER,
    NOT_AN_INTEGER,
    BELOW_MINIMUM,
    ABOVE_MAXIMUM,
    NOT_EMAIL,
    NOT_URI,
    NOT_DATE,
    NOT_DATE_TIME,
}

private val EMAIL = Regex("""[^@\s]+@[^@\s]+\.[^@\s]+""")
private val URI_SHAPE = Regex("""[A-Za-z][A-Za-z0-9+.-]*:\S+""")

/** The fields whose [values] cannot go as they are, each with its first problem. Nothing is kept of the result. */
fun elicitationProblems(
    fields: List<ElicitationField>,
    values: Map<String, ElicitationValue>,
): Map<String, ElicitationProblem> =
    buildMap {
        fields.forEach { field -> problemOf(field, values[field.key])?.let { put(field.key, it) } }
    }

private fun problemOf(
    field: ElicitationField,
    value: ElicitationValue?,
): ElicitationProblem? =
    when (field) {
        is ElicitationField.Text -> textProblem(field, (value as? ElicitationValue.Text)?.text.orEmpty())
        is ElicitationField.Number -> numberProblem(field, (value as? ElicitationValue.Text)?.text.orEmpty())
        is ElicitationField.Choice ->
            ElicitationProblem.REQUIRED.takeIf {
                field.required && (value as? ElicitationValue.Choices)?.values.isNullOrEmpty()
            }
        is ElicitationField.Toggle -> null
    }

private fun textProblem(
    field: ElicitationField.Text,
    text: String,
): ElicitationProblem? =
    when {
        text.isEmpty() -> ElicitationProblem.REQUIRED.takeIf { field.required }
        field.minLength != null && text.length < field.minLength -> ElicitationProblem.TOO_SHORT
        field.maxLength != null && text.length > field.maxLength -> ElicitationProblem.TOO_LONG
        else -> formatProblem(field.format, text)
    }

private fun formatProblem(
    format: TextFormat?,
    text: String,
): ElicitationProblem? =
    when (format) {
        TextFormat.EMAIL -> ElicitationProblem.NOT_EMAIL.takeUnless { EMAIL.matches(text) }
        TextFormat.URI -> ElicitationProblem.NOT_URI.takeUnless { URI_SHAPE.matches(text) }
        TextFormat.DATE -> ElicitationProblem.NOT_DATE.takeIf { parses { LocalDate.parse(text) } == null }
        TextFormat.DATE_TIME ->
            ElicitationProblem.NOT_DATE_TIME.takeIf {
                parses {
                    OffsetDateTime.parse(
                        text,
                    )
                } == null
            }
        null -> null
    }

private fun parses(parse: () -> Any): Any? =
    try {
        parse()
    } catch (_: DateTimeParseException) {
        null
    }

private fun numberProblem(
    field: ElicitationField.Number,
    text: String,
): ElicitationProblem? {
    val number = decimal(text)
    return when {
        text.isBlank() -> ElicitationProblem.REQUIRED.takeIf { field.required }
        number == null -> ElicitationProblem.NOT_A_NUMBER
        field.integer && number != floor(number) -> ElicitationProblem.NOT_AN_INTEGER
        field.integer && number > SAFE_INTEGER -> ElicitationProblem.ABOVE_MAXIMUM
        field.integer && number < -SAFE_INTEGER -> ElicitationProblem.BELOW_MINIMUM
        field.minimum != null && number < field.minimum -> ElicitationProblem.BELOW_MINIMUM
        field.maximum != null && number > field.maximum -> ElicitationProblem.ABOVE_MAXIMUM
        else -> null
    }
}

// The largest whole number a double (and so a JSON reader) holds exactly; an integer field takes none beyond it.
private const val SAFE_INTEGER = 9_007_199_254_740_991.0

// A finite number; "NaN" and "Infinity" are numbers to the parser and not to JSON.
private fun decimal(text: String): Double? = text.trim().toDoubleOrNull()?.takeIf { it.isFinite() }

/**
 * The `content` of an accept: the fields' [values] as one compact JSON object, in the fields' order. A number is
 * written as a number, and a field left empty and not required is left out. The values should have passed
 * [elicitationProblems]; one that cannot be written (an empty required field, a number that is not one) is left out.
 */
fun elicitationContent(
    fields: List<ElicitationField>,
    values: Map<String, ElicitationValue>,
): String {
    val content = JsonObject.Builder()
    fields.forEach { field -> valueOf(field, values[field.key])?.let { content.put(field.key, it) } }
    return JsonText.compact(content.build())
}

private fun valueOf(
    field: ElicitationField,
    value: ElicitationValue?,
): JsonValue? =
    when (field) {
        is ElicitationField.Text ->
            (value as? ElicitationValue.Text)?.text?.takeIf { it.isNotEmpty() }?.let(
                ::JsonString,
            )
        is ElicitationField.Number -> (value as? ElicitationValue.Text)?.text?.let { numberOf(field, it) }
        is ElicitationField.Choice -> choicesOf(field, (value as? ElicitationValue.Choices)?.values.orEmpty())
        is ElicitationField.Toggle ->
            JsonBool.of((value as? ElicitationValue.Flag)?.on ?: field.default ?: false)
    }

private fun numberOf(
    field: ElicitationField.Number,
    text: String,
): JsonNumber? {
    val number = decimal(text) ?: return null
    val whole = number == floor(number) && abs(number) < WHOLE_LIMIT
    return JsonNumber(if (field.integer || whole) number.toLong().toString() else number.toString())
}

// Below this a whole double is exact as a long.
private const val WHOLE_LIMIT = 1e15

private fun choicesOf(
    field: ElicitationField.Choice,
    chosen: List<String>,
): JsonValue? =
    when {
        chosen.isEmpty() -> null
        field.multi -> JsonArray(chosen.map(::JsonString))
        else -> JsonString(chosen.first())
    }

// An `http` or `https` address: an optional user, a host (a name, or an IPv6 address in brackets), a port, the rest.
private val WEB_ADDRESS =
    Regex("""(?i)https?://(?:[^/?#@\s]*@)?(\[[0-9a-f:.]+]|[^/?#:@\s\[\]]+)(?::\d*)?(?:[/?#]\S*)?""")

/** [url] as it is when it is an `http` or `https` address with a host, else null: nothing else is offered to open. */
fun openableUrl(url: String?): String? = url?.takeIf { WEB_ADDRESS.matches(it) && it.none(::unsafe) }

// A browser reads a backslash as a slash, so the address would go to another host than the one shown; a control
// character is no part of an address.
private fun unsafe(char: Char): Boolean = char == '\\' || char.isISOControl()

/** The host of [url] when it is [openableUrl]; what the card shows in bold, so the user sees where the link goes. */
fun urlHostOf(url: String?): String? = openableUrl(url)?.let { WEB_ADDRESS.matchEntire(it)?.groupValues?.get(1) }
