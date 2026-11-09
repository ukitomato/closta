package dev.ukitomato.closta.platforms.intellij.composer

// Which file the composer follows as "the current file", decided without the IDE. Free of `com.intellij`.

/**
 * Whether the editor's file is one the composer offers as the current file: a file on the local disk, never a
 * conversation's own tab, nor a file only in memory, inside a jar or made for a diff.
 */
fun followable(
    isChatFile: Boolean,
    isLocal: Boolean,
): Boolean = !isChatFile && isLocal
