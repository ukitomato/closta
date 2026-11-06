package dev.ukitomato.closta.platforms.intellij.sessions

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.EDT
import com.intellij.openapi.application.readAction
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.ToolWindow
import com.intellij.ui.components.JBPanelWithEmptyText
import com.intellij.util.ui.JBUI
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.platforms.intellij.chat.ChatDirectory
import dev.ukitomato.closta.platforms.intellij.chat.ChatSource
import dev.ukitomato.closta.platforms.intellij.chat.TurnChanges
import dev.ukitomato.closta.platforms.intellij.chat.answerOrMarkFailed
import dev.ukitomato.closta.platforms.intellij.chat.bringAndShow
import dev.ukitomato.closta.platforms.intellij.session.ClaudeSessionService
import dev.ukitomato.closta.platforms.intellij.session.SystemClock
import dev.ukitomato.closta.platforms.intellij.thread.CardAnswer
import dev.ukitomato.closta.platforms.intellij.thread.HtmlBlock
import dev.ukitomato.closta.platforms.intellij.thread.MarkdownBlocks
import dev.ukitomato.closta.presenter.view.PlanCard
import dev.ukitomato.closta.presenter.view.SessionDetail
import dev.ukitomato.closta.presenter.view.ThreadCard
import dev.ukitomato.closta.presenter.view.sessionDetail
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.conflate
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.awt.BorderLayout
import java.awt.KeyboardFocusManager
import javax.swing.JComponent
import javax.swing.JPanel
import javax.swing.SwingUtilities
import javax.swing.Timer

/**
 * The right half of the sessions window: the session chosen in the tree, or a hint when none is chosen. A header line
 * ([headerView]) and a body by the session's state: what it waits for, answered in place ([answerView]); what it runs;
 * its last reply and changes once finished; or how to resume it.
 *
 * The body follows the shown session's own view and is drawn again only when its [sessionDetail] changes. Every answer
 * goes through [gate]: only the request on screen, still waiting, after it has been shown for a moment. The answer keys
 * ([AnswerKey]) are bound here, so they work only while the keyboard is already in this pane; Esc is left to the tool
 * window (back to the editor). The pane never takes the keyboard by itself.
 *
 * While it is in view, the shown session counts as seen (its lease): that marks it read and keeps its notifications
 * quiet, as an open conversation does.
 */
