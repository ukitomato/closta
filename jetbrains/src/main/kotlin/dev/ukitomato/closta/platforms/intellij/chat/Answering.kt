package dev.ukitomato.closta.platforms.intellij.chat

import dev.ukitomato.closta.platforms.intellij.session.AnswerNotRecorded
import kotlinx.coroutines.CancellationException

/**
 * Passes an answer on and, when it could not be, tells the card ([failed]: the approval shows the host's sentence and
 * can be answered again). An answer the CLI took but the transcript could not record is not a failure: answering it
 * again would answer twice. Only the type of the failure is logged. Free of `com.intellij`.
 */
suspend fun answerOrMarkFailed(
    answer: suspend () -> Unit,
    failed: suspend () -> Unit,
    log: (String) -> Unit,
) {
    try {
        answer()
    } catch (cancel: CancellationException) {
        throw cancel
    } catch (_: AnswerNotRecorded) {
        // The CLI has the answer.
    } catch (
        @Suppress("TooGenericExceptionCaught") failure: Exception,
    ) {
        log("chat: an answer could not be passed on (${failure.javaClass.name})")
        failed()
    }
}
