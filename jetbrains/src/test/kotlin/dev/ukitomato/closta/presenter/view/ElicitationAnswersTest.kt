package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.presenter.tree.JsonRead
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

/** What a form's values are checked against, and the JSON they become; made up from the types. */
class ElicitationAnswersTest {
    private val fields: List<ElicitationField> =
        checkNotNull(
            elicitationFields(
                JsonRead.parse(
                    """{"type":"object","properties":{
                      "name":{"type":"string","minLength":1,"maxLength":5},
                      "color":{"type":"string","enum":["red","blue"],"enumNames":["Red","Blue"]},
                      "count":{"type":"integer","minimum":1,"maximum":5},
                      "ratio":{"type":"number","minimum":0.5},
                      "mail":{"type":"string","format":"email"},
                      "site":{"type":"string","format":"uri"},
                      "day":{"type":"string","format":"date"},
                      "at":{"type":"string","format":"date-time"},
                      "agree":{"type":"boolean"}},
                      "required":["name"]}""",
                ),
                null,
            ),
        )

    private fun text(value: String) = ElicitationValue.Text(value)

    private fun problems(vararg values: Pair<String, ElicitationValue>) = elicitationProblems(fields, values.toMap())

    @Test
    fun `type only - a required field left empty is a problem, an optional one is not`() {
        assertEquals(mapOf("name" to ElicitationProblem.REQUIRED), problems())
        assertEquals(mapOf("name" to ElicitationProblem.REQUIRED), problems("name" to text("")))
        assertEquals(emptyMap<String, ElicitationProblem>(), problems("name" to text("Ada")))
    }

    @Test
    fun `type only - the length of a text is held to its bounds`() {
        assertEquals(
            mapOf("name" to ElicitationProblem.TOO_LONG),
            problems("name" to text("Ada Lovelace")),
        )
        val short =
            checkNotNull(
                elicitationFields(
                    JsonRead.parse("""{"type":"object","properties":{"p":{"type":"string","minLength":3}}}"""),
                    null,
                ),
            )
        assertEquals(
            mapOf("p" to ElicitationProblem.TOO_SHORT),
            elicitationProblems(short, mapOf("p" to text("ab"))),
        )
    }

    @Test
    fun `type only - a number must be a number, a whole one when it is an integer, within its range`() {
        val ok = "name" to text("Ada")
        assertEquals(mapOf("count" to ElicitationProblem.ABOVE_MAXIMUM), problems(ok, "count" to text("7")))
        assertEquals(mapOf("count" to ElicitationProblem.BELOW_MINIMUM), problems(ok, "count" to text("0")))
        assertEquals(mapOf("count" to ElicitationProblem.NOT_AN_INTEGER), problems(ok, "count" to text("2.5")))
        assertEquals(mapOf("count" to ElicitationProblem.NOT_A_NUMBER), problems(ok, "count" to text("two")))
        assertEquals(mapOf("count" to ElicitationProblem.NOT_A_NUMBER), problems(ok, "count" to text("NaN")))
        assertEquals(emptyMap<String, ElicitationProblem>(), problems(ok, "count" to text("5")))
        assertEquals(mapOf("ratio" to ElicitationProblem.BELOW_MINIMUM), problems(ok, "ratio" to text("0.25")))
        assertEquals(emptyMap<String, ElicitationProblem>(), problems(ok, "ratio" to text("0.75")))
    }

    @Test
    fun `type only - the format of a text is checked`() {
        val ok = "name" to text("Ada")
        assertEquals(mapOf("mail" to ElicitationProblem.NOT_EMAIL), problems(ok, "mail" to text("x")))
        assertEquals(emptyMap<String, ElicitationProblem>(), problems(ok, "mail" to text("a@b.example")))
        assertEquals(mapOf("site" to ElicitationProblem.NOT_URI), problems(ok, "site" to text("not a uri")))
        assertEquals(emptyMap<String, ElicitationProblem>(), problems(ok, "site" to text("https://a.example/x")))
        assertEquals(mapOf("day" to ElicitationProblem.NOT_DATE), problems(ok, "day" to text("2026-13-40")))
        assertEquals(emptyMap<String, ElicitationProblem>(), problems(ok, "day" to text("2026-11-28")))
        assertEquals(mapOf("at" to ElicitationProblem.NOT_DATE_TIME), problems(ok, "at" to text("tomorrow")))
        assertEquals(emptyMap<String, ElicitationProblem>(), problems(ok, "at" to text("2026-11-28T09:30:00+09:00")))
    }

    @Test
    fun `type only - the content is compact JSON with numbers as numbers and empty optional fields left out`() {
        val content =
            elicitationContent(
                fields,
                mapOf(
                    "name" to text("Ada"),
                    "color" to ElicitationValue.Choices(listOf("blue")),
                    "count" to text("2"),
                    "ratio" to text(""),
                    "mail" to text(""),
                    "agree" to ElicitationValue.Flag(true),
                ),
            )
        assertEquals("""{"name":"Ada","color":"blue","count":2,"agree":true}""", content)
    }

    @Test
    fun `type only - a multiple choice is an array, and a decimal keeps its fraction`() {
        val schema =
            checkNotNull(
                elicitationFields(
                    JsonRead.parse(
                        """{"type":"object","properties":{
                          "tags":{"type":"array","items":{"type":"string","enum":["a","b"]}},
                          "ratio":{"type":"number"}}}""",
                    ),
                    null,
                ),
            )
        val content =
            elicitationContent(
                schema,
                mapOf("tags" to ElicitationValue.Choices(listOf("a", "b")), "ratio" to text("2.50")),
            )
        assertEquals("""{"tags":["a","b"],"ratio":2.5}""", content)
    }

    @Test
    fun `an address opens only when it is http or https and has a host`() {
        assertNull(openableUrl("javascript:alert(1)"))
        assertNull(openableUrl("file:///etc/passwd"))
        assertNull(openableUrl("https:///nohost"))
        assertNull(openableUrl("not a url"))
        assertNull(openableUrl(null))
        assertEquals("https://example.com/x", openableUrl("https://example.com/x"))
        assertEquals("http://localhost:8080/a?b=1", openableUrl("http://localhost:8080/a?b=1"))
    }

    @Test
    fun `the host shown is the one the address goes to, whatever comes before it`() {
        assertEquals("example.com", urlHostOf("https://example.com/auth?code=1"))
        assertEquals("evil.example", urlHostOf("https://example.com@evil.example:8443/x"))
        assertEquals("[::1]", urlHostOf("http://[::1]:8080/"))
        assertNull(urlHostOf("ftp://example.com"))
    }
}
