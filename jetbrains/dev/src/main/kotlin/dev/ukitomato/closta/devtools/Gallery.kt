package dev.ukitomato.closta.devtools

import com.intellij.codeInsight.daemon.impl.analysis.FileHighlightingSetting.SKIP_INSPECTION
import com.intellij.codeInsight.daemon.impl.analysis.HighlightingSettingsPerFile
import com.intellij.ide.ui.LafManager
import com.intellij.ide.ui.UISettings
import com.intellij.notification.Notification
import com.intellij.notification.NotificationsManager
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.EDT
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.ex.FileEditorManagerEx
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.ProjectActivity
import com.intellij.openapi.ui.popup.JBPopup
import com.intellij.openapi.ui.popup.JBPopupFactory
import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.openapi.wm.WindowManager
import com.intellij.openapi.wm.ex.ToolWindowEx
import com.intellij.psi.PsiManager
import com.intellij.testFramework.LightVirtualFile
import com.intellij.ui.components.JBScrollPane
import com.intellij.util.ui.UIUtil
import dev.ukitomato.closta.platforms.intellij.chat.ChatDirectory
import dev.ukitomato.closta.platforms.intellij.chat.ChatPanel
import dev.ukitomato.closta.platforms.intellij.chat.ChatSessions
import dev.ukitomato.closta.platforms.intellij.chat.ChatSource
import dev.ukitomato.closta.platforms.intellij.chat.ChatVirtualFile
import dev.ukitomato.closta.platforms.intellij.chat.LastChat
import dev.ukitomato.closta.platforms.intellij.chat.McpPanel
import dev.ukitomato.closta.platforms.intellij.chat.Placement
import dev.ukitomato.closta.platforms.intellij.chat.TOOL_WINDOW_ID
import dev.ukitomato.closta.platforms.intellij.chat.openChat
import dev.ukitomato.closta.platforms.intellij.composer.ATTACH_BUTTON
import dev.ukitomato.closta.platforms.intellij.composer.ToolbarButton
import dev.ukitomato.closta.platforms.intellij.session.SessionFailure
import dev.ukitomato.closta.platforms.intellij.session.SessionNotice
import dev.ukitomato.closta.platforms.intellij.session.SessionStatus
import dev.ukitomato.closta.platforms.intellij.session.SessionView
import dev.ukitomato.closta.platforms.intellij.sessions.SESSIONS_TOOL_WINDOW_ID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import java.awt.Component
import java.awt.Point
import java.awt.image.BufferedImage
import java.nio.file.Files
import java.nio.file.Path
import javax.imageio.ImageIO
import javax.swing.AbstractButton
import javax.swing.JComponent
import javax.swing.JLabel
import javax.swing.JLayeredPane
import javax.swing.SwingUtilities
import kotlin.math.roundToInt

/**
 * A development aid, off unless the IDE is started with `-Dclosta.gallery=<folder>` (`./gradlew runIde
 * -Pclosta.gallery=<folder>`): paints into PNGs in the folder the window, [GallerySession] in the sidebar (420px, then
 * 300px) and in an editor tab (scrolled a screen at a time), the composer starting, failed, ended, in Bypass and ready
 * to send, its model, mode and attach popups, an editor tab whose session is gone, the MCP tab, and the bottom Closta
 * window with each kind of session chosen ([SessionsGallery]), and the README's picture (`showcase.png`); then closes
 * the IDE. `-Dclosta.gallery.theme=light|dark` paints in the IDE's default light or dark theme,
 * `-Dclosta.gallery.scale=2` at twice the size, and `-Dclosta.gallery.only=showcase` paints only `showcase.png`. Each
 * scene is painted on its own: one that fails is written to `done.txt` as `FAILED <file>` and the others still are
 * (`FAILED stage:<step>` when a step between them fails, which ends the run). No CLI is started.
 */
class Gallery : ProjectActivity {
    override suspend fun execute(project: Project) {
        val out = System.getProperty(PROPERTY)?.let(Path::of) ?: return
        try {
            withContext(Dispatchers.EDT) { Files.createDirectories(out) }
            GalleryRun(project, out).run()
        } catch (
            @Suppress("TooGenericExceptionCaught") failure: Exception,
        ) {
            thisLogger().warn("gallery failed", failure)
        } finally {
            withContext(Dispatchers.EDT) { ApplicationManager.getApplication().exit(true, true, false) }
        }
    }

