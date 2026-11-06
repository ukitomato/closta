package dev.ukitomato.closta.platforms.intellij

import com.intellij.openapi.util.IconLoader
import javax.swing.Icon

/** The plugin's own icons (the IDE picks the `_dark` and `@20x20` variants by itself). */
object ClostaIcons {
    /** The tower: the tool windows, the menu and a conversation's editor tab. */
    @JvmField
    val Closta: Icon = IconLoader.getIcon("/icons/closta.svg", ClostaIcons::class.java)
}
