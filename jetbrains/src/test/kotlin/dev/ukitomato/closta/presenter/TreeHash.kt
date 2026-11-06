package dev.ukitomato.closta.presenter

import dev.ukitomato.closta.presenter.tree.JsonArray
import dev.ukitomato.closta.presenter.tree.JsonBool
import dev.ukitomato.closta.presenter.tree.JsonNull
import dev.ukitomato.closta.presenter.tree.JsonNumber
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonString
import dev.ukitomato.closta.presenter.tree.JsonText
import dev.ukitomato.closta.presenter.tree.JsonValue
import java.math.BigDecimal
import java.math.MathContext
import java.math.RoundingMode
import kotlin.math.abs

/**
 * A short name for a tree's value that the webview computes the same way (in its replay test):
 * the length and the 32-bit FNV-1a hash, over UTF-16 code units, of its canonical text — compact JSON with every
 * object's keys sorted, strings as `JSON.stringify` writes them, and numbers as JavaScript prints the double it reads.
 *
 * Keys are sorted because JSON objects compare without their order and the applier puts a key it adds at the end, so
 * the tree the webview holds can list an object's keys in another order than the projected one. The hash only has to
 * tell a tree from the trees a defect would leave in its place; it is no defence against a crafted one.
 */
object TreeHash {
    private const val FNV_OFFSET = 0x811c9dc5.toInt()
    private const val FNV_PRIME = 0x01000193
    private const val HEX = 16
    private const val HEX_DIGITS = 8
    private const val PLAIN_LIMIT = 21
    private const val SMALL_LIMIT = -6

    // A double never needs more significant digits than this to read back as itself.
    private const val MAX_DIGITS = 17

    fun of(value: JsonValue): String {
        val text = canonical(value)
        var hash = FNV_OFFSET
        for (char in text) hash = (hash xor char.code) * FNV_PRIME
        return "${text.length}:${Integer.toUnsignedString(hash, HEX).padStart(HEX_DIGITS, '0')}"
    }

    fun canonical(value: JsonValue): String = buildString { write(this, value) }

    private fun write(
        out: StringBuilder,
        value: JsonValue,
    ) {
        when (value) {
            is JsonObject -> {
                out.append('{')
                value.keys.sorted().forEachIndexed { index, key ->
                    if (index > 0) out.append(',')
                    out.append(JsonText.compact(JsonString(key))).append(':')
                    write(out, value[key]!!)
                }
                out.append('}')
            }
            is JsonArray -> {
                out.append('[')
                value.items.forEachIndexed { index, item ->
                    if (index > 0) out.append(',')
                    write(out, item)
                }
                out.append(']')
            }
            is JsonString -> out.append(JsonText.compact(value))
            is JsonNumber -> out.append(jsNumber(value.text))
            is JsonBool -> out.append(value.value)
            JsonNull -> out.append("null")
        }
    }

    /**
     * How JavaScript prints the double [text] reads as (ECMA-262 Number::toString): the fewest significant digits
     * that read back as the same double, and of those the closest to it, in plain notation from 1e-6 up to 1e21, in
     * exponent notation outside it. `Double.toString` is not that: for a subnormal it may give two digits where one
     * reads back (`4.9E-324` for JavaScript's `5e-324`).
     */
    fun jsNumber(text: String): String {
        val number = text.toDouble()
        if (number == 0.0) return "0"
        val shortest = shortestDigits(abs(number))
        val digits = shortest.unscaledValue().toString()
        val k = digits.length
        // The value is 0.<digits> × 10^n.
        val n = k - shortest.scale()
        val body =
            when {
                n in k..PLAIN_LIMIT -> digits + "0".repeat(n - k)
                n in 1..PLAIN_LIMIT -> digits.substring(0, n) + "." + digits.substring(n)
                n in (SMALL_LIMIT + 1)..0 -> "0." + "0".repeat(-n) + digits
                else -> {
                    val exponent = n - 1
                    val sign = if (exponent > 0) "+" else "-"
                    val mantissa = if (k == 1) digits else digits[0] + "." + digits.substring(1)
                    "${mantissa}e$sign${abs(exponent)}"
                }
            }
        return if (number < 0) "-$body" else body
    }

    // For 1, 2, … significant digits, the two numbers of that length either side of the exact value: the first length
    // with one that reads back as [value] is the shortest, and of the two the nearer (the rounding) wins. The numbers
    // that read back as [value] are one interval, so when the nearer one falls outside it only the other can be inside:
    // at a power of two the doubles below are twice as close as those above, and the far side can read back alone.
    private fun shortestDigits(value: Double): BigDecimal {
        val exact = BigDecimal(value)
        val shortest =
            (1..MAX_DIGITS).firstNotNullOfOrNull { digits ->
                val nearer = exact.round(MathContext(digits, RoundingMode.HALF_EVEN))
                val away = if (nearer > exact) RoundingMode.FLOOR else RoundingMode.CEILING
                sequenceOf(nearer, exact.round(MathContext(digits, away))).firstOrNull { it.toDouble() == value }
            }
        return (shortest ?: exact.round(MathContext(MAX_DIGITS, RoundingMode.HALF_EVEN))).stripTrailingZeros()
    }
}
