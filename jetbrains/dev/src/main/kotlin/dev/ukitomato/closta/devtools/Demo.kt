package dev.ukitomato.closta.devtools

import com.intellij.ide.ui.LafManager
import com.intellij.notification.Notification
import com.intellij.notification.NotificationsManager
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.EDT
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.ProjectActivity
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.openapi.wm.WindowManager
import com.intellij.openapi.wm.ex.ToolWindowEx
import com.intellij.ui.EditorTextField
import com.intellij.util.ui.UIUtil
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.platforms.intellij.chat.ChatDirectory
import dev.ukitomato.closta.platforms.intellij.chat.ChatPanel
import dev.ukitomato.closta.platforms.intellij.chat.ChatSessions
import dev.ukitomato.closta.platforms.intellij.chat.ChatSource
import dev.ukitomato.closta.platforms.intellij.chat.Placement
import dev.ukitomato.closta.platforms.intellij.chat.TOOL_WINDOW_ID
import dev.ukitomato.closta.platforms.intellij.chat.openNewChat
import dev.ukitomato.closta.platforms.intellij.composer.ToolbarButton
import dev.ukitomato.closta.presenter.view.threadIsRunning
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.awt.image.BufferedImage
import java.nio.file.Files
import java.nio.file.Path
import javax.imageio.ImageIO
import javax.swing.AbstractButton
import javax.swing.JButton
import javax.swing.JComponent
import javax.swing.JRootPane

/**
 * A development aid, off unless the IDE is started with `-Dclosta.demo=<folder>` (`./gradlew :dev:runIde
 * -Pclosta.open=<project> -Pclosta.demo=<folder>`): records the README's animation with a real session. It opens
 * `closta.demo.file` of the project in the editor and made-up sessions waiting and running ([GallerySession]) in the
 * bottom Closta window's Sessions; then, painting the window into `<folder>/frame-NNNNN.png` [FPS] times a second, it
 * opens a new session in the sidebar, types `closta.demo.prompt` into its composer and sends it, presses Allow on each
 * card that waits (at most [MAX_ALLOWS] a turn), moves the conversation to an editor tab once the turn has ended for
 * [TAIL_MS], and goes on there with `closta.demo.next` the same way; then closes the IDE. `done.txt` says how it
 * ended. The CLI is the real one: the prompts are sent to the model.
 */
