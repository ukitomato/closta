package dev.ukitomato.closta.platforms.intellij.settings

import com.intellij.openapi.application.EDT
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.asContextElement
import com.intellij.openapi.components.service
import com.intellij.openapi.options.ConfigurationException
import com.intellij.openapi.options.SearchableConfigurable
import com.intellij.openapi.util.Disposer
import com.intellij.platform.ide.progress.ModalTaskOwner
import com.intellij.platform.ide.progress.TaskCancellation
import com.intellij.platform.ide.progress.runWithModalProgressBlocking
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.platforms.intellij.store.ProviderId
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.withContext
import javax.swing.JComponent

/**
 * Settings | Tools | Closta: the providers (Anthropic or Amazon Bedrock) and the one new sessions use.
 *
 * Apply checks the [ProviderEditor], writes the secrets under a modal progress (they live in PasswordSafe, which must
 * not be called on the EDT), then saves the records. The long-term keys are never read back into the screen; whether
 * keys are stored is asked in the background and shown.
 */
class ProvidersConfigurable : SearchableConfigurable {
    private val settings: ProviderSettings get() = service()
    private var editor = ProviderEditor(emptyList(), null)
    private var form: ProviderForm? = null
    private val queries = mutableListOf<Job>()

    override fun getId(): String = ID

    override fun getDisplayName(): String = DISPLAY_NAME

    override fun createComponent(): JComponent {
        // The settings framework calls reset() right after this; the form is filled then.
        val created = ProviderForm()
        form = created
        return created.root
    }

    override fun isModified(): Boolean = editor.isModified()

    override fun apply() {
        val problems = editor.problems()
        if (problems.isNotEmpty()) throw ConfigurationException(problems.joinToString("\n") { it.describe() }, TITLE)
        val owner = form?.root ?: return
        val plan = editor.plan()
        val outcome =
            runWithModalProgressBlocking(
                ModalTaskOwner.component(owner),
                PROGRESS_TITLE,
                TaskCancellation.nonCancellable(),
            ) { settings.applySecrets(plan) }
        // A removed provider whose secrets could not be forgotten keeps its record, or its entries are lost for good.
        settings.save(plan.recordsToSave(outcome), plan.active)
        reset()
        if (outcome.failures.isNotEmpty()) {
            throw ConfigurationException(SecretApplication.failureReport(plan, outcome).joinToString("\n"), TITLE)
        }
    }

    override fun reset() {
        cancelQueries()
        val saved = settings.load()
        editor = ProviderEditor(saved.records, saved.active)
        val shownForm = form ?: return
        // Only the saved Bedrock providers can have stored keys; the form shows "Not stored." for the others.
        val pending = editor.records.filter { it.kind == ProviderKind.BEDROCK && editor.isSaved(it.id) }.map { it.id }
        shownForm.bind(editor, pending.toSet(), shownForm.selectedId)
        queryStatuses(shownForm, pending)
    }

    override fun disposeUIResources() {
        cancelQueries()
        form?.let { Disposer.dispose(it.disposable) }
        form = null
        editor = ProviderEditor(emptyList(), null) // drops any keys typed but not applied
    }

    // Stored keys are asked for in the background — PasswordSafe must not be called on the EDT. The answer only updates
    // labels, so it comes back in any modality: the settings dialog is modal, and reset() runs before the form is in
    // its window, where the form's own modality would be "none" and the answer would wait until the dialog closed.
    // The query job is cancelled on reset and dispose; a cancelled job does not run its EDT part.
    private fun queryStatuses(
        shownForm: ProviderForm,
        pending: List<ProviderId>,
    ) {
        queries +=
            settings.query {
                val memoryOnly = settings.isMemoryOnly()
                val answers = pending.associateWith { settings.hasLongTermKeys(it) }
                val sessions = pending.associateWith { settings.storedSession(it) }
                withContext(Dispatchers.EDT + ModalityState.any().asContextElement()) {
                    shownForm.showStatuses(answers, memoryOnly, sessions)
                }
            }
    }

    private fun cancelQueries() {
        queries.forEach(Job::cancel)
        queries.clear()
    }

    private companion object {
        const val ID = "dev.ukitomato.closta.providers"
        const val DISPLAY_NAME = "Closta"
        val TITLE: String get() = ClostaBundle.message("settings.providers.saveFailedTitle")
        val PROGRESS_TITLE: String get() = ClostaBundle.message("settings.providers.saving")
    }
}
