package dev.ukitomato.closta.platforms.intellij.session

/**
 * How a session is opened: a new conversation, a saved session put back under its own id, or a saved
 * session copied under a new id. A closed type, so that a fork without a session to fork cannot be said. Free of
 * `com.intellij`.
 */
sealed interface SessionOpening {
    /** A new conversation: a new id, nothing earlier. */
    data object New : SessionOpening

    /** A saved session, [id] being the one it was saved under. */
    sealed interface Saved : SessionOpening {
        val id: String
    }

    /** Opens the saved session [id] as it is: the session's id is [id]. */
    data class Resume(
        override val id: String,
    ) : Saved {
        init {
            require(id.isNotBlank()) { "a resume needs the session to resume" }
        }
    }

    /**
     * Opens the saved session [id] as a copy under a new id. With [rewindBefore], the user line of the record
     * with that uuid and everything after it is left out: the copy is the conversation up to what was said
     * before it.
     */
    data class Fork(
        override val id: String,
        val rewindBefore: String? = null,
    ) : Saved {
        init {
            require(id.isNotBlank()) { "a fork needs the session to fork" }
            require(rewindBefore == null || rewindBefore.isNotBlank()) { "a rewind needs the line to rewind to" }
        }
    }
}

/** The id of the saved session this opens, or null for a new conversation. */
val SessionOpening.savedId: String? get() = (this as? SessionOpening.Saved)?.id
