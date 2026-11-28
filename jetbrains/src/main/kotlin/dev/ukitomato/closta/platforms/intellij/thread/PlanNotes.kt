package dev.ukitomato.closta.platforms.intellij.thread

import com.intellij.openapi.components.Service
import java.util.concurrent.ConcurrentHashMap

/**
 * The one sentence typed beside a plan's answer, by request: on its card in the conversation, and in the detail pane.
 * What is being typed, not the state of a request, so the screens write it as the user types and the plan's tab bar
 * reads it when it sends the tab's edits back. Forgotten once the plan is answered.
 */
@Service(Service.Level.PROJECT)
class PlanNotes {
    private val notes = ConcurrentHashMap<String, PlanNote>()

    operator fun get(requestId: String): PlanNote? = notes[requestId]

    fun typedOnCard(
        requestId: String,
        text: String,
    ) {
        notes.compute(requestId) { _, note -> (note ?: PlanNote(null, null)).copy(card = text) }
    }

    fun typedInPane(
        requestId: String,
        text: String,
    ) {
        notes.compute(requestId) { _, note -> (note ?: PlanNote(null, null)).copy(pane = text) }
    }

    fun forget(requestId: String) {
        notes.remove(requestId)
    }
}