    private companion object {
        const val PROPERTY = "closta.gallery"
    }
}

/** The conversations the scenes show: the cards waiting, the first turn done, the first turn still thinking. */
private class GalleryViews(
    val waiting: SessionView,
    val idle: SessionView,
    val running: SessionView,
)

/** One run of the gallery: each scene opens what it paints, paints it, and closes it again. */
@Suppress("TooManyFunctions") // one function per scene
private class GalleryRun(
    private val project: Project,
    private val out: Path,
) {
    private val done = ArrayList<String>()
    private val sessions get() = project.service<ChatSessions>()

    /** What [run] is doing now: a failure outside a scene is written to `done.txt` as `FAILED stage:<this>`. */
    private var stage = "start"

    suspend fun run() {
        try {
            scenes()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (
            @Suppress("TooGenericExceptionCaught") failure: Exception,
        ) {
            thisLogger().warn("gallery: $stage failed", failure)
            done += "FAILED stage:$stage"
        } finally {
            withContext(NonCancellable) { Files.writeString(out.resolve("done.txt"), done.joinToString("\n")) }
        }
    }

    private suspend fun scenes() {
        delay(SETTLE_MS)
        stage = "theme"
        withContext(Dispatchers.EDT) { theme() }
        delay(SETTLE_MS)
        if (System.getProperty(ONLY) == "showcase") {
            stage = "showcase"
            showcase()
            return
        }
        val views =
            withContext(Dispatchers.Default) {
                GalleryViews(
                    GallerySession.view(),
                    GallerySession.firstTurn(done = true),
                    GallerySession.firstTurn(done = false),
                )
            }
        withContext(Dispatchers.EDT) {
            WindowManager.getInstance().getFrame(project)?.setBounds(0, 0, FRAME_WIDTH, FRAME_HEIGHT)
            val windows = ToolWindowManager.getInstance(project)
            windows.toolWindowIds.filter { it != TOOL_WINDOW_ID }.forEach { windows.getToolWindow(it)?.hide() }
            windows.getToolWindow(TOOL_WINDOW_ID)?.show()
        }
        delay(SETTLE_MS)
        stage = "conversation"
        val opened = conversation(views.waiting)
        try {
            stage = "frames"
            frames()
            stage = "pages"
            val (sidebar, tab) = withContext(Dispatchers.EDT) { sidebarPanel() to editorPanel() }
            sidebar?.let { scene("sidebar-${SIDEBAR_WIDTH}px-*.png") { pages("sidebar", it) } }
            tab?.let { scene("editor-*.png") { pages("editor", it) } }
            stage = "narrow sidebar"
            sidebar?.let { narrowSidebar(it) }
        } finally {
            // Closed before the scenes after it: a conversation left in view would be the one the MCP tab follows.
            withContext(Dispatchers.EDT + NonCancellable) { closeAll(opened) }
        }
        stage = "states"
        states(views)
        stage = "editor ended"
        editorEnded()
        stage = "mcp"
        mcp(views.idle)
        stage = "showcase"
        showcase()
        stage = "sessions window"
        sessionsWindow(views.waiting)
        stage = "end"
    }

    /** Switches to the IDE's default theme `closta.gallery.theme` names, `light` or `dark`. None: the IDE's. EDT. */
    private fun theme() {
        val name = System.getProperty(THEME) ?: return
        val lafs = LafManager.getInstance()
        val laf =
            when (name) {
                "light" -> lafs.defaultLightLaf
                "dark" -> lafs.defaultDarkLaf
                else -> error("closta.gallery.theme is light or dark, not $name")
            }
        lafs.setCurrentLookAndFeel(checkNotNull(laf) { "no default $name theme" }, false)
        lafs.updateUI()
    }

    /**
     * The README's picture: the window [SHOWCASE_WIDTH] by [SHOWCASE_HEIGHT] without the tool window bars, only a
     * Kotlin file in the editor (not inspected), the sidebar showing a conversation waiting on an edit of the file, and
     * the bottom Closta window's Sessions listing it among others (waiting on a question, on a plan, running,
     * finished), the question chosen. The IDE's offers to buy a product are hidden while it is painted.
     */
    private suspend fun showcase() =
        scene("showcase.png") {
            val all = withContext(Dispatchers.Default) { showcaseSources() }
            val file = LightVirtualFile("AuthService.kt", SHOWCASE_CODE)
            val probe = SessionsWindowProbe(project)
            val frame = withContext(Dispatchers.EDT) { checkNotNull(WindowManager.getInstance().getFrame(project)) }
            var hidden = emptyList<JComponent>()
            try {
                withContext(Dispatchers.EDT) { showcaseOpen(frame.rootPane, file, all, probe) }
                delay(SETTLE_MS)
                withContext(Dispatchers.EDT) {
                    stretch(SHOWCASE_SIDEBAR)
                    (probe.window() as? ToolWindowEx)?.let { it.stretchHeight(SHOWCASE_SESSIONS - it.component.height) }
                    probe.panel()?.select(all[1].sessionId)
                }
                delay(PAGE_MS)
                withContext(Dispatchers.EDT) { sidebarPanel(all[0].sessionId)?.let(::scrollToEnd) }
                delay(ANALYSIS_MS)
                withContext(Dispatchers.EDT) {
                    hidden = quiet(frame.rootPane)
                    shoot(frame.rootPane, "showcase.png")
                }
            } finally {
                withContext(Dispatchers.EDT + NonCancellable) {
                    hidden.forEach { it.isVisible = true }
                    UISettings.getInstance().hideToolStripes = false
                    UISettings.getInstance().fireUISettingsChanged()
                    FileEditorManager.getInstance(project).closeFile(file)
                    closeAll(all)
                    probe.window()?.hide()
                    frame.setBounds(0, 0, FRAME_WIDTH, FRAME_HEIGHT)
                    stretch(SIDEBAR_WIDTH)
                }
            }
        }

    /** The showcase's sessions: the one in the sidebar (waiting on an edit) first, the one chosen in Sessions next. */
    private fun showcaseSources(): List<ChatSource.Fixed> =
        listOf(
            ChatSource.Fixed("retry-login", GallerySession.view(GallerySession.Waits.EDIT, model = MODEL)),
            showcaseSource("fix-ci", GallerySession.Waits.QUESTION, "Fix the CI cache"),
            showcaseSource("billing-plan", GallerySession.Waits.PLAN, "Plan reissuing invoices from the API"),
            showcaseSource("explore-api", GallerySession.Waits.NOTHING, "Find where the API routes are handled"),
            ChatSource.Fixed(
                "migrate-db",
                GallerySession.firstTurn(true, "Write the migrations that split the users table", MODEL),
            ),
        )

    private fun showcaseSource(
        title: String,
        waits: GallerySession.Waits,
        ask: String,
    ) = ChatSource.Fixed(title, GallerySession.view(waits, ask, MODEL))

    /**
     * Sizes the window of [root], leaves only [file] in the editor and only the sidebar open, lists [sources], opens
     * the first in the sidebar and shows the bottom Closta window's Sessions. EDT.
     */
    private fun showcaseOpen(
        root: JComponent,
        file: LightVirtualFile,
        sources: List<ChatSource.Fixed>,
        probe: SessionsWindowProbe,
    ) {
        UISettings.getInstance().showToolWindowsNames = false
        UISettings.getInstance().hideToolStripes = true
        UISettings.getInstance().fireUISettingsChanged()
        SwingUtilities.getWindowAncestor(root)?.setBounds(0, 0, SHOWCASE_WIDTH, SHOWCASE_HEIGHT)
        val windows = ToolWindowManager.getInstance(project)
        windows.toolWindowIds.filter { it != TOOL_WINDOW_ID }.forEach { windows.getToolWindow(it)?.hide() }
        val editors = FileEditorManager.getInstance(project)
        editors.openFiles.forEach(editors::closeFile)
        // Its types are nowhere: the inspections would mark them.
        PsiManager.getInstance(project).findFile(file)?.let {
            HighlightingSettingsPerFile.getInstance(project).setHighlightingSettingForRoot(it, SKIP_INSPECTION)
        }
        check(editors.openFile(file, true).isNotEmpty()) { "not opened" }
        val directory = service<ChatDirectory>()
        sources.forEach {
            sessions.adopt(it)
            directory.register(project, it)
        }
        check(openChat(project, sources.first().sessionId, Placement.SIDEBAR)) { "not opened" }
        val bottom = checkNotNull(probe.window()) { "no Closta window" }
        bottom.show()
        bottom.contentManager.contents
            .firstOrNull()
            ?.let(bottom.contentManager::setSelectedContent)
    }

    /**
     * Clears what would cover the windows of [root] in a picture: it expires the balloons saying the sessions wait, and
     * hides and returns the offers to buy a product and the IDE's error balloon and icon (a window larger than the
     * screen is an error under Wayland). EDT.
     */
    private fun quiet(root: JComponent): List<JComponent> {
        NotificationsManager
            .getNotificationsManager()
            .getNotificationsOfType(Notification::class.java, project)
            .forEach(Notification::expire)
        val hidden = offers(root) + ideErrors(root)
        hidden.forEach { it.isVisible = false }
        root.validate()
        return hidden
    }

    /**
     * The IDE's error balloon (the layer holding the text "IDE error") and the status bar's error icon, found by its
     * class name: the class is internal to the IDE. EDT.
     */
    private fun ideErrors(root: JComponent): List<JComponent> {
        val all = UIUtil.uiTraverser(root).filter(JComponent::class.java).toList()
        val balloons =
            all
                .filter { (it as? JLabel)?.text?.contains("IDE error") == true }
                .mapNotNull { label ->
                    generateSequence<Component>(label) { it.parent }.firstOrNull { it.parent is JLayeredPane }
                }.filterIsInstance<JComponent>()
        return balloons + all.filter { it.javaClass.simpleName == "IdeMessagePanel" }
    }

    /** Scrolls [panel]'s thread to its end. EDT. */
    private fun scrollToEnd(panel: ChatPanel) {
        val scroll = UIUtil.uiTraverser(panel.surfaceComponent()).filter(JBScrollPane::class.java).first() ?: return
        val view = scroll.viewport.view
        scroll.viewport.viewPosition = Point(0, (view.height - scroll.viewport.height).coerceAtLeast(0))
    }

    /** The buttons in [root] that offer to buy or try a product, such as "Unlock Ultimate". EDT. */
    private fun offers(root: JComponent): List<JComponent> =
        UIUtil
            .uiTraverser(root)
            .filter(JComponent::class.java)
            .filter { component ->
                val text = (component as? AbstractButton)?.text ?: component.accessibleContext?.accessibleName
                text != null && OFFERS.any { it in text }
            }.toList()

    /** Runs one scene; a failure is logged and written down, and the next scene still runs. */
    private suspend fun scene(
        name: String,
        paint: suspend () -> Unit,
    ) {
        try {
            paint()
            done += name
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (
            @Suppress("TooGenericExceptionCaught") failure: Exception,
        ) {
            thisLogger().warn("gallery: $name failed", failure)
            done += "FAILED $name"
        }
    }

    /**
     * Opens [view] in the sidebar and in an editor tab, the sidebar [SIDEBAR_WIDTH] wide, for the frames and the pages;
     * returns the two sessions, for [closeAll].
     */
    private suspend fun conversation(view: SessionView): List<ChatSource> {
        val opened =
            listOf(ChatSource.Fixed("Gallery (sidebar)", view), ChatSource.Fixed("Gallery (tab)", view))
        withContext(Dispatchers.EDT) {
            opened.forEach { sessions.adopt(it) }
            openChat(project, opened[0].sessionId, Placement.SIDEBAR)
            openChat(project, opened[1].sessionId, Placement.EDITOR_TAB)
        }
        delay(SETTLE_MS)
        withContext(Dispatchers.EDT) { stretch(SIDEBAR_WIDTH) }
        delay(SETTLE_MS)
        return opened
    }

    /** Closes the sidebar tabs and editor tabs of [sources] and stops them. EDT. */
    private fun closeAll(sources: List<ChatSource>) {
        val ids: Set<String?> = sources.map { it.sessionId }.toSet()
        window()?.contentManager?.let { contents ->
            contents.contents
                .filter { (it.component as? ChatPanel)?.sessionId in ids }
                .forEach { contents.removeContent(it, true) }
        }
        val editors = FileEditorManager.getInstance(project)
        editors.openFiles.filter { (it as? ChatVirtualFile)?.sessionId in ids }.forEach(editors::closeFile)
        sources.forEach { sessions.stop(it.sessionId) }
    }

    private suspend fun frames() {
        val frame = withContext(Dispatchers.EDT) { WindowManager.getInstance().getFrame(project) } ?: return
        scene("frame.png") { withContext(Dispatchers.EDT) { shoot(frame.rootPane, "frame.png") } }
        // The tool window bars with their names shown, as the user has them on Windows.
        withContext(Dispatchers.EDT) {
            UISettings.getInstance().showToolWindowsNames = true
            UISettings.getInstance().fireUISettingsChanged()
        }
        delay(PAGE_MS)
        scene("frame-names.png") { withContext(Dispatchers.EDT) { shoot(frame.rootPane, "frame-names.png") } }
    }

    /** The sidebar's conversation again at [NARROW_WIDTH] (`sidebar-300px-N`), then back at [SIDEBAR_WIDTH]. */
    private suspend fun narrowSidebar(sidebar: ChatPanel) {
        scene("sidebar-${NARROW_WIDTH}px-*.png") {
            withContext(Dispatchers.EDT) { stretch(NARROW_WIDTH) }
            delay(SETTLE_MS)
            // A stretch that did not take would paint over the 420px pages.
            val width = withContext(Dispatchers.EDT) { sidebar.width }
            check(width == NARROW_WIDTH) { "the sidebar is $width wide" }
            pages("sidebar", sidebar)
        }
        withContext(Dispatchers.EDT) { stretch(SIDEBAR_WIDTH) }
        delay(PAGE_MS)
    }

    private suspend fun states(views: GalleryViews) {
        sidebarScene(
            "state-starting.png",
            ChatSource.Fixed("Gallery (starting)", SessionView(), notice = SessionNotice.of(SessionStatus.Starting)),
        )
        sidebarScene(
            "state-failed.png",
            ChatSource.Fixed(
                "Gallery (failed)",
                SessionView(),
                notice = SessionNotice.of(SessionStatus.Failed(SessionFailure.CommandNotFound)),
            ),
        )
        sidebarScene(
            "state-ended.png",
            ChatSource.Fixed("Gallery (ended)", views.idle, notice = SessionNotice.of(SessionStatus.Ended)),
        )
        sidebarScene(
            "state-bypass.png",
            ChatSource.Fixed(
                "Gallery (bypass)",
                GallerySession.withMode(views.idle, "bypassPermissions"),
                canSend = true,
            ),
        )
        sidebarScene(
            "state-ready.png",
            ChatSource.Fixed("Gallery (ready)", views.idle, canSend = true),
            listOf("popup-model.png", "popup-mode.png", "popup-attach.png"),
        ) { panel ->
            popup(panel, "popup-model.png") { it.getOrNull(2) }
            popup(panel, "popup-mode.png") { it.getOrNull(1) }
            popup(panel, "popup-attach.png") { it.getOrNull(0) }
        }
    }

    /**
     * Opens [source] in the sidebar, paints its panel as [file], runs [then] on it, and closes and disposes it. When
     * the panel could not be painted, the scenes [then] would paint ([dependents]) are written down as failed.
     */
    private suspend fun sidebarScene(
        file: String,
        source: ChatSource.Fixed,
        dependents: List<String> = emptyList(),
        then: suspend (ChatPanel) -> Unit = {},
    ) {
        var painted: ChatPanel? = null
        try {
            scene(file) {
                val panel =
                    withContext(Dispatchers.EDT) {
                        sessions.adopt(source)
                        check(openChat(project, source.sessionId, Placement.SIDEBAR)) { "not opened" }
                        checkNotNull(sidebarPanel(source.sessionId)) { "no panel" }
                    }
                delay(SETTLE_MS)
                withContext(Dispatchers.EDT) { shoot(panel, file) }
                painted = panel
            }
            val panel = painted
            if (panel == null) dependents.forEach { done += "FAILED $it" } else then(panel)
        } finally {
            withContext(Dispatchers.EDT + NonCancellable) { closeAll(listOf(source)) }
        }
    }

    /**
     * Presses the composer's button [pick] chooses of attach, mode and model (as a click would), paints the popup that
     * opens as [file], and cancels every popup the press opened, found or not.
     */
    private suspend fun popup(
        panel: ChatPanel,
        file: String,
        pick: (List<ToolbarButton>) -> ToolbarButton?,
    ) = scene(file) {
        val (root, before) =
            withContext(Dispatchers.EDT) {
                val root = checkNotNull(SwingUtilities.getRootPane(panel)) { "no window" }
                root to JBPopupFactory.getInstance().getChildPopups(root).toSet()
            }

        fun opened() = JBPopupFactory.getInstance().getChildPopups(root).filter { it !in before }
        try {
            val popup =
                withContext(Dispatchers.EDT) {
                    val button = checkNotNull(pick(composerButtons(panel))) { "no button" }
                    button.click()
                    checkNotNull(opened().firstOrNull()) { "no popup" }
                }
            delay(PAGE_MS)
            withContext(Dispatchers.EDT) { shoot(popup.content, file) }
        } finally {
            withContext(Dispatchers.EDT + NonCancellable) { opened().forEach(JBPopup::cancel) }
        }
    }

    /** The composer's attach, mode and model buttons, in that order: the attach button and the two after it. */
    private fun composerButtons(panel: ChatPanel): List<ToolbarButton> {
        val attach =
            UIUtil
                .uiTraverser(panel)
                .filter(ToolbarButton::class.java)
                .firstOrNull { it.name == ATTACH_BUTTON } ?: return emptyList()
        return attach.parent.components
            .filterIsInstance<ToolbarButton>()
            .take(COMPOSER_BUTTONS)
    }

    /** An editor tab whose session is gone (the IDE reopened it after the session ended): the editor area. */
    private suspend fun editorEnded() =
        scene("editor-ended.png") {
            val file = ChatVirtualFile("gallery-ended", "Gallery (ended chat)")
            val editors = FileEditorManager.getInstance(project)
            try {
                withContext(Dispatchers.EDT) { check(editors.openFile(file, true).isNotEmpty()) { "not opened" } }
                delay(SETTLE_MS)
                withContext(Dispatchers.EDT) {
                    val area = checkNotNull((editors as FileEditorManagerEx).component) { "no editor area" }
                    shoot(area, "editor-ended.png")
                }
            } finally {
                withContext(Dispatchers.EDT) { editors.closeFile(file) }
            }
        }

    /** The MCP tab showing a conversation whose CLI listed three servers ([GallerySession.withMcp]). */
    private suspend fun mcp(idle: SessionView) =
        scene("mcp.png") {
            val source = ChatSource.Fixed("Gallery (MCP)", GallerySession.withMcp(idle))
            try {
                withContext(Dispatchers.EDT) {
                    sessions.adopt(source)
                    project.service<LastChat>().shown(source.sessionId)
                }
                toolWindowTab("mcp.png", SESSIONS_TOOL_WINDOW_ID) { it is McpPanel }
            } finally {
                withContext(Dispatchers.EDT) { sessions.stop(source.sessionId) }
            }
        }

    /**
     * The bottom Closta window ([SessionsGallery]), last: it opens [view] in the sidebar and in a tab again, so the
     * tree shows where they are, adds a session of each kind and leaves them open, as the IDE closes after it.
     */
    private suspend fun sessionsWindow(view: SessionView) =
        scene("sessions-*.png") {
            val opened = conversation(view)
            withContext(Dispatchers.EDT) {
                // The MCP scene left its tab chosen in the same window.
                ToolWindowManager.getInstance(project).getToolWindow(SESSIONS_TOOL_WINDOW_ID)?.contentManager?.let {
                    it.contents.firstOrNull()?.let(it::setSelectedContent)
                }
            }
            SessionsGallery(project, out) { component, file -> shoot(component, file.fileName.toString()) }
                .run(opened.map { it.sessionId })
        }

    private suspend fun toolWindowTab(
        file: String,
        id: String,
        which: (JComponent) -> Boolean,
    ) {
        val window =
            withContext(Dispatchers.EDT) {
                val window = checkNotNull(ToolWindowManager.getInstance(project).getToolWindow(id)) { "no tool window" }
                window.show()
                val content = checkNotNull(window.contentManager.contents.firstOrNull { which(it.component) })
                window.contentManager.setSelectedContent(content)
                window
            }
        delay(SETTLE_MS)
        withContext(Dispatchers.EDT) { shoot(window.component, file) }
    }

    /** Paints [panel] a screen at a time from the top of its thread to the bottom: `<name>-<width>px-<page>.png`. */
    private suspend fun pages(
        name: String,
        panel: ChatPanel,
    ) {
        val scroll =
            withContext(Dispatchers.EDT) {
                UIUtil.uiTraverser(panel.surfaceComponent()).filter(JBScrollPane::class.java).first()
            } ?: return
        var page = 0
        var top = 0
        while (page < MAX_PAGES) {
            val more =
                withContext(Dispatchers.EDT) {
                    scroll.viewport.viewPosition = Point(0, top)
                    scroll.viewport.view.height > top + scroll.viewport.height
                }
            delay(PAGE_MS)
            withContext(Dispatchers.EDT) {
                shoot(panel, "$name-${panel.width}px-$page.png")
                top = scroll.viewport.viewPosition.y + scroll.viewport.height - OVERLAP
            }
            page++
            if (!more) break
        }
    }

    private fun window() = ToolWindowManager.getInstance(project).getToolWindow(TOOL_WINDOW_ID) as? ToolWindowEx

    private fun stretch(width: Int) {
        window()?.let { it.stretchWidth(width - it.component.width) }
    }

    /** The sidebar's conversation panel: of [sessionId], or the first one when null. */
    private fun sidebarPanel(sessionId: String? = null): ChatPanel? =
        window()
            ?.contentManager
            ?.contents
            ?.mapNotNull { it.component as? ChatPanel }
            ?.firstOrNull { sessionId == null || it.sessionId == sessionId }

    private fun editorPanel(): ChatPanel? =
        FileEditorManager
            .getInstance(project)
            .allEditors
            .firstNotNullOfOrNull { it.component as? ChatPanel }

    private fun shoot(
        component: Component,
        file: String,
    ) {
        val scale = System.getProperty(SCALE)?.toDoubleOrNull() ?: 1.0
        val width = (component.width.coerceAtLeast(1) * scale).roundToInt()
        val height = (component.height.coerceAtLeast(1) * scale).roundToInt()
        val image = BufferedImage(width, height, TYPE)
        val g = image.createGraphics()
        try {
            g.scale(scale, scale)
            component.paint(g)
        } finally {
            g.dispose()
        }
        ImageIO.write(image, "png", out.resolve(file).toFile())
    }

    private companion object {
        const val SETTLE_MS = 3_000L
        const val PAGE_MS = 600L
        const val FRAME_WIDTH = 1400
        const val FRAME_HEIGHT = 1000
        const val SIDEBAR_WIDTH = 420
        const val NARROW_WIDTH = 300
        const val MAX_PAGES = 8
        const val OVERLAP = 40
        const val COMPOSER_BUTTONS = 3
        const val TYPE = BufferedImage.TYPE_INT_RGB
        const val THEME = "closta.gallery.theme"
        const val SCALE = "closta.gallery.scale"
        const val ONLY = "closta.gallery.only"
        const val SHOWCASE_WIDTH = 1680
        const val SHOWCASE_HEIGHT = 1050
        const val SHOWCASE_SIDEBAR = 660
        const val SHOWCASE_SESSIONS = 330

        /** Long enough for the editor to finish its analysis, whose label would be in the picture. */
        const val ANALYSIS_MS = 9_000L
        const val MODEL = "claude-opus-5-5"
        val OFFERS = listOf("Ultimate", "Upgrade", "Trial")
        val SHOWCASE_CODE =
            """
            |import java.io.IOException
            |
            |/** Signs users in and out. */
            |class AuthService(
            |    private val api: AuthApi,
            |    private val tokens: TokenStore,
            |) {
            |    fun login(c: Credentials) = api.login(c)
            |
            |    fun refresh(token: Token): Token {
            |        val fresh = api.refresh(token)
            |        tokens.save(fresh)
            |        return fresh
            |    }
            |
            |    fun logout(token: Token) {
            |        api.revoke(token)
            |        tokens.clear()
            |    }
            |}
            |
            |class LoginFailed(cause: IOException) : Exception(cause)
            |
            """.trimMargin()
    }
}
