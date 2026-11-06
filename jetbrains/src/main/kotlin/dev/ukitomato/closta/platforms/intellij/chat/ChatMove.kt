package dev.ukitomato.closta.platforms.intellij.chat

/**
 * Moves a conversation between places without its session falling to no lease on the way: a bridging lease is taken
 * first, the new place is opened ([openNew], false when it could not be), the old one is closed only if the new one
 * opened, and the bridge is returned [later] (after the IDE has made the new place, which may come after [openNew]
 * returns). Returns whether the conversation moved. Free of `com.intellij`.
 */
fun moveChat(
    leases: ViewLeases,
    sessionId: String,
    openNew: () -> Boolean,
    closeOld: () -> Unit,
    later: (() -> Unit) -> Unit,
): Boolean {
    val bridge = leases.lease(sessionId)
    val moved = openNew()
    if (moved) closeOld()
    later { bridge.release() }
    return moved
}
