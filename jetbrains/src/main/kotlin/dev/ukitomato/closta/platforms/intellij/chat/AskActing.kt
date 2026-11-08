package dev.ukitomato.closta.platforms.intellij.chat

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.EDT
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.project.Project
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.presenter.view.AskAction
import dev.ukitomato.closta.presenter.view.AskActions
import dev.ukitomato.closta.presenter.view.ForkFrom
import dev.ukitomato.closta.presenter.view.RewindConversation
import dev.ukitomato.closta.presenter.view.RewindFilesThenConversation
import dev.ukitomato.closta.presenter.view.threadIsRunning
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull

/** Where a conversation's screen is: an editor tab or a sidebar tab. It moves the conversation, or closes. */
interface ChatPlace {
    val placement: Placement

    /** Puts the conversation at [to] and closes this place once it is there. */
    fun move(to: Placement)

    /** Closes this place (the session goes on unless it is stopped). */
    fun close()

    /** Names this place's tab after the conversation ([title], uncut: the place cuts it to its tab's room). */
    fun retitle(title: String) = Unit
}

/**
 * Rewinds and forks from an ask. What the row offered on hover is checked again at the click against [offered]
 * ([clickRefusal]), and one rewind or fork runs at a time per session ([ActingGate]). A rewind opens a copy of the
 * saved record in the same working directory and waits for it to run ([copyStep]): only then does it take this [place]
 * and is the session shown here stopped (one in a worktree leaves a mark to resume it from the list). A copy that fails
 * or does not start in time is stopped, the original stays, and [refused] says why. With the files, the CLI puts them
 * back first, and the conversation is rewound only once it said it did and no turn has started since. A fork opens the
 * copy in an editor tab and leaves this one as it is. Called on the EDT.
 */
class AskActing(
    private val project: Project,
    private val source: ChatSource,
    private val place: ChatPlace,
    private val scope: CoroutineScope,
    private val offered: (askKey: String, atEnd: Boolean) -> AskActions,
    private val refused: (String) -> Unit,
) {
    /** Told (on the EDT) when a rewind starts waiting and when it is over, whichever way it ends. */
    var busy: (Boolean) -> Unit = {}

    fun act(
        askKey: String,
        atEnd: Boolean,
        action: AskAction,
    ) {
        clickRefusal(action, offered(askKey, atEnd))?.let {
            refused(it)
            return
        }
        val id = source.sessionId
        if (!GATE.tryStart(id)) {
            refused(ACTION_BUSY)
            return
        }
        if (action !is ForkFrom) busy(true)
        var handedOff = false
        try {
            when (action) {
                is RewindConversation -> handedOff = rewindHere(action.rewindBefore)
                is ForkFrom -> {
                    val copy = sessions().open(forkOpening(id, action), FORK_TITLE, source.workingDirectory)
                    if (!openChat(project, copy, Placement.EDITOR_TAB)) sessions().stop(copy)
                }
                is RewindFilesThenConversation -> {
                    rewindFilesThenConversation(action)
                    handedOff = true
                }
            }
        } finally {
            if (!handedOff) finish(id)
        }
    }

    private fun rewindFilesThenConversation(action: RewindFilesThenConversation) {
        val id = source.sessionId
        scope
            .launch(failures) {
                val answer = filesRewound(action.messageId)
                withContext(Dispatchers.EDT) {
                    val view = source.view.value
                    val refusal =
                        afterFilesRefusal(
                            filesRewindRefusal(answer),
                            threadIsRunning(view.conversation, view.transcript),
                        )
                    if (refusal != null) {
                        refused(refusal)
                        finish(id)
                    } else if (!rewindHere(action.rewindBefore)) {
                        finish(id)
                    }
                }
            }.invokeOnCompletion { failure -> if (failure != null) finish(id) }
    }

    private suspend fun filesRewound(messageId: String) =
        try {
            source.rewindFiles(messageId)
        } catch (cancel: CancellationException) {
            throw cancel
        } catch (
            @Suppress("TooGenericExceptionCaught") failure: Exception,
        ) {
            thisLogger().warn("chat: the files could not be rewound (${failure.javaClass.name})")
            null
        }

    /** Opens the copy and waits for it in the background; true when the wait took the gate over. */
    private fun rewindHere(rewindBefore: String?): Boolean {
        val old = source.sessionId
        val copyId = sessions().open(rewindOpening(old, rewindBefore), source.title, source.workingDirectory)
        val copy = sessions().source(copyId) as? ChatSource.Live
        if (copy == null) {
            sessions().stop(copyId)
            refused(COPY_NOT_OPENED)
            return false
        }
        service<ComposerDrafts>().carry(old, copy)
        scope
            .launch(failures) {
                val step =
                    withTimeoutOrNull(COPY_START_MS) {
                        copy.runtime.status
                            .map(::copyStep)
                            .first { it != CopyStep.Wait }
                    } ?: copyTimedOut()
                withContext(Dispatchers.EDT) {
                    try {
                        settle(step, old, copyId)
                    } finally {
                        finish(old)
                    }
                }
            }.invokeOnCompletion { failure ->
                if (failure != null) {
                    finish(old)
                    ApplicationManager.getApplication().invokeLater { sessions().stop(copyId) }
                }
            }
        return true
    }

    private fun settle(
        step: CopyStep,
        old: String,
        copyId: String,
    ) {
        when {
            step is CopyStep.Abandon -> {
                sessions().stop(copyId)
                refused(step.reason)
            }
            !openChat(project, copyId, place.placement) -> {
                sessions().stop(copyId)
                refused(COPY_NOT_OPENED)
            }
            else -> {
                place.close()
                sessions().stopFromScreen(old)
            }
        }
    }

    /** Gives the gate back and says the rewind is over (from any thread: [busy] is told on the EDT). */
    private fun finish(id: String) {
        GATE.done(id)
        ApplicationManager.getApplication().invokeLater { busy(false) }
    }

    private fun sessions() = project.service<ChatSessions>()

    /** A step that throws is logged by its type; the gate is given back by the job's completion. */
    private val failures =
        CoroutineExceptionHandler {
            _,
            failure,
            ->
            thisLogger().warn("chat: a rewind failed (${failure.javaClass.name})")
        }

    private companion object {
        val FORK_TITLE: String get() = ClostaBundle.message("chat.fork.title")
        const val COPY_START_MS = 60_000L

        /** One rewind or fork at a time per session, whichever screen shows it. */
        val GATE = ActingGate()
    }
}
