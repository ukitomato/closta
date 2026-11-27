package dev.ukitomato.closta.platforms.intellij.composer

import com.intellij.openapi.components.service
import com.intellij.openapi.fileEditor.OpenFileDescriptor
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.popup.JBPopup
import com.intellij.openapi.ui.popup.JBPopupFactory
import com.intellij.ui.components.ActionLink
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.components.panels.VerticalLayout
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.UIUtil
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.platforms.intellij.ide.IdeBridgeService
import dev.ukitomato.closta.platforms.intellij.thread.findThenOnEdt
import dev.ukitomato.closta.platforms.intellij.ui.noHtml
import dev.ukitomato.closta.platforms.intellij.ui.plainTip
import dev.ukitomato.closta.presenter.view.ComposerState
import dev.ukitomato.closta.presenter.view.PermissionRule
import dev.ukitomato.closta.presenter.view.PermissionRulesRecord
import dev.ukitomato.closta.presenter.view.visible
import dev.ukitomato.closta.providers.claude.launch.CliPaths
import dev.ukitomato.closta.providers.claude.launch.NativeCliPaths
import java.awt.BorderLayout
import java.awt.Dimension
import java.nio.file.Files
import java.nio.file.Path
import javax.swing.JComponent
import javax.swing.JPanel
import javax.swing.ScrollPaneConstants

/**
 * The popup of the permission rules and working directories the session runs with. It keeps nothing of its own: each
 * [show] draws the composer's state again, so an answer that comes while it is open fills it in (only what it was drawn
 * from is kept, to skip a state that changes nothing here). Everything the CLI wrote is shown as text.
 */
