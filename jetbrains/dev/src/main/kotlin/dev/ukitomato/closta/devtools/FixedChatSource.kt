package dev.ukitomato.closta.devtools

import dev.ukitomato.closta.core.models.Attachment
import dev.ukitomato.closta.platforms.intellij.chat.ChatSource
import dev.ukitomato.closta.platforms.intellij.session.SessionNotice
import dev.ukitomato.closta.platforms.intellij.session.SessionView
import dev.ukitomato.closta.platforms.intellij.thread.CardAnswer
import dev.ukitomato.closta.presenter.view.RewindRecord
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.UUID

/**
 * A conversation handed over whole and then pushed to by its owner (the benchmark, the gallery); sending does
 * nothing. It shows [notice] and [canSend] as given, so the gallery can paint a starting, failed or ended session.
 * Its answers go to [answered], where the owner may push what the CLI would show next.
 */
@Suppress("TooManyFunctions") // one override per command
class FixedChatSource(
    override val title: String,
    initial: SessionView,
    override val sessionId: String = "fixed-${UUID.randomUUID()}",
    notice: SessionNotice? = null,
    canSend: Boolean = false,
    private val answered: (CardAnswer) -> Unit = {},
) : ChatSource {
    private val state = MutableStateFlow(initial)
    override val view: StateFlow<SessionView> = state.asStateFlow()
    override val notice: StateFlow<SessionNotice?> = MutableStateFlow(notice)
    override val canSend: StateFlow<Boolean> = MutableStateFlow(canSend)
    override val opensWithContent = true
    override val starting: Boolean get() = notice.value == null

    fun push(next: SessionView) {
        state.value = next
    }

    override suspend fun send(
        text: String,
        attachments: List<Attachment>,
    ) = true

    override suspend fun switchModel(model: String) = Unit

    override suspend fun switchEffort(effort: String) = Unit

    override suspend fun switchMode(mode: String) = Unit

    override suspend fun respond(answer: CardAnswer) = answered(answer)

    override suspend fun interrupt() = Unit

    override suspend fun stopTask(taskId: String) = Unit

    override suspend fun requestMcpStatus() = Unit

    override suspend fun setMcpServerEnabled(
        name: String,
        enabled: Boolean,
    ) = Unit

    override suspend fun reconnectMcpServer(name: String) = Unit

    override val workingDirectory: String? = null

    override suspend fun rewindFiles(messageId: String): RewindRecord? = null

    override fun dispose() = Unit
}