class Demo : ProjectActivity {
    override suspend fun execute(project: Project) {
        val out = System.getProperty(PROPERTY)?.let(Path::of) ?: return
        var said = "FAILED"
        try {
            withContext(Dispatchers.IO) { Files.createDirectories(out) }
            said = DemoRun(project, out).run()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (
            @Suppress("TooGenericExceptionCaught") failure: Exception,
        ) {
            thisLogger().warn("demo failed", failure)
            said = "FAILED ${failure.message}"
        } finally {
            withContext(NonCancellable + Dispatchers.IO) { Files.writeString(out.resolve("done.txt"), said) }
            withContext(NonCancellable + Dispatchers.EDT) {
                ApplicationManager.getApplication().exit(true, true, false)
            }
        }
    }

    private companion object {
        const val PROPERTY = "closta.demo"
    }
}

@Suppress("TooManyFunctions") // one function per step of the recording
private class DemoRun(
    private val project: Project,
    private val out: Path,
) {
    private var frames = 0

    /** The file [stage] opened, shown again at the end. */
    private var code: VirtualFile? = null

    suspend fun run(): String {
        delay(SETTLE_MS)
        val root = withContext(Dispatchers.EDT) { stage() }
        delay(SETTLE_MS)
        val chosen = withContext(Dispatchers.EDT) { others() }
        delay(SETTLE_MS)
        withContext(Dispatchers.EDT) { settle(chosen) }
        delay(SETTLE_MS)
        withContext(Dispatchers.EDT) { settle(chosen) }
        return coroutineScope {
            val recorder = launch(Dispatchers.Default) { record(root) }
            try {
                delay(LEAD_MS)
                val sidebar = withContext(Dispatchers.EDT) { open() }
                val source = checkNotNull(project.service<ChatSessions>().source(sidebar.sessionId)) { "no session" }
                waitFor(START_TIMEOUT_MS) { source.canSend.value }
                delay(BEFORE_TYPING_MS)
                val first = turn(sidebar, source, System.getProperty(PROMPT) ?: FIRST_PROMPT)
                delay(BEFORE_MOVE_MS)
                withContext(Dispatchers.EDT) {
                    sidebar.moveToOtherPlace()
                    // The emptied sidebar would only say it has no conversation.
                    ToolWindowManager.getInstance(project).getToolWindow(TOOL_WINDOW_ID)?.hide()
                }
                delay(BEFORE_TYPING_MS)
                val tab = withContext(Dispatchers.EDT) { tabPanel(source.sessionId) }
                val second = turn(tab, source, System.getProperty(NEXT_PROMPT) ?: SECOND_PROMPT)
                withContext(Dispatchers.EDT) { code?.let { FileEditorManager.getInstance(project).openFile(it, true) } }
                delay(END_MS)
                if (first == null || second == null) {
                    "FAILED timeout after $frames frames"
                } else {
                    "OK $frames frames, ${first + second} allowed"
                }
            } finally {
                recorder.cancel()
            }
        }
    }

    /** Types [prompt] into [panel], sends it and answers its cards: how many it allowed, null on a timeout. */
    private suspend fun turn(
        panel: ChatPanel,
        source: ChatSource,
        prompt: String,
    ): Int? {
        type(panel, prompt)
        delay(BEFORE_SEND_MS)
        withContext(Dispatchers.EDT) { sendButton(panel).click() }
        return answerUntilDone(panel, source)
    }

    /** The editor tab's panel of [sessionId], after the conversation moved there. EDT. */
    private fun tabPanel(sessionId: String): ChatPanel =
        checkNotNull(
            FileEditorManager
                .getInstance(project)
                .allEditors
                .firstNotNullOfOrNull {
                    (it.component as? ChatPanel)?.takeIf { panel ->
                        panel.sessionId == sessionId
                    }
                },
        ) { "no editor tab" }

    /**
     * Presses Allow on each card that waits (at most [MAX_ALLOWS]) until the turn has ended for [TAIL_MS]; returns how
     * many it allowed, or null when the turn did not end in [TURN_TIMEOUT_MS].
     */
    private suspend fun answerUntilDone(
        panel: ChatPanel,
        source: ChatSource,
    ): Int? {
        var allows = 0
        var ran = false
        var idleSince = 0L
        val deadline = System.currentTimeMillis() + TURN_TIMEOUT_MS
        while (System.currentTimeMillis() < deadline) {
            delay(POLL_MS)
            val view = source.view.value
            val running = threadIsRunning(view.conversation, view.transcript)
            ran = ran || running
            val waiting = withContext(Dispatchers.EDT) { allowButton(panel) } != null
            if (waiting && allows < MAX_ALLOWS) {
                delay(READ_CARD_MS)
                withContext(Dispatchers.EDT) { allowButton(panel)?.doClick() }
                allows++
                idleSince = 0L
            } else if (ran && !running && !waiting) {
                if (idleSince == 0L) idleSince = System.currentTimeMillis()
                if (System.currentTimeMillis() - idleSince > TAIL_MS) return allows
            } else {
                idleSince = 0L
            }
        }
        return null
    }

    /** Switches to the IDE's default theme `closta.demo.theme` names, `light` or `dark`. None: the IDE's. EDT. */
    private fun theme() {
        val name = System.getProperty(THEME) ?: return
        val lafs = LafManager.getInstance()
        val laf =
            when (name) {
                "light" -> lafs.defaultLightLaf
                "dark" -> lafs.defaultDarkLaf
                else -> error("closta.demo.theme is light or dark, not $name")
            }
        lafs.setCurrentLookAndFeel(checkNotNull(laf) { "no default $name theme" }, false)
        lafs.updateUI()
    }

    /** Sizes the window, hides every tool window, hides the offers to buy, and opens the file. EDT. */
    private fun stage(): JRootPane {
        theme()
        val frame = checkNotNull(WindowManager.getInstance().getFrame(project)) { "no frame" }
        frame.setBounds(0, 0, WIDTH, HEIGHT)
        val windows = ToolWindowManager.getInstance(project)
        windows.toolWindowIds.forEach { windows.getToolWindow(it)?.hide() }
        UIUtil
            .uiTraverser(frame.rootPane)
            .filter(JComponent::class.java)
            .filter { component ->
                val text = (component as? AbstractButton)?.text ?: component.accessibleContext?.accessibleName
                text != null && ("Ultimate" in text || "Trial" in text)
            }.forEach { it.isVisible = false }
        val base = checkNotNull(project.basePath) { "no project folder" }
        val name = System.getProperty(FILE) ?: DEFAULT_FILE
        val file = checkNotNull(LocalFileSystem.getInstance().refreshAndFindFileByPath("$base/$name")) { "no $name" }
        FileEditorManager.getInstance(project).openFile(file, true)
        code = file
        return frame.rootPane
    }

    /** Opens a new session in the sidebar, [SIDEBAR] wide, and returns its panel. EDT. */
    private fun open(): ChatPanel {
        openNewChat(project, Placement.SIDEBAR)
        val window = checkNotNull(ToolWindowManager.getInstance(project).getToolWindow(TOOL_WINDOW_ID) as? ToolWindowEx)
        window.show()
        window.stretchWidth(SIDEBAR - window.component.width)
        val panels = window.contentManager.contents.mapNotNull { it.component as? ChatPanel }
        return checkNotNull(panels.lastOrNull()) { "no panel" }
    }

    /**
     * Lists made-up sessions beside the real one (waiting on a question, on a plan, running, finished) and shows the
     * bottom Closta window's Sessions, [SESSIONS] high, as the README's picture has it; returns the plan's id. EDT.
     */
    private fun others(): String {
        val others =
            listOf(
                FixedChatSource(
                    "fix-ci",
                    GallerySession.view(GallerySession.Waits.QUESTION, "Fix the CI cache", MODEL),
                ),
                FixedChatSource(
                    "billing-plan",
                    GallerySession.view(GallerySession.Waits.PLAN, "Plan reissuing invoices from the API", MODEL),
                ),
                FixedChatSource(
                    "explore-api",
                    GallerySession.view(GallerySession.Waits.NOTHING, "Find where the API routes are handled", MODEL),
                ),
                FixedChatSource(
                    "migrate-db",
                    GallerySession.firstTurn(true, "Write the migrations that split the users table", MODEL),
                ),
            )
        val directory = service<ChatDirectory>()
        others.forEach {
            project.service<ChatSessions>().adopt(it)
            directory.register(project, it)
        }
        val probe = SessionsWindowProbe(project)
        val bottom = checkNotNull(probe.window() as? ToolWindowEx) { "no Closta window" }
        bottom.show()
        bottom.contentManager.contents
            .firstOrNull()
            ?.let(bottom.contentManager::setSelectedContent)
        bottom.stretchHeight(SESSIONS - bottom.component.height)
        return others[1].sessionId
    }

    /**
     * Chooses [sessionId] in Sessions, once its list holds it, and expires the balloons saying the made-up sessions
     * wait: they would cover the detail pane. EDT.
     */
    private fun settle(sessionId: String) {
        SessionsWindowProbe(project).panel()?.select(sessionId)
        NotificationsManager
            .getNotificationsManager()
            .getNotificationsOfType(Notification::class.java, project)
            .forEach(Notification::expire)
    }

    /** Types [text] into [panel]'s composer a character at a time, as a person would. */
    private suspend fun type(
        panel: ChatPanel,
        text: String,
    ) {
        val field = withContext(Dispatchers.EDT) { panel.preferredFocus() as EditorTextField }
        withContext(Dispatchers.EDT) { field.requestFocusInWindow() }
        for (ch in text) {
            withContext(Dispatchers.EDT) {
                val document = field.document
                WriteCommandAction.runWriteCommandAction(project) {
                    document.insertString(document.textLength, ch.toString())
                }
                field.editor?.caretModel?.moveToOffset(document.textLength)
            }
            delay(if (ch == ' ') SPACE_MS else KEY_MS)
        }
    }

    private fun sendButton(panel: ChatPanel): ToolbarButton {
        val tip = ClostaBundle.message("composer.send.tooltip")
        return checkNotNull(
            UIUtil.uiTraverser(panel).filter(ToolbarButton::class.java).firstOrNull { it.toolTipText == tip },
        ) { "no send button" }
    }

    private fun allowButton(panel: ChatPanel): JButton? {
        val text = ClostaBundle.message("thread.permission.allow")
        return UIUtil
            .uiTraverser(panel)
            .filter(JButton::class.java)
            .firstOrNull { it.text == text && it.isShowing && it.isEnabled }
    }

    /** Paints [root] [FPS] times a second into numbered PNGs until cancelled. */
    private suspend fun record(root: JRootPane) =
        coroutineScope {
            val step = SECOND_MS / FPS
            var next = System.currentTimeMillis()
            while (isActive) {
                val image =
                    withContext(Dispatchers.EDT) {
                        BufferedImage(root.width, root.height, BufferedImage.TYPE_INT_RGB).also {
                            val g = it.createGraphics()
                            try {
                                root.paint(g)
                            } finally {
                                g.dispose()
                            }
                        }
                    }
                val index = frames++
                write(image, index)
                next += step
                delay((next - System.currentTimeMillis()).coerceAtLeast(0))
            }
        }

    private fun CoroutineScope.write(
        image: BufferedImage,
        index: Int,
    ) = launch(Dispatchers.IO) {
        ImageIO.write(image, "png", out.resolve("frame-%05d.png".format(index)).toFile())
    }

    private suspend fun waitFor(
        timeout: Long,
        condition: () -> Boolean,
    ) {
        val deadline = System.currentTimeMillis() + timeout
        while (!condition()) {
            check(System.currentTimeMillis() < deadline) { "timed out" }
            delay(POLL_MS)
        }
    }

    private companion object {
        const val PROMPT = "closta.demo.prompt"
        const val NEXT_PROMPT = "closta.demo.next"
        const val FILE = "closta.demo.file"
        const val THEME = "closta.demo.theme"
        const val DEFAULT_FILE = "src/AuthService.kt"
        const val FIRST_PROMPT =
            "Retry login up to 3 times on IOException, 200ms apart. Just edit the file, run no commands, " +
                "and reply in one short English line."
        const val SECOND_PROMPT = "Now add a short KDoc to login about the retries. Same rules."
        const val WIDTH = 1600
        const val HEIGHT = 1000
        const val SIDEBAR = 600
        const val SESSIONS = 300
        const val MODEL = "claude-opus-5-5"
        const val FPS = 10
        const val SECOND_MS = 1_000L
        const val SETTLE_MS = 3_000L
        const val LEAD_MS = 1_200L
        const val KEY_MS = 12L
        const val SPACE_MS = 20L
        const val BEFORE_SEND_MS = 500L
        const val BEFORE_TYPING_MS = 800L
        const val BEFORE_MOVE_MS = 1_500L
        const val END_MS = 3_000L
        const val READ_CARD_MS = 2_200L
        const val POLL_MS = 200L
        const val TAIL_MS = 3_500L
        const val MAX_ALLOWS = 4
        const val START_TIMEOUT_MS = 60_000L
        const val TURN_TIMEOUT_MS = 180_000L
    }
}
