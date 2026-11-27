package dev.ukitomato.closta.platforms.intellij.chat

/**
 * A conversation the user closed: its tab's [hostId], where it was shown, its title and the folder it ran in. Its
 * title and folder are left out of [toString], which goes in logs.
 */
data class ClosedChat(
    val hostId: String,
    val placement: Placement,
    val title: String,
    val workingDirectory: String?,
) {
    override fun toString(): String = "ClosedChat($hostId, $placement)"
}

/** The last [limit] conversations closed, newest first, one per host id. Immutable and free of `com.intellij`. */
class ClosedChatStack private constructor(
    private val limit: Int,
    private val chats: List<ClosedChat>,
) {
    constructor(limit: Int = DEFAULT_LIMIT) : this(limit, emptyList())

    /** With [chat] on top; an older close of the same host id goes, and so does the oldest past the limit. */
    fun closed(chat: ClosedChat): ClosedChatStack =
        ClosedChatStack(limit, (listOf(chat) + chats.filter { it.hostId != chat.hostId }).take(limit))

    fun latest(): ClosedChat? = chats.firstOrNull()

    /** This stack without the conversation of [hostId], which was opened again. */
    fun reopened(hostId: String): ClosedChatStack = ClosedChatStack(limit, chats.filter { it.hostId != hostId })

    private companion object {
        const val DEFAULT_LIMIT = 10
    }
}
