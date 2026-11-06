package dev.ukitomato.closta.platforms.intellij.settings

import com.intellij.openapi.ui.ComboBox
import com.intellij.ui.SimpleListCellRenderer
import com.intellij.ui.components.JBCheckBox
import com.intellij.util.ui.FormBuilder
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import javax.swing.JComponent
import javax.swing.JPanel

/**
 * The Swing side of Settings | Tools | Closta | Behaviour: two check boxes and a choice of permission
 * mode, each with a short note on when a change takes effect. Every edit goes straight into the bound
 * [BehaviourEditor]. EDT only.
 */
internal class BehaviourForm {
    private var editor = BehaviourEditor(BehaviourSettings())
    private var loading = false

    private val saveBeforeSend = JBCheckBox(ClostaBundle.message("settings.behaviour.saveBeforeSend")).withMnemonic('S')
    private val respectGitIgnore =
        JBCheckBox(
            ClostaBundle.message("settings.behaviour.respectGitIgnore"),
        ).withMnemonic('L')
    private val modeChoice =
        ComboBox(CHOICES.toTypedArray()).apply {
            renderer = SimpleListCellRenderer.create("") { it.label }
        }

    /** The whole form, for the settings dialog. */
    val root: JComponent =
        FormBuilder
            .createFormBuilder()
            .addComponent(saveBeforeSend)
            .addTooltip(ClostaBundle.message("settings.behaviour.saveBeforeSend.note"))
            .addComponent(respectGitIgnore)
            .addTooltip(ClostaBundle.message("settings.behaviour.respectGitIgnore.note"))
            .addLabeledComponent(
                mnemonicLabel(ClostaBundle.message("settings.behaviour.mode"), 'P', modeChoice),
                modeChoice,
            ).addTooltip(ClostaBundle.message("settings.behaviour.mode.note"))
            .addComponentFillVertically(JPanel(), 0)
            .panel

    init {
        saveBeforeSend.addActionListener { if (!loading) editor.saveBeforeSend = saveBeforeSend.isSelected }
        respectGitIgnore.addActionListener { if (!loading) editor.respectGitIgnore = respectGitIgnore.isSelected }
        modeChoice.addActionListener {
            if (!loading) editor.initialPermissionMode = (modeChoice.selectedItem as? ModeChoice)?.mode
        }
    }

    /** Shows [bound]'s values and sends the user's edits to it. */
    fun bind(bound: BehaviourEditor) {
        loading = true
        try {
            editor = bound
            saveBeforeSend.isSelected = bound.saveBeforeSend
            respectGitIgnore.isSelected = bound.respectGitIgnore
            modeChoice.selectedItem = CHOICES.first { it.mode == bound.initialPermissionMode }
        } finally {
            loading = false
        }
    }

    private class ModeChoice(
        val mode: InitialPermissionMode?,
        val label: String,
    )

    private companion object {
        val CHOICES =
            listOf(
                ModeChoice(null, ClostaBundle.message("settings.behaviour.mode.cliDefault")),
                ModeChoice(InitialPermissionMode.DEFAULT, ClostaBundle.message("settings.behaviour.mode.default")),
                ModeChoice(
                    InitialPermissionMode.ACCEPT_EDITS,
                    ClostaBundle.message("settings.behaviour.mode.acceptEdits"),
                ),
                ModeChoice(InitialPermissionMode.PLAN, ClostaBundle.message("settings.behaviour.mode.plan")),
                ModeChoice(InitialPermissionMode.AUTO, ClostaBundle.message("settings.behaviour.mode.auto")),
                ModeChoice(InitialPermissionMode.DONT_ASK, ClostaBundle.message("settings.behaviour.mode.dontAsk")),
            )
    }
}
