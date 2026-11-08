package dev.ukitomato.closta.platforms.intellij.composer

import com.intellij.icons.AllIcons
import com.intellij.openapi.ui.popup.JBPopup
import com.intellij.openapi.ui.popup.JBPopupFactory
import com.intellij.ui.ColoredListCellRenderer
import com.intellij.ui.ScreenUtil
import com.intellij.ui.SimpleTextAttributes
import com.intellij.ui.awt.RelativePoint
import com.intellij.ui.components.JBList
import com.intellij.ui.dsl.builder.panel
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.UIUtil
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.platforms.intellij.ui.plainTip
import dev.ukitomato.closta.presenter.view.ComposerState
import dev.ukitomato.closta.presenter.view.ModelChoice
import dev.ukitomato.closta.presenter.view.effortLabel
import dev.ukitomato.closta.presenter.view.modeLabel
import java.awt.BorderLayout
import java.awt.Point
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import javax.swing.JComponent
import javax.swing.JList
import javax.swing.JPanel
import javax.swing.ListSelectionModel

/** The composer's popups: JBPopup lists, and the Effort levels as a segmented button. */
object ComposerPopups {
    private val MODE_HINTS = setOf("default", "acceptEdits", "plan", "auto", "dontAsk", "bypassPermissions")
    const val BYPASS = "bypassPermissions"

    private fun modeHint(mode: String): String? =
        if (mode in MODE_HINTS) ClostaBundle.message("composer.mode.hint.$mode") else null

    fun modes(
        state: ComposerState,
        chosen: (String) -> Unit,
    ): JBPopup =
        JBPopupFactory
            .getInstance()
            .createPopupChooserBuilder(state.modes)
            .setTitle(ClostaBundle.message("composer.modes.title"))
            .setAdText(ClostaBundle.message("composer.modes.ad"))
            .setRenderer(
                object : ColoredListCellRenderer<String>() {
                    override fun customizeCellRenderer(
                        list: JList<out String>,
                        value: String,
                        index: Int,
                        selected: Boolean,
                        hasFocus: Boolean,
                    ) {
                        val warn = value == BYPASS
                        val main =
                            if (warn) {
                                SimpleTextAttributes(
                                    SimpleTextAttributes.STYLE_PLAIN,
                                    JBUI.CurrentTheme.Banner.WARNING_BORDER_COLOR,
                                )
                            } else {
                                SimpleTextAttributes.REGULAR_ATTRIBUTES
                            }
                        append(modeLabel(value), main)
                        modeHint(value)?.let { append("  $it", SimpleTextAttributes.GRAYED_ATTRIBUTES) }
                        icon =
                            when {
                                value == state.mode -> AllIcons.Actions.Checked
                                // Bypass is said by an icon too, not by the colour alone.
                                warn -> AllIcons.General.Warning
                                else ->
                                    com.intellij.util.ui.EmptyIcon
                                        .create(JBUI.scale(ICON))
                            }
                    }
                },
            ).setSelectedValue(state.mode, true)
            .setItemChosenCallback(chosen)
            .createPopup()

