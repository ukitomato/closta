package dev.ukitomato.closta.platforms.intellij.ui

import com.intellij.openapi.util.text.StringUtil

/** A tooltip that shows [text] as written. Swing reads one starting with `<html>` as HTML. */
fun plainTip(text: String): String = "<html>${StringUtil.escapeXmlEntities(text)}</html>"