class SessionDetailPanel(
    private val project: Project,
    private val toolWindow: ToolWindow,
    parent: Disposable,
) : JBPanelWithEmptyText(BorderLayout()) {
    private val directory = service<ChatDirectory>()
    private val scope = project.service<ClaudeSessionService>().viewScope(parent)
    private val clock = SystemClock()
    private val gate = AnswerGate(clock)
    private val markdown = MarkdownBlocks(project)
    private val header = JPanel(BorderLayout())
    private val body =
        JPanel(BorderLayout()).apply {
            border = JBUI.Borders.empty(BODY_PAD_V, BODY_PAD_H)
            // Where the keyboard waits when the view that had it goes (setBody); no key does anything here.
            isFocusable = true
        }
    private val clockTick = Timer(TICK_MS) { drawHeader() }

    private var item: SessionItem? = null
    private var shownHeader: HeaderModel? = null
    private var following: Job? = null
    private val inView = PaneInView(this, toolWindow, gate::seenAgain, parent)

    /** The answer view on screen and the card it shows; null when the shown session does not wait. */
    private var answering: AnswerView? = null
    private var answeringCard: ThreadCard? = null

    /** Whether the first draw of the session chosen takes the keyboard (the user asked before it was drawn). */
    private val deferredFocus = DeferredFocus()
    private val more = moreLine()

    private val failures =
        CoroutineExceptionHandler { _, failure ->
            thisLogger().warn("sessions: a detail action failed (${failure.javaClass.name})")
        }

    init {
        withEmptyText(ClostaBundle.message("sessions.window.detail.empty"))
        header.isOpaque = false
        body.isOpaque = false
        bindAnswerKeys(this) { answering }
        clockTick.start()
        Disposer.register(parent) {
            clockTick.stop()
            following?.cancel()
            inView.hold(null)
            gate.dispose()
        }
    }

    /** Shows [item], or the hint when it is null. The same session shown again only updates the header. */
    fun show(item: SessionItem?) {
        val before = this.item
        this.item = item
        if (!sameSession(before, item)) switchTo(item)
        drawHeader()
    }

    /**
     * Puts the keyboard in the shown wait's view (the user asked for the next wait). A session chosen just now is drawn
     * a moment later (its view is followed off the EDT): its first draw takes the keyboard if it is a wait. Once the
     * session was drawn, nothing is kept for later ([DeferredFocus]).
     */
    fun focusAnswer() {
        val shown = answering
        if (shown != null) {
            shown.requestFocusInWindow()
        } else if (item is SessionItem.Live) {
            deferredFocus.asked()
        }
    }

    private fun switchTo(item: SessionItem?) {
        following?.cancel()
        following = null
        deferredFocus.switched()
        inView.hold(null)
        gate.reset()
        setBody(null)
        // The hint shows while the pane has no child.
        if (item == null) {
            removeAll()
        } else if (header.parent == null) {
            add(header, BorderLayout.NORTH)
            add(body, BorderLayout.CENTER)
        }
        revalidate()
        repaint()
        when (item) {
            null -> Unit
            is SessionItem.Mark -> setBody(markBody { placement -> openItem(project, item, placement) })
            is SessionItem.Live -> follow(item.entry)
        }
    }

    private fun follow(entry: ChatDirectory.Entry) {
        inView.hold(directory.leases.lease(entry.sessionId))
        following =
            scope.launch(Dispatchers.EDT) {
                entry.source.view
                    .map { sessionDetail(it.conversation, it.transcript) }
                    .distinctUntilChanged()
                    // A finished reply's Markdown is parsed (and its fences coloured) here, off the EDT.
                    .map { detail -> drawnOf(detail, markdown) }
                    .flowOn(Dispatchers.Default)
                    .conflate()
                    .collect { drawn -> draw(entry, drawn) }
            }
    }

    private fun draw(
        entry: ChatDirectory.Entry,
        drawn: Drawn,
    ) {
        val detail = drawn.detail
        // A collector cancelled for another session may still be on its way here.
        if ((item as? SessionItem.Live)?.entry?.source !== entry.source) return
        gate.shown(entry.sessionId, (detail as? SessionDetail.Waiting)?.card?.requestId)
        val focus = deferredFocus.drawn(detail is SessionDetail.Waiting)
        if (detail is SessionDetail.Waiting && answering != null && answeringCard == detail.card) {
            // The same wait, only the count behind it changed: the view (and what is chosen in it) stays.
            more.showMore(detail.more)
            return
        }
        when (detail) {
            is SessionDetail.Waiting -> showWaiting(entry, detail).also { if (focus) it.requestFocusInWindow() }
            is SessionDetail.Running -> setBody(runningBody(detail))
            is SessionDetail.Finished ->
                setBody(
                    finishedBody(
                        detail,
                        drawn.reply.orEmpty(),
                        FinishedActions(
                            review = { askKey -> entry.project.service<TurnChanges>().review(askKey) },
                            continueIn = { bringAndShow(entry.project, entry.sessionId) },
                        ),
                    ),
                )
            SessionDetail.Fresh -> setBody(freshBody())
        }
    }

    private fun showWaiting(
        entry: ChatDirectory.Entry,
        detail: SessionDetail.Waiting,
    ): AnswerView {
        val source = entry.source
        val requestId = detail.card.requestId
        val ask = gate.ask(requestId, { waitingIds(source) }) { answer, failed -> deliver(source, answer, failed) }
        val context =
            AnswerContext(
                project,
                ask,
                { source.view.value.transcript.approvals[requestId] },
                { bringAndShow(entry.project, entry.sessionId) },
                markdown,
            )
        val view = answerView(detail.card, context)
        // Made again for the same request (its failure line came): what the user chose or wrote stays.
        answering?.takeIf { answeringCard?.requestId == requestId }?.let { view.restore(it.draft()) }
        more.showMore(detail.more)
        val shown =
            if (detail.card is PlanCard) {
                JPanel(BorderLayout()).apply {
                    isOpaque = false
                    add(view, BorderLayout.CENTER)
                    add(more, BorderLayout.SOUTH)
                }
            } else {
                scrolling(Column(listOf(view, more)))
            }
        setBody(shown)
        answering = view
        answeringCard = detail.card
        return view
    }

    private fun deliver(
        source: ChatSource,
        answer: CardAnswer,
        failed: () -> Unit,
    ) {
        scope.launch(failures) {
            answerOrMarkFailed(
                {
                    source.respond(answer)
                    // A plan's yes switches the mode after the allow is sent, as the conversation's card does.
                    answer.modeAfter?.let { source.switchMode(it) }
                },
                { withContext(Dispatchers.EDT) { failed() } },
                { thisLogger().warn(it) },
            )
        }
    }

    private fun setBody(content: JComponent?) {
        // The keyboard stays in the pane when what had it goes (an answered view): Swing would hand it to the next
        // component, a header link or the tree, where the next Enter would do something the user did not mean.
        val owner = KeyboardFocusManager.getCurrentKeyboardFocusManager().focusOwner
        val keep = owner != null && SwingUtilities.isDescendingFrom(owner, body)
        if (keep) body.requestFocusInWindow()
        answering = null
        answeringCard = null
        body.removeAll()
        content?.let { body.add(it, BorderLayout.CENTER) }
        if (keep) body.requestFocusInWindow()
        body.revalidate()
        body.repaint()
    }

    private fun drawHeader() {
        val model = item?.let { headerModel(it, project, clock.now()) }
        if (model == shownHeader) return
        shownHeader = model
        header.removeAll()
        model?.let { header.add(headerView(it, headerActions()), BorderLayout.CENTER) }
        header.revalidate()
        header.repaint()
    }

    private fun headerActions() =
        HeaderActions(
            open = { placement -> item?.let { openItem(project, it, placement) } },
            interrupt = {
                (item as? SessionItem.Live)?.entry?.source?.let { source ->
                    scope.launch(failures) { source.interrupt() }
                }
            },
            archive = { (item as? SessionItem.Live)?.let { directory.archive(it.sessionId) } },
        )

    private companion object {
        const val BODY_PAD_V = 10
        const val BODY_PAD_H = 12
        const val TICK_MS = 30_000
    }
}

/** A detail to draw, and its finished reply as blocks (null when it has none). */
private class Drawn(
    val detail: SessionDetail,
    val reply: List<HtmlBlock>?,
)

private suspend fun drawnOf(
    detail: SessionDetail,
    markdown: MarkdownBlocks,
): Drawn = Drawn(detail, (detail as? SessionDetail.Finished)?.lastReply?.let { readAction { markdown.of(it) } })

private fun waitingIds(source: ChatSource): Set<String> =
    source.view.value.conversation.pendingApprovals
        .mapNotNullTo(HashSet()) { approval -> approval.requestId.takeIf { it.isNotEmpty() } }

private fun sameSession(
    a: SessionItem?,
    b: SessionItem?,
): Boolean =
    when {
        a is SessionItem.Live && b is SessionItem.Live ->
            a.sessionId == b.sessionId &&
                a.entry.source === b.entry.source
        a is SessionItem.Mark && b is SessionItem.Mark -> a.sessionId == b.sessionId
        else -> a == null && b == null
    }
