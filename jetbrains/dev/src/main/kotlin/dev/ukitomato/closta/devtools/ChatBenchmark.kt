package dev.ukitomato.closta.devtools

import com.intellij.openapi.application.ApplicationInfo
import com.intellij.openapi.application.EDT
import com.intellij.openapi.application.PathManager
import com.intellij.openapi.components.service
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.SystemInfo
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.scale.JBUIScale
import dev.ukitomato.closta.platforms.intellij.chat.ChatPanel
import dev.ukitomato.closta.platforms.intellij.chat.ChatSessions
import dev.ukitomato.closta.platforms.intellij.chat.ChatVirtualFile
import dev.ukitomato.closta.platforms.intellij.session.SessionView
import dev.ukitomato.closta.presenter.view.PresenterInput
import dev.ukitomato.closta.providers.claude.protocol.StreamJsonCodec
import dev.ukitomato.closta.providers.claude.synthetic.SyntheticSession
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import java.awt.event.MouseEvent
import java.awt.event.MouseWheelEvent
import java.nio.file.Files
import java.nio.file.Path
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import javax.swing.JComponent
import javax.swing.SwingUtilities

/**
 * Measures the chat against the IDE's own editor (the baseline) on the same made-up largest session, in the IDE it
 * runs in: how long it takes to open and settle, the heap it keeps, how the EDT keeps up while the wheel scrolls it,
 * and how long each draw takes while a long reply streams in at its end. Each is measured twice (the first run pays
 * for class loading). The report is Markdown, written next to the IDE's log.
 */
