package dev.ukitomato.closta.platforms.intellij.thread

import dev.ukitomato.closta.presenter.view.ElicitationCard
import dev.ukitomato.closta.presenter.view.ElicitationStage
import dev.ukitomato.closta.presenter.view.ElicitationValue
import dev.ukitomato.closta.presenter.view.rebuildsElicitationCard

/** What the form values the user typed so far are, by the field's key. The screen keeps them only while typing. */
internal typealias ElicitationDraft = Map<String, ElicitationValue>

/**
 * What was typed in the forms that wait, by request, and when it is taken, given back and dropped. Free of
 * `com.intellij`: the views only read and write the fields.
 */
internal class ElicitationDrafts {
    private val kept = HashMap<String, ElicitationDraft>()

    fun keep(
        requestId: String,
        values: ElicitationDraft,
    ) {
        kept[requestId] = values
    }

    /** What a view made now for [card] starts with; a card that no longer waits has none, and its draft is dropped. */
    fun draftFor(card: ElicitationCard): ElicitationDraft {
        if (card.stage != ElicitationStage.WAITING) {
            kept.remove(card.requestId)
            return emptyMap()
        }
        return kept[card.requestId].orEmpty()
    }

    /** The view showing [shown] is given [next]: whether it is made again; if so, [typedNow] is kept first. */
    fun redraw(
        shown: ElicitationCard,
        next: ElicitationCard,
        typedNow: () -> ElicitationDraft,
    ): Boolean {
        val rebuild = rebuildsElicitationCard(shown, next)
        if (rebuild && next.stage == ElicitationStage.WAITING) keep(next.requestId, typedNow())
        if (next.stage != ElicitationStage.WAITING) kept.remove(next.requestId)
        return rebuild
    }

    fun size(): Int = kept.size
}

/** The draft the detail pane kept for the pane made again, or null when it kept none. */
internal fun draftOf(kept: Any?): ElicitationDraft? {
    val map = kept as? Map<*, *> ?: return null
    val typed = map.entries.mapNotNull { (key, value) -> pairOf(key, value) }
    return typed.takeIf { it.size == map.size }?.toMap()
}

private fun pairOf(
    key: Any?,
    value: Any?,
): Pair<String, ElicitationValue>? {
    val name = key as? String
    val typed = value as? ElicitationValue
    return if (name != null && typed != null) name to typed else null
}
