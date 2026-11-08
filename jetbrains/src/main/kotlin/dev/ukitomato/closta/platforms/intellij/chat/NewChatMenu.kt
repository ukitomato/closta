package dev.ukitomato.closta.platforms.intellij.chat

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.ActionGroup
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.actionSystem.ex.ActionUtil
import com.intellij.openapi.components.service
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.project.DumbAwareToggleAction
import com.intellij.openapi.project.Project
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.platforms.intellij.settings.ProviderPick
import dev.ukitomato.closta.platforms.intellij.settings.ProviderSettings
import dev.ukitomato.closta.platforms.intellij.settings.nameOf
import dev.ukitomato.closta.platforms.intellij.store.ProviderId

/**
 * The ▾ next to a window's "+": where a new conversation opens — an editor tab, the sidebar, or a new worktree. The
 * "+" itself opens one in its own window's place.
 */
fun newChatChoices(project: Project): ActionGroup =
    DefaultActionGroup(ClostaBundle.message("chat.newChat.where"), choicesIn(project)).apply {
        templatePresentation.isPopupGroup = true
        templatePresentation.icon = AllIcons.General.ChevronDown
        templatePresentation.description = ClostaBundle.message("chat.newChat.where")
    }

/** [newChatChoices] as a registered group (`Closta.Sessions.NewChatChoices`): the project comes from the event. */
class NewChatChoicesGroup : ActionGroup() {
    override fun getActionUpdateThread() = ActionUpdateThread.BGT

    override fun getChildren(e: AnActionEvent?): Array<AnAction> =
        e?.project?.let { choicesIn(it).toTypedArray() } ?: EMPTY_ARRAY
}

private fun choicesIn(project: Project): List<AnAction> =
    listOf(
        choice(ClostaBundle.message("chat.newChat.inEditorTab"), AllIcons.Actions.MoveToWindow) {
            openNewChat(project, Placement.EDITOR_TAB)
        },
        choice(ClostaBundle.message("chat.newChat.inSidebar"), AllIcons.General.Add) {
            openNewChat(project, Placement.SIDEBAR)
        },
        choice(ClostaBundle.message("chat.sessions.newWorktree"), AllIcons.Vcs.Branch) {
            openWorktreeChat(project)
        },
    )

/**
 * The provider switch next to a window's "+": it shows the provider new conversations start with and changes it. It is
 * the same choice as Settings' "provider for new sessions" (read each time it is shown, so either place changes both);
 * a conversation that runs keeps the provider it started with.
 */
fun providerSwitch(): ActionGroup = ProviderSwitchGroup()

/** [providerSwitch] as a registered group (`Closta.Sessions.ProviderSwitch`). */
class ProviderSwitchGroup : DefaultActionGroup() {
    init {
        templatePresentation.isPopupGroup = true
        templatePresentation.description = ClostaBundle.message("chat.provider.switch")
        templatePresentation.putClientProperty(ActionUtil.SHOW_TEXT_IN_TOOLBAR, true)
    }

    override fun getActionUpdateThread() = ActionUpdateThread.BGT

    override fun update(e: AnActionEvent) {
        e.presentation.text = service<ProviderSettings>().nameOf(ProviderPick.Active)
    }

    override fun getChildren(e: AnActionEvent?): Array<AnAction> {
        val saved = service<ProviderSettings>().load()
        val rows =
            listOf<Pair<ProviderId?, String>>(null to ProviderSettings.DEFAULT_NAME) +
                saved.records.map { it.id to it.name }
        return rows.map { (id, name) -> providerRow(id, name) }.toTypedArray()
    }
}

private fun providerRow(
    id: ProviderId?,
    name: String,
) = object : DumbAwareToggleAction(name) {
    override fun getActionUpdateThread() = ActionUpdateThread.BGT

    override fun isSelected(e: AnActionEvent): Boolean = service<ProviderSettings>().load().active == id

    override fun setSelected(
        e: AnActionEvent,
        state: Boolean,
    ) {
        val settings = service<ProviderSettings>()
        if (state) settings.save(settings.load().records, id)
    }
}

private fun choice(
    text: String,
    icon: javax.swing.Icon,
    run: () -> Unit,
) = object : DumbAwareAction(text, null, icon) {
    override fun actionPerformed(e: AnActionEvent) = run()
}
