package dev.ukitomato.closta.platforms.intellij.session

import dev.ukitomato.closta.core.interfaces.SavedSessions
import dev.ukitomato.closta.presenter.view.PresenterInput
import kotlinx.coroutines.CancellationException

/**
 * The project's saved sessions as the view takes them: [currentId] is the session the list marks as the current
 * one. A place that cannot be read is a listing that could not be read (the list the view had stays), and only the type
 * of the failure is logged. With no [saved] to list from, it is the same.
 *
 * It is not a command of a running session: the record is the project's, and read without the CLI, so a session that is
 * still starting, or failed, or ended, can be asked for it ([SessionRuntime.listSaved]).
 */
internal suspend fun listing(
    saved: SavedSessions?,
    currentId: String,
    log: SessionLog,
): PresenterInput.SessionsListed =
    try {
        PresenterInput.SessionsListed(checkNotNull(saved) { "no saved sessions" }.list(), currentId)
    } catch (cancel: CancellationException) {
        throw cancel
    } catch (
        @Suppress("TooGenericExceptionCaught") failure: Exception,
    ) {
        unreadable(failure, currentId, log)
    } catch (notImplemented: NotImplementedError) {
        // The IDE's file system for a WSL path (Ijent) says an operation it lacks with an Error, not an exception.
        unreadable(notImplemented, currentId, log)
    }

private fun unreadable(
    failure: Throwable,
    currentId: String,
    log: SessionLog,
): PresenterInput.SessionsListed {
    log.warn("claude session $currentId: the saved sessions could not be listed (${failure.javaClass.name})")
    return PresenterInput.SessionsListed(emptyList(), currentId, unreadable = true)
}
