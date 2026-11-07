package dev.ukitomato.closta.devtools

import com.intellij.ide.ActivityTracker
import com.intellij.ide.ui.UISettings
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.application.EDT
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.WindowManager
import com.intellij.openapi.wm.ex.ToolWindowEx
import dev.ukitomato.closta.platforms.intellij.chat.ChatDirectory
import dev.ukitomato.closta.platforms.intellij.chat.ChatSessions
import dev.ukitomato.closta.platforms.intellij.chat.ChatSource
import dev.ukitomato.closta.platforms.intellij.chat.WasRunningMark
import dev.ukitomato.closta.platforms.intellij.chat.clearWasRunningMark
import dev.ukitomato.closta.platforms.intellij.chat.markStopped
import dev.ukitomato.closta.platforms.intellij.session.SessionView
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import java.awt.Component
import java.nio.file.Files
import java.nio.file.Path
import java.util.concurrent.atomic.AtomicInteger

/**
 * The gallery's part for the bottom Closta window: lists made-up sessions waiting on each kind of request, running,
 * finished (one unread), never asked, and a mark; jumps to the next waiting one with the window's content not made
 * yet; selects each and paints the window into `sessions-<kind>.png`; answers the Bash one by its keys (first too
 * early, then after the delay) and writes where the keyboard was each time into `sessions-checks.txt`.
 */
