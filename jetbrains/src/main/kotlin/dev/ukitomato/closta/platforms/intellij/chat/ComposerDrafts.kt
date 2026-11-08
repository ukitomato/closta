package dev.ukitomato.closta.platforms.intellij.chat

import com.intellij.openapi.components.Service
import com.intellij.openapi.util.Disposer
import dev.ukitomato.closta.platforms.intellij.composer.ComposerDraft
import dev.ukitomato.closta.platforms.intellij.composer.DraftBook
import dev.ukitomato.closta.platforms.intellij.composer.PromptHistory
import dev.ukitomato.closta.platforms.intellij.composer.promptsOf

/**
 * The drafts of the open conversations, by session id: the text, the chips and the prompts sent before, so they stay
 * when a conversation moves between the sidebar and an editor tab. A draft goes when its conversation is disposed. A
 * resumed conversation's history starts from the prompts in its transcript ([seed]). Called on the EDT.
 */
@Service(Service.Level.APP)
class ComposerDrafts {
    private val book = DraftBook<ComposerDraft>()
    private val watched = HashSet<String>()

    fun of(source: ChatSource): ComposerDraft {
        val id = source.sessionId
        if (watched.add(id)) {
            Disposer.register(source) {
                watched.remove(id)
                book.drop(id)
            }
        }
        return book.of(id) { ComposerDraft(PromptHistory(promptsOf(source.view.value.transcript))) }
    }

    /** Gives the session [to] that [from] opens the draft [from] has, before [to]'s screen is made. */
    fun carry(
        from: String,
        to: String,
    ) = book.carry(from, to)

    /**
     * Starts [draft]'s history from [source]'s transcript, again each time it has more messages, until a prompt is sent
     * from the composer (a resume puts the record back in two writes after opening).
     */
    fun seed(
        draft: ComposerDraft,
        source: ChatSource,
    ) {
        val transcript = source.view.value.transcript
        val count = transcript.messages.size
        if (!draft.history.sentHere && count != draft.seenMessages) {
            draft.seenMessages = count
            draft.history.seed(promptsOf(transcript))
        }
    }
}
