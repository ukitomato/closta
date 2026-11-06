package dev.ukitomato.closta.platforms.intellij

import com.intellij.DynamicBundle
import org.jetbrains.annotations.Nls
import org.jetbrains.annotations.NonNls
import org.jetbrains.annotations.PropertyKey

@NonNls
private const val BUNDLE = "messages.ClostaBundle"

/**
 * The words the plugin shows. English is the default; `ClostaBundle_ja.properties` is used when the IDE runs in
 * Japanese (its language pack is installed). Without an IDE, as in the unit tests, the English words are used.
 */
object ClostaBundle {
    private val bundle = DynamicBundle(ClostaBundle::class.java, BUNDLE)

    @Nls
    fun message(
        @PropertyKey(resourceBundle = BUNDLE) key: String,
        vararg params: Any,
    ): String = bundle.getMessage(key, *params)
}
