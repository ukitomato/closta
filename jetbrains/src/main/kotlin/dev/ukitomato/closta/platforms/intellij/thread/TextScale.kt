package dev.ukitomato.closta.platforms.intellij.thread

/** The scale of the screen text was measured on: its default transform's. */
data class TextScale(
    val scaleX: Double,
    val scaleY: Double,
)

/**
 * Whether a row measured at [measuredWith] has to be measured again on a screen of [now]: text measures a little
 * differently at another scale, enough to wrap a line more or less. Unknown ([measuredWith] null) is measured again.
 */
fun needsRemeasure(
    measuredWith: TextScale?,
    now: TextScale,
): Boolean = measuredWith != now
