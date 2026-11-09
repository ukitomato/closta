package dev.ukitomato.closta.platforms.intellij.composer

// How a range of lines is written, the same in a chip, in the message sent and by Alt+K. Free of `com.intellij`.

/**
 * Lines [start] to [end] of [path]: in a chip `L42-58` (the file's name stands beside it), in the message
 * `@path#L42-58`; one line is `L42` and `@path#L42`.
 */
fun rangeLabel(
    path: String,
    start: Int,
    end: Int,
    forChip: Boolean,
): String {
    val lines = if (start == end) "L$start" else "L$start-$end"
    return if (forChip) lines else "@$path#$lines"
}
