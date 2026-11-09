package dev.ukitomato.closta.platforms.intellij.ide

/**
 * [text] with `&`, `<` and `>` as character references (`&` first), for text placed inside an HTML element: a session
 * notice label and a balloon's body are drawn as HTML. It does not escape quotes: it is not for attribute values.
 */
fun htmlEscaped(text: String): String = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
