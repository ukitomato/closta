package dev.ukitomato.closta.platforms.intellij.auth

import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import dev.ukitomato.closta.core.interfaces.Secret
import dev.ukitomato.closta.core.interfaces.SecretStore
import dev.ukitomato.closta.platforms.intellij.settings.ProviderLaunch
import dev.ukitomato.closta.platforms.intellij.store.PasswordSafeSecretStore
import dev.ukitomato.closta.platforms.intellij.store.ProviderId
import dev.ukitomato.closta.platforms.intellij.store.ProviderSecrets
import dev.ukitomato.closta.platforms.intellij.store.SecretSlot
import dev.ukitomato.closta.providers.claude.auth.AwsStsSessionTokenResolver
import kotlinx.coroutines.CoroutineScope
import kotlin.coroutines.cancellation.CancellationException

/**
 * The Amazon Bedrock sign-in for the whole IDE: one [BedrockSignInFlow], so a provider is signed in once even
 * when two projects open sessions together. It joins PasswordSafe, STS and the Swing prompt, which it
 * builds for the project asking each time — the service keeps no project.
 *
 * Logs carry provider ids, reasons, AWS error codes, times and exception types only.
 * A light application service: registered by the annotation, not in plugin.xml.
 */
@Service(Service.Level.APP)
class BedrockSignInService(
    private val scope: CoroutineScope,
) {
    private val flow =
        BedrockSignInFlow(
            store = IdeSecrets,
            resolver = AwsStsSessionTokenResolver(),
            background = scope,
            clock = System::currentTimeMillis,
            log = IdeSignInLog,
        )

    /**
     * Signs in for the next session of [project] with the provider [launch] names; asks over [project]'s window.
     * [stillCurrent] says whether the settings are still [launch]'s; it is asked after the prompt, before saving.
     */
    suspend fun signIn(
        project: Project,
        launch: ProviderLaunch.NeedsBedrockSignIn,
        stillCurrent: suspend () -> Boolean,
    ): SignInOutcome =
        flow.signIn(
            SignInRequest(
                providerId = launch.providerId,
                providerName = launch.providerName,
                mfaDevice = launch.mfaDevice,
                region = launch.config.region,
                durationSeconds = launch.sessionDurationSeconds,
            ),
            IdeMfaPrompt(project, scope),
            stillCurrent,
        )

    /** What is stored for [id]'s temporary credentials, for the settings screen. Never call it on the EDT. */
    suspend fun storedSession(id: ProviderId): StoredSession =
        try {
            IdeSecrets
                .get(ProviderSecrets.key(id, SecretSlot.BEDROCK_SESSION))
                ?.let(BedrockSessionSecret::fromSecret)
                ?.let { StoredSession.Expires(it.expirationEpochMillis) } ?: StoredSession.None
        } catch (cancel: CancellationException) {
            throw cancel
        } catch (
            @Suppress("TooGenericExceptionCaught") unavailable: Exception,
        ) {
            val type = unavailable.javaClass.simpleName
            LOG.warn("Closta providers: could not read the temporary credentials of ${id.value} ($type)")
            StoredSession.Unknown
        }

    // PasswordSafe is asked for each time it is needed, not held: the platform's rule for services.
    private object IdeSecrets : SecretStore {
        override suspend fun get(key: String): Secret? = service<PasswordSafeSecretStore>().get(key)

        override suspend fun set(
            key: String,
            value: Secret,
        ) = service<PasswordSafeSecretStore>().set(key, value)

        override suspend fun clear(key: String) = service<PasswordSafeSecretStore>().clear(key)
    }

    private object IdeSignInLog : SignInLog {
        override fun info(message: String) = LOG.info(message)

        override fun warn(message: String) = LOG.warn(message)
    }

    private companion object {
        val LOG = Logger.getInstance(BedrockSignInService::class.java)
    }
}