@Suppress("TooManyFunctions") // one popup: its sections, rows and links
internal class RulesPopup(
    private val project: Project,
    state: ComposerState,
) {
    private val content =
        JPanel(VerticalLayout(JBUI.scale(GAP))).apply {
            border = JBUI.Borders.empty(GAP * 2)
        }

    private val cliPaths: CliPaths = project.service<IdeBridgeService>().cliPaths

    // What the content was last drawn from, so that a state that changes nothing here (a streamed reply) draws nothing.
    private var drawn: Triple<PermissionRulesRecord?, Boolean, String?>? = null

    private val scroll =
        object : JBScrollPane(
            content,
            ScrollPaneConstants.VERTICAL_SCROLLBAR_AS_NEEDED,
            ScrollPaneConstants.HORIZONTAL_SCROLLBAR_NEVER,
        ) {
            override fun getPreferredSize(): Dimension {
                val wanted = super.getPreferredSize()
                return Dimension(
                    wanted.width.coerceIn(JBUI.scale(MIN_WIDTH), JBUI.scale(MAX_WIDTH)),
                    wanted.height.coerceAtMost(JBUI.scale(MAX_HEIGHT)),
                )
            }
        }.apply { border = JBUI.Borders.empty() }

    val popup: JBPopup =
        JBPopupFactory
            .getInstance()
            .createComponentPopupBuilder(scroll, null)
            .setTitle(ClostaBundle.message("composer.rules.title"))
            .setRequestFocus(true)
            .setCancelOnClickOutside(true)
            .createPopup()

    init {
        draw(state)
    }

    /** Draws [state] again while the popup is open, and fits the popup to what it now says. */
    fun show(state: ComposerState) {
        if (draw(state) && popup.isVisible) popup.pack(true, true)
    }

    private fun draw(state: ComposerState): Boolean {
        val from = Triple(state.rules, state.rulesWaiting, state.rulesFailure)
        if (from == drawn) return false
        drawn = from
        content.removeAll()
        state.rulesFailure?.let { content.add(quiet(ClostaBundle.message("composer.rules.failure", visible(it).text))) }
        if (state.rulesWaiting) content.add(quiet(ClostaBundle.message("composer.rules.loading")))
        state.rules?.let(::record)
        content.revalidate()
        content.repaint()
        return true
    }

    private fun record(rules: PermissionRulesRecord) {
        if (rules.managedOnly) content.add(quiet(ClostaBundle.message("composer.rules.managedOnly")))
        if (rules.withheld) content.add(quiet(ClostaBundle.message("composer.rules.withheld")))
        for (error in rules.errors) {
            val message = visible(error.message).text
            val text =
                error.file?.let { ClostaBundle.message("composer.rules.error.file", visible(it).text, message) }
                    ?: ClostaBundle.message("composer.rules.error.noFile", message)
            content.add(JBLabel(text).noHtml().apply { foreground = UIUtil.getErrorForeground() })
        }
        for (behavior in BEHAVIORS) {
            val own = rules.rules.filter { it.behavior == behavior }
            section(ClostaBundle.message("composer.rules.heading.$behavior"), own.isEmpty())
            own.forEach { content.add(row(it, rules.originalCwd)) }
        }
        section(ClostaBundle.message("composer.rules.heading.directories"), rules.directories.isEmpty())
        for (directory in rules.directories) {
            val side = sourceLabel(directory.source)
            content.add(line(JBLabel(visible(directory.path).text).noHtml(), JBLabel(side).noHtml().muted()))
        }
    }

    private fun section(
        title: String,
        empty: Boolean,
    ) {
        content.add(JBLabel(title).apply { font = font.deriveFont(java.awt.Font.BOLD) })
        if (empty) content.add(quiet(ClostaBundle.message("composer.rules.none")))
    }

    private fun row(
        rule: PermissionRule,
        originalCwd: String,
    ): JComponent {
        val reading = listOfNotNull(rule.prefix, rule.emphasis, rule.suffix).joinToString("")
        val said = reading.ifEmpty { rule.rule }
        val text =
            if (rule.notInEffect) {
                ClostaBundle.message(
                    "composer.rules.notInEffect",
                    visible(said).text,
                )
            } else {
                visible(said).text
            }
        val label =
            JBLabel(text).noHtml().apply {
                toolTipText = plainTip(visible(rule.rule).text)
                if (rule.notInEffect) foreground = UIUtil.getContextHelpForeground()
            }
        return line(label, sourceComponent(rule.source, originalCwd))
    }

    private fun sourceComponent(
        source: String,
        originalCwd: String,
    ): JComponent {
        val words = sourceLabel(source)
        val file = settingsFileOf(source, originalCwd, userConfigDir())?.let(cliPaths::toIde)
        if (file == null || !Files.isRegularFile(Path.of(file))) return JBLabel(words).noHtml().muted()
        return ActionLink(words) { open(file) }.apply { toolTipText = plainTip(file) }
    }

    private fun sourceLabel(source: String): String =
        ruleSourceKey(source)?.let { ClostaBundle.message(it) } ?: visible(source).text

    private fun userConfigDir(): String? =
        if (cliPaths === NativeCliPaths) {
            System.getenv("CLAUDE_CONFIG_DIR")?.takeIf { it.isNotBlank() }
                ?: Path.of(System.getProperty("user.home"), ".claude").toString()
        } else {
            null
        }

    private fun open(path: String) {
        findThenOnEdt(project, path) { file ->
            if (file != null) OpenFileDescriptor(project, file).navigate(true)
        }
    }

    private fun line(
        main: JComponent,
        side: JComponent,
    ) = JPanel(BorderLayout(JBUI.scale(GAP * 2), 0)).apply {
        isOpaque = false
        add(main, BorderLayout.CENTER)
        add(side, BorderLayout.EAST)
    }

    private fun quiet(text: String) = JBLabel(text).noHtml().muted()

    private fun JBLabel.muted() = apply { foreground = UIUtil.getContextHelpForeground() }

    private companion object {
        const val GAP = 4
        const val MIN_WIDTH = 280
        const val MAX_WIDTH = 560
        const val MAX_HEIGHT = 420
        val BEHAVIORS = listOf("allow", "ask", "deny")
    }
}
