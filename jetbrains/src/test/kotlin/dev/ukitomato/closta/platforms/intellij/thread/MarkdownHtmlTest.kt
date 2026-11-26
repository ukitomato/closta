package dev.ukitomato.closta.platforms.intellij.thread

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class MarkdownHtmlTest {
    private fun html(markdown: String) = MarkdownHtml { _, _ -> null }.blocks(markdown).joinToString { it.html }

    @Test fun `an inline image is written as its text and address, never as an img`() {
        val html = html("see ![logo](https://a.example/x.png?d=secret)")
        assertFalse(html.contains("<img"))
        assertTrue(html.contains("logo") && html.contains("https://a.example/x.png?d=secret"))
    }

    @Test fun `a reference image and an image inside a link are not imgs either`() {
        val reference = html("![a][r]\n\n[r]: https://a.example/r.png")
        val inLink = html("[![a](https://a.example/i.png)](https://b.example)")
        assertFalse(reference.contains("<img"))
        assertFalse(inLink.contains("<img"))
        assertTrue(reference.contains("https://a.example/r.png"))
        assertTrue(inLink.contains("https://a.example/i.png") && inLink.contains("https://b.example"))
    }

    @Test fun `raw html stays escaped`() {
        val html = html("<img src=x>")
        assertFalse(html.contains("<img"))
        assertTrue(html.contains("&lt;img"))
    }

    @Test fun `a path in the text may break after a slash or a dot, and its text stays escaped`() {
        val html = html("see src/main/Foo.kt and a/b&c")
        assertTrue(html.contains("src/<wbr>main/<wbr>Foo.<wbr>kt"), html)
        assertTrue(html.contains("a/<wbr>b&amp;c"), html)
    }

    @Test fun `inline code is written in one piece, with no break in it`() {
        val html = html("in `workspaces/test-matrix/mr/vary.md` and [`x/y`](https://a.example/p/q)")
        assertTrue(html.contains("<code>workspaces/test-matrix/mr/vary.md</code>"), html)
        assertTrue(html.contains("<code>x/y</code>"), html)
        assertTrue(html.contains("href=\"https://a.example/p/q\""), html)
    }

    @Test fun `a fence is coloured by the given function and tables are wide`() {
        val markdown = "```kt\nval a\n```\n\n| a |\n|---|\n| b |"
        val blocks = MarkdownHtml { language, code -> "[$language:$code]" }.blocks(markdown)
        assertTrue(blocks[0].html.contains("[kt:val a]") && blocks[0].wide)
        assertTrue(blocks[1].wide)
    }
}
