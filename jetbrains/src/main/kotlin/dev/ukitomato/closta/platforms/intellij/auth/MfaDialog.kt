package dev.ukitomato.closta.platforms.intellij.auth

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.EDT
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.asContextElement
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.util.Disposer
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBTextField
import com.intellij.util.ui.AsyncProcessIcon
import com.intellij.util.ui.FormBuilder
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.platforms.intellij.settings.mnemonicLabel
import dev.ukitomato.closta.platforms.intellij.ui.noHtml
import dev.ukitomato.closta.providers.claude.auth.SessionCredentials
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.awt.FlowLayout
import javax.swing.JComponent
import javax.swing.JPanel
import javax.swing.text.AbstractDocument

/**
 * The Amazon Bedrock sign-in prompt: a Swing modal, never a webview. It shows which provider and which
 * MFA device the code is for, and hands each code to the sign-in flow's exchange. While a code is out, the field and
 * Sign In are disabled and a spinner shows; Cancel closes at once, dropping an answer still on its way. A refused code
 * empties the field and says what to do; the dialog stays open for the next code.
 *
 * The exchange runs in [scope] on the EDT in any modality, since this dialog is modal itself; it is cancelled when the
 * dialog closes.
 */
class MfaDialog(
    project: Project,
    private val request: SignInRequest,
    private val exchange: suspend (String) -> ExchangeResult,
    private val scope: CoroutineScope,
) : DialogWrapper(project) {
    private val codeField =
        JBTextField(CODE_COLUMNS).apply {
            emptyText.text = ClostaBundle.message("auth.mfa.placeholder")
            (document as? AbstractDocument)?.documentFilter = SixDigitsFilter
        }
    private val spinner = AsyncProcessIcon("Signing in to Amazon Bedrock").apply { isVisible = false }
    private val busyLabel = JBLabel(ClostaBundle.message("auth.mfa.busy")).apply { isVisible = false }
    private var pending: Job? = null

    /** The credentials the exchange signed in with, once the dialog closed with OK. */
    var credentials: SessionCredentials? = null
        private set

    init {
        title = ClostaBundle.message("auth.mfa.title")
        setOKButtonText(ClostaBundle.message("auth.mfa.signIn"))
        Disposer.register(disposable, spinner)
        init()
    }

    override fun createCenterPanel(): JComponent =
        FormBuilder
            .createFormBuilder()
            .addComponent(JBLabel(ClostaBundle.message("auth.mfa.prompt")))
            .addLabeledComponent(ClostaBundle.message("auth.mfa.provider"), plain(request.providerName))
            .addLabeledComponent(ClostaBundle.message("auth.mfa.device"), plain(request.mfaDevice))
            .addLabeledComponent(ClostaBundle.message("settings.providers.region"), plain(request.region))
            .addLabeledComponent(mnemonicLabel(ClostaBundle.message("auth.mfa.code"), 'C', codeField), codeField)
            .addComponent(
                JPanel(FlowLayout(FlowLayout.LEFT, 0, 0)).apply {
                    add(spinner)
                    add(busyLabel)
                },
            ).panel

    override fun getPreferredFocusedComponent(): JComponent = codeField

    override fun doOKAction() {
        if (pending?.isActive == true) return
        val typed = codeField.text
        busy(true)
        pending =
            scope.launch(Dispatchers.EDT + ModalityState.any().asContextElement()) {
                val result = exchange(typed)
                busy(false)
                when (result) {
                    is ExchangeResult.SignedIn -> {
                        credentials = result.credentials
                        close(OK_EXIT_CODE)
                    }
                    is ExchangeResult.NotSent -> setErrorText(result.message, codeField)
                    is ExchangeResult.Refused -> {
                        codeField.text = ""
                        setErrorText(result.message, codeField)
                    }
                }
                codeField.requestFocusInWindow()
            }
    }

    override fun doCancelAction() {
        pending?.cancel()
        super.doCancelAction()
    }

    override fun dispose() {
        pending?.cancel()
        super.dispose()
    }

    private fun busy(on: Boolean) {
        codeField.isEnabled = !on
        isOKActionEnabled = !on
        spinner.isVisible = on
        busyLabel.isVisible = on
        if (on) spinner.resume() else spinner.suspend()
        if (on) setErrorText(null)
    }

    private companion object {
        const val CODE_COLUMNS = 8

        /** A label that shows [text] as typed: Swing would draw a text starting with an html tag as HTML. */
        fun plain(text: String) = JBLabel(text).noHtml()
    }
}

/**
 * The IDE's [MfaPrompt]: shows [MfaDialog] over [project]'s window. It waits until no other modal dialog is open (the
 * settings dialog, the IDE's trust prompt) rather than stacking on one, then asks `ready` off the EDT — it reads the
 * password storage — and shows nothing when the settings changed meanwhile. It closes the dialog when the caller is
 * cancelled — the session was closed, or the project.
 */
class IdeMfaPrompt(
    private val project: Project,
    private val scope: CoroutineScope,
) : MfaPrompt {
    override suspend fun ask(
        request: SignInRequest,
        ready: suspend () -> Boolean,
        exchange: suspend (String) -> ExchangeResult,
    ): SessionCredentials? {
        // Runs once no modal dialog is open: the non-modal context is only dispatched then.
        withContext(Dispatchers.EDT + ModalityState.nonModal().asContextElement()) {}
        if (!ready()) return null
        return show(request, exchange)
    }

    private suspend fun show(
        request: SignInRequest,
        exchange: suspend (String) -> ExchangeResult,
    ): SessionCredentials? =
        withContext(Dispatchers.EDT + ModalityState.nonModal().asContextElement()) {
            val dialog = MfaDialog(project, request, exchange, scope)
            // The dialog blocks this coroutine's thread in its own event loop, so the caller's cancellation is noticed
            // by a child off the EDT, which closes the dialog from there in any modality.
            val closer =
                launch(Dispatchers.Default) {
                    try {
                        awaitCancellation()
                    } finally {
                        ApplicationManager.getApplication().invokeLater(
                            { if (!dialog.isDisposed) dialog.close(DialogWrapper.CANCEL_EXIT_CODE) },
                            ModalityState.any(),
                        )
                    }
                }
            val signedIn = dialog.showAndGet()
            closer.cancel()
            if (signedIn) dialog.credentials else null
        }
}