    /**
     * The models the CLI offers, a model the list does not name first and disabled, then the Effort levels of the model
     * in effect (when it takes any). Choosing a model or a level calls [model] or [effort] and closes the popup.
     */
    fun models(
        state: ComposerState,
        model: (String) -> Unit,
        effort: (String) -> Unit,
    ): JBPopup {
        val rows =
            buildList {
                state.unknownModel?.let {
                    add(ModelChoice(it, it, ClostaBundle.message("composer.models.unknown"), it))
                }
                addAll(state.models)
            }
        val list =
            JBList(rows).apply {
                selectionMode = ListSelectionModel.SINGLE_SELECTION
                // The list comes in the CLI's first answer; until then it is empty.
                emptyText.text = WAITING_FOR_CLI
                cellRenderer =
                    object : ColoredListCellRenderer<ModelChoice>() {
                        override fun customizeCellRenderer(
                            list: JList<out ModelChoice>,
                            value: ModelChoice,
                            index: Int,
                            selected: Boolean,
                            hasFocus: Boolean,
                        ) {
                            val unknown = value.value == state.unknownModel
                            val look = if (unknown) GRAYED else REGULAR
                            append(value.label, look)
                            if (value.description.isNotEmpty()) {
                                append(
                                    "  ${value.description}",
                                    SimpleTextAttributes.GRAYED_ATTRIBUTES,
                                )
                            }
                            icon =
                                if (value.value ==
                                    state.model.value
                                ) {
                                    AllIcons.Actions.Checked
                                } else {
                                    com.intellij.util.ui.EmptyIcon
                                        .create(JBUI.scale(ICON))
                                }
                            toolTipText = plainTip(value.resolved)
                        }
                    }
                setSelectedValue(rows.firstOrNull { it.value == state.model.value }, true)
            }
        val content =
            JPanel(BorderLayout(0, JBUI.scale(GAP))).apply {
                border = JBUI.Borders.empty(GAP)
                add(list, BorderLayout.CENTER)
            }
        lateinit var popup: JBPopup
        if (state.effortLevels.isNotEmpty()) {
            // Choosing a level closes the popup, as choosing a model does.
            content.add(
                effortRow(state) { level ->
                    popup.cancel()
                    effort(level)
                },
                BorderLayout.SOUTH,
            )
        }
        popup =
            JBPopupFactory
                .getInstance()
                .createComponentPopupBuilder(content, list)
                .setTitle(ClostaBundle.message("composer.models.title"))
                .setRequestFocus(true)
                .setCancelOnClickOutside(true)
                .createPopup()
        list.addMouseListener(
            object : MouseAdapter() {
                // checkUi: allow clickable-label — a list in a popup: Enter picks the chosen row too
                override fun mouseClicked(e: MouseEvent) = pick(list, state, model, popup)
            },
        )
        list.addKeyListener(
            object : java.awt.event.KeyAdapter() {
                override fun keyPressed(e: java.awt.event.KeyEvent) {
                    if (e.keyCode == java.awt.event.KeyEvent.VK_ENTER) pick(list, state, model, popup)
                }
            },
        )
        return popup
    }

    /**
     * Shows [popup] just above [button], its left edge on the button's, so it never covers the button; below it
     * when the screen has no room above.
     */
    fun showAbove(
        popup: JBPopup,
        button: JComponent,
    ) {
        val height = popup.content.preferredSize.height
        val screen = ScreenUtil.getScreenRectangle(button.locationOnScreen)
        val above = button.locationOnScreen.y - height >= screen.y
        popup.show(RelativePoint(button, Point(0, if (above) -height else button.height)))
    }

    private fun pick(
        list: JBList<ModelChoice>,
        state: ComposerState,
        model: (String) -> Unit,
        popup: JBPopup,
    ) {
        val value = list.selectedValue ?: return
        if (value.value == state.unknownModel) return
        popup.cancel()
        if (value.value != state.model.value) model(value.value)
    }

    private fun effortRow(
        state: ComposerState,
        effort: (String) -> Unit,
    ): JComponent {
        val known = state.effort in state.effortLevels
        val levels =
            panel {
                row(ClostaBundle.message("composer.effort.label")) {
                    segmentedButton(state.effortLevels) { text = effortLabel(it) }
                        .apply { if (known) selectedItem = state.effort }
                        .whenItemSelected { level -> if (level != state.effort) effort(level) }
                        .enabled(state.effortEnabled)
                }
                if (!known && state.effort != null) {
                    row { label(ClostaBundle.message("composer.effort.current", state.effort.orEmpty())) }
                }
                if (!state.effortEnabled) {
                    row {
                        label(ClostaBundle.message("composer.effort.whenIdle")).applyToComponent {
                            foreground =
                                UIUtil.getContextHelpForeground()
                        }
                    }
                }
            }
        return levels
    }

    private val GRAYED = SimpleTextAttributes.GRAYED_ATTRIBUTES
    private val REGULAR = SimpleTextAttributes.REGULAR_ATTRIBUTES
    private const val GAP = 6
    private const val ICON = 16
}
