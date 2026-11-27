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

/** Where a project takes the conversations closed in it. */
interface ClosedSink {
    /** Whether the project is closing: its screens close then, which is not the user closing a conversation. */
    val closing: Boolean

    fun closed(chat: ClosedChat)
}

/** Stacks what the last screen of [sessionId] left in the project [sinkOf] finds, unless that is closing. */
fun rememberClosedIn(
    sessionId: String,
    left: LeftView?,
    sinkOf: (projectHash: String) -> ClosedSink?,
) {
    val sink = left?.let { sinkOf(it.projectHash) }
    if (left != null && sink != null && !sink.closing) {
        sink.closed(ClosedChat(sessionId, left.placement, left.title, left.workingDirectory))
    }
}
