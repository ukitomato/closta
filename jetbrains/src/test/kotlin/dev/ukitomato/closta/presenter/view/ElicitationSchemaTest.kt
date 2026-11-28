package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.presenter.tree.JsonRead
import dev.ukitomato.closta.presenter.tree.JsonValue
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

/** The fields an MCP server's schema asks for; the schemas here are made up from the types, no capture has one. */
class ElicitationSchemaTest {
    private fun json(text: String): JsonValue = checkNotNull(JsonRead.parse(text))

    private val askForm =
        json(
            """{"type":"object","properties":{
              "name":{"type":"string","title":"Name","minLength":1},
              "color":{"type":"string","enum":["red","blue"],"enumNames":["Red","Blue"]},
              "count":{"type":"integer","minimum":1,"maximum":5},
              "agree":{"type":"boolean"}},
              "required":["name"]}""",
        )

    @Test
    fun `type only - the form schema gives one field of each kind, in the schema's order`() {
        val fields = checkNotNull(elicitationFields(askForm, null))
        assertEquals(
            listOf(
                ElicitationField.Text(
                    key = "name",
                    title = "Name",
                    description = null,
                    required = true,
                    format = null,
                    minLength = 1,
                    maxLength = null,
                    default = null,
                ),
                ElicitationField.Choice(
                    key = "color",
                    title = "color",
                    description = null,
                    required = false,
                    options = listOf(ChoiceOption("red", "Red"), ChoiceOption("blue", "Blue")),
                    multi = false,
                    default = emptyList(),
                ),
                ElicitationField.Number(
                    key = "count",
                    title = "count",
                    description = null,
                    required = false,
                    integer = true,
                    minimum = 1.0,
                    maximum = 5.0,
                    default = null,
                ),
                ElicitationField.Toggle(
                    key = "agree",
                    title = "agree",
                    description = null,
                    required = false,
                    default = null,
                ),
            ),
            fields,
        )
    }

    @Test
    fun `type only - the property order the server gave comes before the schema's own`() {
        val fields = checkNotNull(elicitationFields(askForm, listOf("agree", "name", "count", "color")))
        assertEquals(listOf("agree", "name", "count", "color"), fields.map { it.key })
        val partly = checkNotNull(elicitationFields(askForm, listOf("count")))
        assertEquals(listOf("count", "name", "color", "agree"), partly.map { it.key })
    }

    @Test
    fun `type only - a multiple choice, a format, a length and the defaults are read`() {
        val schema =
            json(
                """{"type":"object","properties":{
                  "tags":{"type":"array","items":{"type":"string","enum":["a","b","c"]},"default":["b"],
                          "description":"Pick some"},
                  "mail":{"type":"string","format":"email","maxLength":40,"default":"x@y.z"},
                  "when":{"type":"string","format":"date-time"},
                  "ratio":{"type":"number","default":0.5},
                  "ok":{"type":"boolean","default":true}}}""",
            )
        val fields = checkNotNull(elicitationFields(schema, null)).associateBy { it.key }
        val tags = fields.getValue("tags") as ElicitationField.Choice
        assertEquals(true, tags.multi)
        assertEquals(listOf(ChoiceOption("a", "a"), ChoiceOption("b", "b"), ChoiceOption("c", "c")), tags.options)
        assertEquals(listOf("b"), tags.default)
        assertEquals("Pick some", tags.description)
        val mail = fields.getValue("mail") as ElicitationField.Text
        assertEquals(TextFormat.EMAIL, mail.format)
        assertEquals(40, mail.maxLength)
        assertEquals("x@y.z", mail.default)
        assertEquals(TextFormat.DATE_TIME, (fields.getValue("when") as ElicitationField.Text).format)
        val ratio = fields.getValue("ratio") as ElicitationField.Number
        assertEquals(false, ratio.integer)
        assertEquals(0.5, ratio.default)
        assertEquals(true, (fields.getValue("ok") as ElicitationField.Toggle).default)
    }

    @Test
    fun `type only - a nested object makes the form one Closta cannot fill in`() {
        val nested = json("""{"type":"object","properties":{"a":{"type":"object","properties":{}}}}""")
        assertNull(elicitationFields(nested, null))
    }

    @Test
    fun `type only - oneOf, an array with no enum and an unknown type are not read either`() {
        val oneOf = json("""{"type":"object","properties":{"a":{"oneOf":[{"const":"x","title":"X"}]}}}""")
        val anyOf = json("""{"type":"object","properties":{"a":{"anyOf":[{"type":"string"}]}}}""")
        val loose = json("""{"type":"object","properties":{"a":{"type":"array","items":{"type":"string"}}}}""")
        val unknown = json("""{"type":"object","properties":{"a":{"type":"mystery"}}}""")
        listOf(oneOf, anyOf, loose, unknown).forEach { assertNull(elicitationFields(it, null)) }
    }

    @Test
    fun `type only - no schema, or one without properties, asks for no fields`() {
        assertEquals(emptyList<ElicitationField>(), elicitationFields(null, null))
        assertEquals(emptyList<ElicitationField>(), elicitationFields(json("""{"type":"object"}"""), null))
    }
}
