package dev.ukitomato.closta.presenter

import dev.ukitomato.closta.presenter.tree.JsonRead
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Test

/**
 * [TreeHash] gives what the webview's replay test gives for the same value. The expected texts are what Node 24
 * prints for `JSON.stringify` of these numbers and strings, and the hashes what the TypeScript copy computes.
 */
class TreeHashTest {
    @Test
    fun `numbers print as JavaScript prints the double they read as`() {
        val cases =
            listOf(
                "0" to "0",
                "-0" to "0",
                "60000" to "60000",
                "1.0" to "1",
                "1e3" to "1000",
                "1.50" to "1.5",
                "0.1" to "0.1",
                "-2.5" to "-2.5",
                "0.000001" to "0.000001",
                "1e-7" to "1e-7",
                "1.5e-7" to "1.5e-7",
                "123456789012345678901" to "123456789012345680000",
                "1e21" to "1e+21",
                "1.25e22" to "1.25e+22",
                "9007199254740993" to "9007199254740992",
                "0.30000000000000004" to "0.30000000000000004",
                // Subnormals, where Double.toString gives a digit more than JavaScript needs.
                "5e-324" to "5e-324",
                "4.9e-324" to "5e-324",
                "1e-323" to "1e-323",
                "2.2250738585072014e-308" to "2.2250738585072014e-308",
                "1.7976931348623157e308" to "1.7976931348623157e+308",
                // Powers of two, where the nearest number of a length can miss and the one on the other side read back.
                "5.960464477539063e-8" to "5.960464477539063e-8",
                "6.189700196426902e26" to "6.189700196426902e+26",
                "5.684341886080802e-14" to "5.684341886080802e-14",
                "6.617444900424222e-24" to "6.617444900424222e-24",
                "5.316911983139664e36" to "5.316911983139664e+36",
                "123.456" to "123.456",
                "100" to "100",
                "0.1e1" to "1",
            )
        for ((text, js) in cases) assertEquals(js, TreeHash.jsNumber(text), text)
    }

    @Test
    fun `doubles across the range, subnormals among them, print as JavaScript printed them`() {
        // JSON.stringify's output in Node 24 for doubles drawn from random bit patterns (every fourth one subnormal):
        // reading the text back and printing it again gives the same text.
        val printed =
            listOf(
                "1.6905599178388755e-308",
                "-6.766848154629963e+175",
                "6.078989201188928e-53",
                "8.882056343710663e+167",
                "-4.993238431325025e-309",
                "3.587959730897931e-246",
                "5.0513463356317975e-231",
                "2.865682494642637e-155",
                "-5.977812218608584e-309",
                "9.136353238902674e-45",
                "1.1502799758274296e-54",
                "7.920431961806249e-54",
                "-1.6959186917009954e-308",
                "9.720461789709331e+227",
                "2.4261860608815182e-160",
                "-0.20221894534048165",
                "-1.99271490270396e-310",
                "-3.4383306360012095e+232",
                "3.4578134834080018e+25",
                "8.239630804885175e-196",
                "1.80268265603703e-309",
                "-104913124.37877665",
                "-4.810395885839012e+112",
                "-8.913728436274745e+31",
            )
        for (js in printed) assertEquals(js, TreeHash.jsNumber(js), js)
        assertEquals(JS_DOUBLES, printed.size)
    }

    @Test
    fun `the canonical text sorts keys, writes strings as JSON stringify does, and the hash names it`() {
        val value = JsonRead.parse("""{"b":[1.0,"\u0001\n\"\\",null],"a":{"y":true,"x":"日本\uD83D"},"":false}""")!!
        assertEquals(
            """{"":false,"a":{"x":"日本\ud83d","y":true},"b":[1,"\u0001\n\"\\",null]}""",
            TreeHash.canonical(value),
        )
        val same = JsonRead.parse("""{"":false,"a":{"x":"日本\uD83D","y":true},"b":[1,"\u0001\n\"\\",null]}""")!!
        assertEquals(TreeHash.of(value), TreeHash.of(same), "key order and number spelling do not count")
        assertEquals("2:5465b825", TreeHash.of(JsonRead.parse("{}")!!))
        assertNotEquals(TreeHash.of(JsonRead.parse("""{"a":1}""")!!), TreeHash.of(JsonRead.parse("""{"a":2}""")!!))
    }

    private companion object {
        const val JS_DOUBLES = 24
    }
}
