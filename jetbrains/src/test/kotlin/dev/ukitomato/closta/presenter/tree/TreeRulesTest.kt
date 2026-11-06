package dev.ukitomato.closta.presenter.tree

import dev.ukitomato.closta.presenter.Trees
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class TreeRulesTest {
    @Test
    fun `a key is a path segment the webview accepts`() {
        for (key in listOf(
            "a",
            "toolu_01",
            "01",
            "-1",
            "1.5",
            "send-1",
            "msg:0",
            "id:7",
            " ",
            "__proto",
            "Constructor",
        )) {
            assertTrue(TreeRules.isKey(key), key)
        }
        for (key in listOf("", "0", "7", "12", "9007199254740993", "__proto__", "constructor", "prototype")) {
            assertFalse(TreeRules.isKey(key), key)
        }
    }

    @Test
    fun `a value fits in exactly as many levels as it nests`() {
        assertTrue(TreeRules.fits(JsonString("leaf"), 0), "a primitive takes no level")
        assertTrue(TreeRules.fits(JsonObject.EMPTY, 1))
        assertFalse(TreeRules.fits(JsonObject.EMPTY, 0))
        assertTrue(TreeRules.fits(Trees.nested(10), 10))
        assertFalse(TreeRules.fits(Trees.nested(11), 10))
        assertTrue(TreeRules.fits(Trees.nestedArray(10), 10))
        assertFalse(TreeRules.fits(Trees.nestedArray(11), 10))
        val wide = JsonObject.of("shallow" to JsonObject.EMPTY, "deep" to Trees.nested(5))
        assertTrue(TreeRules.fits(wide, 6))
        assertFalse(TreeRules.fits(wide, 5), "the deepest branch decides")
    }

    @Test
    fun `a value with a member that reaches the prototype does not fit anywhere`() {
        val proto = JsonObject.of("list" to JsonArray(listOf(JsonObject.of("__proto__" to JsonNull))))
        assertFalse(TreeRules.fits(proto, TreeRules.MAX_DEPTH))
        val constructor = JsonObject.of("constructor" to JsonObject.of("prototype" to JsonObject.EMPTY))
        assertFalse(TreeRules.fits(constructor, TreeRules.MAX_DEPTH))
        assertTrue(
            TreeRules.fits(JsonObject.of("constructor" to JsonObject.of("name" to JsonNull)), TreeRules.MAX_DEPTH),
        )
        assertTrue(TreeRules.fits(JsonObject.of("prototype" to JsonObject.EMPTY), TreeRules.MAX_DEPTH))
        assertTrue(TreeRules.fits(JsonObject.of("constructor" to JsonString("prototype")), TreeRules.MAX_DEPTH))
    }

    @Test
    fun `a number fits only when it is finite as a double`() {
        assertFalse(TreeRules.fits(JsonNumber("1e999"), 1))
        assertFalse(TreeRules.fits(JsonObject.of("n" to JsonNumber("-1E400")), TreeRules.MAX_DEPTH))
        assertTrue(TreeRules.fits(JsonNumber("1e-400"), 0))
        assertTrue(TreeRules.fits(JsonNumber("123456789012345678901234567890"), 0))
    }
}
