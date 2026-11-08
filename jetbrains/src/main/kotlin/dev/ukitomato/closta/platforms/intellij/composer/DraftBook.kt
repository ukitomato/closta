package dev.ukitomato.closta.platforms.intellij.composer

/**
 * Drafts by session id. [carry] gives a session's draft, as a copy of its own, to the session that takes over from it
 * (a restart or a rewind), which is why a draft is not keyed by the screen. [copy] makes that copy. Called on the EDT.
 */
class DraftBook<D>(
    private val copy: (D) -> D,
) {
    private val drafts = HashMap<String, D>()

    fun of(
        id: String,
        make: () -> D,
    ): D = drafts.getOrPut(id, make)

    /** What [id] has now, as a copy that stays when [id]'s draft is dropped or edited; null when it has none. */
    fun snapshot(id: String): D? = drafts[id]?.let(copy)

    /** Gives [to] a copy of the draft [from] has, unless [to] already has one; [from] keeps its own. */
    fun carry(
        from: String,
        to: String,
    ) {
        snapshot(from)?.let { put(to, it) }
    }

    /** Gives [id] [draft] itself, unless [id] already has one. */
    fun put(
        id: String,
        draft: D,
    ) {
        drafts.putIfAbsent(id, draft)
    }

    fun drop(id: String) {
        drafts.remove(id)
    }
}
