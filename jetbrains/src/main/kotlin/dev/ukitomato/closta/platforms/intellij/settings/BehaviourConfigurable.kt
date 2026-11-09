package dev.ukitomato.closta.platforms.intellij.settings

import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.options.ConfigurationException
import com.intellij.openapi.options.SearchableConfigurable
import dev.ukitomato.closta.core.interfaces.SettingsStore
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.platforms.intellij.store.AppSettingsStore
import kotlinx.coroutines.CancellationException
import javax.swing.JComponent

/**
 * Settings | Tools | Closta | Behaviour: whether to save files before sending, whether `@` completion
 * leaves out the files the version control ignores, and the permission mode new sessions start in. A child of the
 * providers page, so that page stays as it is.
 *
 * The values live in the application settings ([AppSettingsStore]) through [BehaviourRecords]; Apply writes
 * all three. A failed write stays on the screen as a [ConfigurationException] and the saved state is not reloaded over
 * what the user typed. The messages, the sessions and the completion read the values when they use them, so nothing
 * here has to tell them.
 */
class BehaviourConfigurable : SearchableConfigurable {
    private val store: SettingsStore get() = service<AppSettingsStore>()
    private var editor = BehaviourEditor(BehaviourSettings())
    private var form: BehaviourForm? = null

    override fun getId(): String = ID

    override fun getDisplayName(): String = ClostaBundle.message("settings.behaviour.displayName")

    override fun createComponent(): JComponent {
        // The settings framework calls reset() right after this; the form is filled then.
        val created = BehaviourForm()
        form = created
        return created.root
    }

    override fun isModified(): Boolean = editor.isModified()

    @Suppress("TooGenericExceptionCaught", "SwallowedException")
    override fun apply() {
        try {
            BehaviourRecords.save(store, editor.current())
        } catch (cancel: CancellationException) {
            throw cancel
        } catch (failure: Exception) {
            // Only the type: the words of an exception may carry what the store holds.
            LOG.warn("Closta behaviour: could not save (${failure.javaClass.name})")
            throw ConfigurationException(
                ClostaBundle.message("settings.behaviour.saveFailed", failure.javaClass.simpleName),
                ClostaBundle.message("settings.behaviour.errorTitle"),
            )
        }
        editor.applied()
    }

    override fun reset() {
        editor = BehaviourEditor(BehaviourRecords.load(store, LOG::warn))
        form?.bind(editor)
    }

    override fun disposeUIResources() {
        form = null
        editor = BehaviourEditor(BehaviourSettings())
    }

    private companion object {
        val LOG = Logger.getInstance(BehaviourConfigurable::class.java)
        const val ID = "dev.ukitomato.closta.behaviour"
    }
}
