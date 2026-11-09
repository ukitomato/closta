package dev.ukitomato.closta.platforms.intellij.thread

import java.awt.Image
import java.awt.image.BufferedImage
import java.net.URL
import java.util.Collections
import java.util.Dictionary

/**
 * The image source for a reply's HTML pane: every address answers with one blank pixel, so the pane never opens a
 * connection for an `<img>` (the Markdown renderer writes none; this keeps it so if one ever slips through).
 */
internal object NoImages : Dictionary<URL, Image>() {
    private val blank: Image = BufferedImage(1, 1, BufferedImage.TYPE_INT_ARGB)

    override fun size(): Int = 0

    override fun isEmpty(): Boolean = true

    override fun keys(): java.util.Enumeration<URL> = Collections.emptyEnumeration()

    override fun elements(): java.util.Enumeration<Image> = Collections.emptyEnumeration()

    override fun get(key: Any?): Image = blank

    override fun put(
        key: URL?,
        value: Image?,
    ): Image? = null

    override fun remove(key: Any?): Image? = null
}