internal class SessionsGallery(
    private val project: Project,
    private val out: Path,
    private val shoot: (Component, Path) -> Unit,
) {
    private val checks = StringBuilder()
    private val answers = AtomicInteger()
    private val ids = LinkedHashMap<String, String>()
    private val probe = SessionsWindowProbe(project)

    suspend fun run(shownIds: List<String>) {
        withContext(Dispatchers.EDT) { list(shownIds) }
        delay(SETTLE_MS)
        nextWaitingFirst()
        withContext(Dispatchers.EDT) {
            UISettings.getInstance().showToolWindowsNames = false
            UISettings.getInstance().fireUISettingsChanged()
            val window = probe.window() as? ToolWindowEx
            window?.let { it.stretchHeight(HEIGHT - it.component.height) }
        }
        delay(SETTLE_MS)
        withContext(Dispatchers.EDT) { probe.tree()?.requestFocusInWindow() }
        for ((kind, id) in ids) {
            withContext(Dispatchers.EDT) {
                probe.panel()?.select(id)
                // The toolbar updates on the user's input, of which the gallery makes none.
                ActivityTracker.getInstance().inc()
            }
            delay(SHOT_MS)
            withContext(Dispatchers.EDT) {
                note("shot $kind: focus = ${probe.focusText()}")
                shootWindow("sessions-$kind.png")
            }
            // A body taller than the window: its end too.
            val scrolled = withContext(Dispatchers.EDT) { probe.scrollDetailToEnd() }
            if (scrolled) {
                delay(PAGE_MS)
                withContext(Dispatchers.EDT) { shootWindow("sessions-$kind-end.png") }
            }
        }
        withContext(Dispatchers.EDT) { probe.tree()?.clearSelection() }
        delay(SHOT_MS)
        withContext(Dispatchers.EDT) { shootWindow("sessions-nothing.png") }
        answerBash()
        withContext(Dispatchers.EDT) {
            UISettings.getInstance().showToolWindowsNames = true
            UISettings.getInstance().fireUISettingsChanged()
        }
        delay(SHOT_MS)
        withContext(Dispatchers.EDT) {
            WindowManager.getInstance().getFrame(project)?.let { shoot(it.rootPane, out.resolve("sessions-names.png")) }
            project.clearWasRunningMark(MARK_ID)
        }
        Files.writeString(out.resolve("sessions-checks.txt"), checks)
    }

    // The two chats the gallery opened (in the sidebar and in a tab) are listed too: they show where they are shown.
    private fun list(shownIds: List<String>) {
        val sessions = project.service<ChatSessions>()
        val directory = service<ChatDirectory>()
        shownIds.mapNotNull(sessions::source).forEach { directory.register(project, it) }

        fun add(
            kind: String,
            title: String,
            view: SessionView,
            answered: (ChatSource.Fixed) -> Unit = {},
        ): ChatSource.Fixed {
            lateinit var source: ChatSource.Fixed
            source = ChatSource.Fixed(title, view, answered = { answered(source) })
            sessions.adopt(source)
            directory.register(project, source)
            ids[kind] = source.sessionId
            return source
        }
        // Answered, it goes on as the CLI would: the command allowed and running.
        add(
            "permission",
            "refactor-auth",
            view(GallerySession.Waits.BASH, "Split AuthService into TokenStore"),
        ) { source ->
            answers.incrementAndGet()
            source.push(GallerySession.allowed(source.view.value, GallerySession.BASH_ID))
        }
        add("question", "fix-ci", view(GallerySession.Waits.QUESTION, "Fix the CI cache"))
        add("plan", "billing-plan", view(GallerySession.Waits.PLAN, "Plan reissuing invoices from the API"))
        add(
            "edit",
            "docs-update",
            view(
                GallerySession.Waits.EDIT,
                "Update the build steps in the README and every guide that repeats them, then check the links",
            ),
        )
        add("running", "explore-api", view(GallerySession.Waits.NOTHING, "Find where the API routes are handled"))
        // It finishes while nobody looks at it: unread.
        val migrate = "Write the migrations that split the users table"
        add("finished-unread", "migrate-db", GallerySession.firstTurn(done = false, migrate))
            .push(GallerySession.firstTurn(done = true, migrate))
        add("finished", "spike-lexer", GallerySession.firstTurn(done = true, "Try a hand-written lexer"))
        add("fresh", "New chat", SessionView())
        project.markStopped(MARK_ID, WasRunningMark(title = "Split the billing module"))
        ids["mark"] = MARK_ID
    }

    private fun view(
        waits: GallerySession.Waits,
        ask: String,
    ) = GallerySession.view(waits, ask)

    // Next waiting before the window was ever shown: it must open the window, choose a waiting session and put the
    // keyboard in its answer.
    private suspend fun nextWaitingFirst() {
        withContext(Dispatchers.EDT) {
            val contents = probe.window()?.contentManagerIfCreated?.contentCount
            note("next waiting: window content before = ${contents ?: "none"}")
            val frame = WindowManager.getInstance().getFrame(project)?.rootPane
            val action = ActionManager.getInstance().getAction("Closta.NextWaiting")
            ActionManager.getInstance().tryToExecute(action, null, frame, "ClostaGallery", true)
        }
        delay(SHOT_MS)
        withContext(Dispatchers.EDT) {
            val window = probe.window()
            note("next waiting: visible = ${window?.isVisible}, active = ${window?.isActive}")
            note("next waiting: selected = ${kindOf(probe.panel()?.selectedSessionId())}")
            note("next waiting: focus = ${probe.focusText()}")
            shootWindow("sessions-next-waiting.png")
        }
    }

    // Enter at once (inside the answer delay) must not answer; Enter after the delay must, and the keyboard must stay
    // in the detail pane once the answered view goes.
    private suspend fun answerBash() {
        val id = ids["permission"] ?: return
        withContext(Dispatchers.EDT) {
            probe.panel()?.select(id)
            probe.panel()?.focusAnswer()
        }
        delay(RENDER_MS)
        withContext(Dispatchers.EDT) {
            note("answer: chosen and asked for the keyboard, focus = ${probe.focusText()}")
            probe.pressEnter()
        }
        delay(RENDER_MS)
        withContext(Dispatchers.EDT) { note("answer: Enter inside the delay answered ${answers.get()} time(s)") }
        delay(DELAY_PASSED_MS)
        withContext(Dispatchers.EDT) {
            note("answer: before Enter, focus = ${probe.focusText()}")
            probe.pressEnter()
        }
        delay(SHOT_MS)
        withContext(Dispatchers.EDT) {
            note("answer: Enter after the delay answered ${answers.get()} time(s)")
            note("answer: after, focus = ${probe.focusText()}")
            shootWindow("sessions-answered.png")
        }
    }

    private fun kindOf(sessionId: String?): String =
        ids.entries.firstOrNull { it.value == sessionId }?.key ?: "$sessionId"

    private fun note(line: String) {
        checks.append(line).append('\n')
    }

    private fun shootWindow(name: String) {
        probe.decorated()?.let { shoot(it, out.resolve(name)) }
    }

    private companion object {
        const val MARK_ID = "gallery-mark"
        const val HEIGHT = 340
        const val SETTLE_MS = 2_000L
        const val SHOT_MS = 1_200L
        const val PAGE_MS = 600L
        const val RENDER_MS = 300L
        const val DELAY_PASSED_MS = 700L
    }
}
