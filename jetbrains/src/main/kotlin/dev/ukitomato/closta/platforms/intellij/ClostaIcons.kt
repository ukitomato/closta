package dev.ukitomato.closta.platforms.intellij

import com.intellij.openapi.util.IconLoader
import javax.swing.Icon

/** The plugin's own icons (the IDE picks the `_dark` and `@20x20` variants by itself). */
object ClostaIcons {
    /** The tower: the tool windows, the menu and a conversation's editor tab. */
    @JvmField
    val Closta: Icon = IconLoader.getIcon("/icons/closta.svg", ClostaIcons::class.java)

    /** The tower and a list: the bottom tool window of every project's sessions. */
    @JvmField
    val Sessions: Icon = IconLoader.getIcon("/icons/sessions.svg", ClostaIcons::class.java)
}
