package dev.ukitomato.closta.platforms.intellij.ui

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class PlainTipTest {
    @Test
    fun `markup in a tooltip stays text`() {
        assertEquals("<html>&lt;html&gt;&lt;img src=x&gt;</html>", plainTip("<html><img src=x>"))
    }

    @Test
    fun `no text is no tooltip`() {
        assertNull(plainTip(""))
        assertNull(plainTip("  "))
        assertNull(plainTip(null))
    }

    @Test
    fun `line breaks are kept`() {
        assertEquals("<html>a<br>b &amp; c</html>", plainTip("a\r\nb & c"))
    }
}
