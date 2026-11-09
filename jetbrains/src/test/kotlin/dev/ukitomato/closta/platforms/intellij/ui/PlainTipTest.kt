package dev.ukitomato.closta.platforms.intellij.ui

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import javax.swing.JButton
import javax.swing.JLabel
import javax.swing.plaf.basic.BasicHTML

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

    @Test
    fun `a label that already has html text drops its html view`() {
        val label = JLabel("<html><b>x</b>")
        assertNotNull(label.getClientProperty(BasicHTML.propertyKey))
        label.noHtml()
        assertNull(label.getClientProperty(BasicHTML.propertyKey))
        assertEquals("<html><b>x</b>", label.text)
    }

    @Test
    fun `a button that already has html text drops its html view`() {
        val button = JButton("<html><b>x</b>")
        assertNotNull(button.getClientProperty(BasicHTML.propertyKey))
        button.noHtml()
        assertNull(button.getClientProperty(BasicHTML.propertyKey))
        assertEquals("<html><b>x</b>", button.text)
    }
}
