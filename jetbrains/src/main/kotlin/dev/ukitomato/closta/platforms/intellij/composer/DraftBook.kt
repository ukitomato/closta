package dev.ukitomato.closta.platforms.intellij.composer

/**
 * Drafts by session id. [carry] hands a session's draft to the session that takes over from it (a restart or a rewind),
 * which is why a draft is not keyed by the screen. Called on the EDT.
 */
class DraftBook<D> {
    private val drafts = HashMap<String, D>()

    fun of(
        id: String,
        make: () -> D,
    ): D = drafts.getOrPut(id, make)

    /** Gives [to] the draft [from] has, unless [to] already has one; [from] keeps its own. */
    fun carry(
        from: String,
        to: String,
    ) {
        val draft = drafts[from] ?: return
        drafts.putIfAbsent(to, draft)
    }

    fun drop(id: String) {
        drafts.remove(id)
    }
}
