package dev.ukitomato.closta.platforms.intellij.session

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.core.models.fold
import dev.ukitomato.closta.presenter.view.PresenterInput

// What the history of sessions writes into a [SessionView]: the list of saved sessions, and the earlier
// conversation of a session that is resumed. None of it changes core's state except the lines of the record, which
// go through core's fold as the same lines from stdout do.

/** The host's list of the project's saved sessions; core's state does not change. */
fun SessionView.listed(input: PresenterInput.SessionsListed): SessionView = folded(conversation, input)

/**
 * One line of the record of a session that is resumed, put back: through core's fold and the transcript's as
 * the same line from stdout goes, the user's words in it becoming a user message.
 */
fun SessionView.restored(event: AgentEvent): SessionView =
    folded(fold(conversation, event), PresenterInput.Restored(event))

/** Everything the record gave is back; [dropped] is how many older lines the host left out. */
fun SessionView.historyRestored(dropped: Int): SessionView =
    folded(conversation, PresenterInput.HistoryRestored(dropped))

/**
 * The earlier conversation of a session that is resumed, put back from its record before anything the CLI
 * says: each line with [restored], and then [historyRestored].
 */
fun SessionView.restored(
    events: List<AgentEvent>,
    dropped: Int,
): SessionView {
    var view = this
    for (event in events) view = view.restored(event)
    return view.historyRestored(dropped)
}

/** The record of the resumed session could not be read: it goes on without its earlier conversation. */
fun SessionView.historyUnavailable(): SessionView = folded(conversation, PresenterInput.HistoryUnavailable)
