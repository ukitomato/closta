package dev.ukitomato.closta.platforms.intellij.ui

import javax.swing.JComponent

/**
 * A tooltip that shows [text] as written, or `null` for no tooltip when it is blank. Swing reads one starting with
 * `<html>` as HTML (and loads what it points at), so the text is escaped and wrapped; line breaks are kept.
 */
fun plainTip(text: String?): String? = text?.takeIf { it.isNotBlank() }?.let { "<html>${plainHtml(it)}</html>" }

/** [text] escaped for inside HTML, its line breaks as `<br>`. */
fun plainHtml(text: String): String =
    buildString {
        for (c in text) {
            when (c) {
                '&' -> append("&amp;")
                '<' -> append("&lt;")
                '>' -> append("&gt;")
                '"' -> append("&quot;")
                '\'' -> append("&#39;")
                '\n' -> append("<br>")
                '\r' -> Unit
                else -> append(c)
            }
        }
    }

/** Stops a label, button or link from reading its text as HTML; for text that comes from the conversation or CLI. */
fun <T : JComponent> T.noHtml(): T = apply { putClientProperty("html.disable", true) }
