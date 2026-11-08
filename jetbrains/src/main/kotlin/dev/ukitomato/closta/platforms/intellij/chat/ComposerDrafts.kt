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
    private val book = DraftBook<ComposerDraft>(ComposerDraft::copy)
    private val watched = HashSet<String>()

    /** The draft goes when [source] is disposed, whoever made it. */
    private fun watch(source: ChatSource) {
        val id = source.sessionId
        if (watched.add(id)) {
            Disposer.register(source) {
                watched.remove(id)
                book.drop(id)
            }
        }
    }

    fun of(source: ChatSource): ComposerDraft {
        watch(source)
        return book.of(source.sessionId) { ComposerDraft(PromptHistory(promptsOf(source.view.value.transcript))) }
    }

    /** A copy of what [source] has now, to be [install]ed for the session that takes over from it. */
    fun snapshot(source: ChatSource): ComposerDraft? = book.snapshot(source.sessionId)

    /** Gives [to], the session that takes over from [from], a copy of [from]'s draft, before [to]'s screen is made. */
    fun carry(
        from: String,
        to: ChatSource,
    ) {
        watch(to)
        book.carry(from, to.sessionId)
    }

    /** Gives [to] the [draft] a [snapshot] took, before [to]'s screen is made. */
    fun install(
        to: ChatSource,
        draft: ComposerDraft,
    ) {
        watch(to)
        book.put(to.sessionId, draft)
    }

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