class ChatBenchmark(
    private val project: Project,
) {
    private val rows = mutableListOf<String>()
    private val profiles = mutableListOf<String>()
    private var display = ""
    private lateinit var sampler: EdtSampler

    suspend fun run(progress: (String) -> Unit): Path {
        progress("Building a huge session")
        val foldStart = System.nanoTime()
        val (history, tail) = withContext(Dispatchers.Default) { history() to tail() }
        val foldMs = (System.nanoTime() - foldStart) / FrameWatch.NANOS_PER_MS
        sampler = EdtSampler(withContext(Dispatchers.EDT) { Thread.currentThread() }).also { it.start() }
        try {
            for (kind in Target.entries) {
                for (round in 1..ROUNDS) {
                    progress("Measuring ${kind.label} ($round/$ROUNDS)")
                    withContext(Dispatchers.EDT) { measure(kind, round, history, tail) }
                }
            }
        } finally {
            sampler.stop()
        }
        return write(foldMs)
    }

    private fun history(): SessionView =
        SyntheticSession.turns().foldIndexed(SessionView()) { index, view, turn ->
            turn.lines.fold(view.sent(PresenterInput.UserSent("bench-u$index", turn.prompt))) { next, line ->
                next.event(PresenterInput.Event(StreamJsonCodec.decode(line)))
            }
        }

    private fun tail(): List<String> = ReplayLines.load()

    @Suppress("LongMethod") // one round, step by step
    private suspend fun measure(
        kind: Target,
        round: Int,
        history: SessionView,
        tail: List<String>,
    ) {
        val watch = FrameWatch().also { it.start() }
        val renders = mutableListOf<Long>()
        ChatPanel.onRender = { renders += it }
        try {
            settleHeap()
            val heapBefore = usedHeapMb()
            val source = FixedChatSource("benchmark", history)
            val file: VirtualFile =
                when (kind) {
                    Target.EDITOR -> BaselineVirtualFile(source)
                    Target.CHAT ->
                        ChatVirtualFile(project.service<ChatSessions>().adopt(source), source.title)
                }
            watch.reset()
            sampler.reset()
            val opened = System.nanoTime()
            FileEditorManager.getInstance(project).openFile(file, true)
            val settled =
                withTimeoutOrNull(SETTLE_TIMEOUT_MS) {
                    while (renders.isEmpty() || !watch.quietFor(QUIET_MS)) delay(FrameWatch.TICK_MS)
                } != null
            val openMs = (watch.lastBusyAt() - opened).coerceAtLeast(0) / FrameWatch.NANOS_PER_MS
            val firstRenderMs = renders.firstOrNull()?.div(FrameWatch.NANOS_PER_MS) ?: -1
            val profile = mutableListOf<String>()
            profile += sampler.report("open")
            settleHeap()
            val keptMb = usedHeapMb() - heapBefore

            val surface = surfaceOf(file)
            if (display.isEmpty() && surface != null) display = display(surface)
            watch.reset()
            sampler.reset()
            val dispatch = mutableListOf<Long>()
            if (surface != null) {
                repeat(WHEEL_STEPS) { wheel(surface, UP, dispatch) }
                repeat(WHEEL_STEPS) { wheel(surface, DOWN, dispatch) }
            }
            val scroll = watch.stats()
            profile += sampler.report("scroll")
            val dispatchStats = FrameWatch.Stats.of(dispatch.map { it / FrameWatch.NANOS_PER_MS })

            delay(QUIET_MS)
            watch.reset()
            sampler.reset()
            renders.clear()
            var view = history.sent(PresenterInput.UserSent("bench-tail", ReplayLines.PROMPT))
            for (line in tail) {
                view = view.event(PresenterInput.Event(StreamJsonCodec.decode(line)))
                source.push(view)
                delay(STREAM_INTERVAL_MS)
            }
            delay(QUIET_MS)
            val stream = watch.stats()
            profile += sampler.report("stream")
            if (round == ROUNDS) {
                profiles += "### ${kind.label}"
                profiles += ""
                profiles += profile
                profiles += ""
            }
            val renderStats = FrameWatch.Stats.of(renders.map { it / FrameWatch.NANOS_PER_MS })
            val renderP50 = renders.sorted().getOrNull(renders.size / 2)?.div(FrameWatch.NANOS_PER_MS) ?: -1

            FileEditorManager.getInstance(project).closeFile(file)
            rows +=
                "| ${kind.label} | $round | ${if (settled) openMs else "timeout"} | $firstRenderMs | $keptMb | " +
                "${scroll.p99} / ${scroll.max} / ${scroll.over50} | ${dispatchStats.p99} / ${dispatchStats.max} | " +
                "$renderP50 / ${renderStats.p99} / ${renderStats.max} | " +
                "${stream.p99} / ${stream.max} / ${stream.over50} |"
        } finally {
            ChatPanel.onRender = null
            watch.stop()
        }
        delay(QUIET_MS)
    }

    private fun surfaceOf(file: VirtualFile): JComponent? =
        when (val editor = FileEditorManager.getInstance(project).getSelectedEditor(file)) {
            is BaselineEditor -> editor.surface.component
            else -> (editor?.component as? ChatPanel)?.surfaceComponent()
        }

    private suspend fun wheel(
        surface: JComponent,
        direction: Int,
        dispatch: MutableList<Long>,
    ) {
        val x = surface.width / 2
        val y = surface.height / 2
        val target = SwingUtilities.getDeepestComponentAt(surface, x, y) ?: surface
        val at = SwingUtilities.convertPoint(surface, x, y, target)
        val event =
            MouseWheelEvent(
                target,
                MouseEvent.MOUSE_WHEEL,
                System.currentTimeMillis(),
                0,
                at.x,
                at.y,
                0,
                false,
                MouseWheelEvent.WHEEL_UNIT_SCROLL,
                WHEEL_UNITS,
                direction,
            )
        val start = System.nanoTime()
        target.dispatchEvent(event)
        dispatch += System.nanoTime() - start
        delay(FrameWatch.TICK_MS)
    }

    private fun display(surface: JComponent): String {
        val transform = surface.graphicsConfiguration?.defaultTransform
        val screen = surface.graphicsConfiguration?.bounds
        return "OS scale ${transform?.scaleX}, screen ${screen?.width}x${screen?.height} (logical), " +
            "chat ${surface.width}x${surface.height} (logical)"
    }

    @Suppress("ExplicitGarbageCollectionCall") // the heap a surface keeps is read after a collection
    private suspend fun settleHeap() {
        System.gc()
        delay(GC_PAUSE_MS)
    }

    private fun usedHeapMb(): Long {
        val runtime = Runtime.getRuntime()
        return (runtime.totalMemory() - runtime.freeMemory()) / BYTES_PER_MB
    }

    private fun write(foldMs: Long): Path {
        val shape = SyntheticSession.LARGEST
        val report =
            buildString {
                val now = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME)
                appendLine("# Closta chat performance ($now)")
                appendLine()
                appendLine(
                    "- IDE: ${ApplicationInfo.getInstance().fullApplicationName} " +
                        "(${ApplicationInfo.getInstance().build})",
                )
                appendLine(
                    "- OS: ${SystemInfo.OS_NAME} ${SystemInfo.OS_VERSION}, JBR ${SystemInfo.JAVA_RUNTIME_VERSION}, " +
                        "CPU ${Runtime.getRuntime().availableProcessors()}",
                )
                appendLine(
                    "- Screen scale: ${JBUIScale.scale(1f)}, " +
                        "max heap ${Runtime.getRuntime().maxMemory() / BYTES_PER_MB}MB",
                )
                appendLine("- $display")
                appendLine("- sun.java2d.d3d=${System.getProperty("sun.java2d.d3d")}")
                appendLine(
                    "- Session: ${shape.turns} asks, ${shape.tools} tools (${shape.subagents} subagents), " +
                        "about ${shape.totalText} characters of replies. Built in ${foldMs}ms (the presenter's fold, " +
                        "the same for every target)",
                )
                appendLine()
                appendLine(
                    "| Target | Round | Open until settled ms | First render ms | Retained heap MB | " +
                        "EDT lag while scrolling p99 / max / over 50ms | One wheel step p99 / max ms | " +
                        "Render while streaming p50 / p99 / max ms | EDT lag while streaming p99 / max / over 50ms |",
                )
                appendLine("|---|---|---|---|---|---|---|---|---|")
                rows.forEach(::appendLine)
                appendLine()
                appendLine("EDT lag = how many ms a 16ms timer fired late (how long the UI was stuck).")
                appendLine(
                    "The chat is the production one (it builds only the visible rows and those near them, keeps the " +
                        "rows it built, is opaque, and repaints only the rows that changed). It includes the input.",
                )
                appendLine(
                    "IDE editor (baseline) is the whole conversation in one IDE editor " +
                        "(the weight of the editor itself).",
                )
                appendLine()
                appendLine("## EDT breakdown (round $ROUNDS of each target; shares of EDT stacks sampled every 5ms)")
                appendLine()
                profiles.forEach(::appendLine)
            }
        val stamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss"))
        val path = Path.of(PathManager.getLogPath(), "closta-benchmark-$stamp.md")
        Files.writeString(path, report)
        return path
    }

    private enum class Target(
        val label: String,
    ) {
        EDITOR("IDE editor (baseline)"),
        CHAT("Chat"),
    }

    private companion object {
        const val ROUNDS = 2
        const val WHEEL_STEPS = 400
        const val WHEEL_UNITS = 3
        const val UP = -1
        const val DOWN = 1
        const val QUIET_MS = 150L
        const val SETTLE_TIMEOUT_MS = 60_000L
        const val STREAM_INTERVAL_MS = 20L
        const val GC_PAUSE_MS = 300L
        const val BYTES_PER_MB = 1_048_576L
    }
}
