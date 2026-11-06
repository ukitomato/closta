package dev.ukitomato.closta.platforms.intellij.session

import dev.ukitomato.closta.platforms.intellij.auth.SignInOutcome
import dev.ukitomato.closta.platforms.intellij.settings.ProviderLaunch
import dev.ukitomato.closta.providers.claude.launch.BedrockLaunch
import dev.ukitomato.closta.providers.claude.launch.ClaudeLaunchSpec
import dev.ukitomato.closta.providers.claude.launch.FilteringProcessSpawner
import dev.ukitomato.closta.providers.claude.launch.NativeProcessSpawner
import dev.ukitomato.closta.providers.claude.launch.ProcessSpawner

/**
 * How one session's `claude` is started: the [spawner] that creates the process and the [spec] it runs.
 *
 * Not a data class: [spec] carries the launch environment, which holds credentials once a provider supplies them, and a
 * generated `toString` would hand it to any log line or string template. Only the argv is printed.
 */
class SessionLaunch(
    val spawner: ProcessSpawner,
    val spec: ClaudeLaunchSpec,
) {
    override fun toString(): String = "SessionLaunch(argv=${spec.toArgv()})"
}

/**
 * Produces the [SessionLaunch] for a new session. The session service uses [NativeSessionLaunchPlanner] over the active
 * provider unless it is handed another one, and always through [TrustGatedPlanner]. It suspends because an
 * implementation may read secrets, which can block. A planner reports a failure it can name as a
 * [SessionStartException]; anything else it throws is reported by its type only.
 */
interface SessionLaunchPlanner {
    suspend fun plan(
        sessionId: String,
        workingDirectory: String?,
    ): SessionLaunch
}

/**
 * The launch for the active provider (`ProviderSettings.activeLaunch`): `claude` from this machine's PATH in
 * the project, with the environment the provider gives — none of its own while no provider is chosen. An Amazon
 * Bedrock provider is signed in first through [signIn] and launched with the Bedrock environment and the
 * temporary credentials, by a spawner that does not pass on the inherited keys that would override them. A sign-in
 * that ends without credentials is a failure the user can act on. WSL is a different spawner, supplied elsewhere.
 *
 * The sign-in is handed a check that reads the active provider again ([sameSignIn]): its prompt can wait for the
 * settings dialog, where the provider can change. When it changed, the planner plans once more from the top — the new
 * active provider, or a new sign-in with the new settings — and a second change is a failure.
 */
class NativeSessionLaunchPlanner(
    private val activeLaunch: () -> ProviderLaunch,
    private val signIn: suspend (ProviderLaunch.NeedsBedrockSignIn, suspend () -> Boolean) -> SignInOutcome,
) : SessionLaunchPlanner {
    override suspend fun plan(
        sessionId: String,
        workingDirectory: String?,
    ): SessionLaunch = plan(sessionId, workingDirectory, again = false)

    private suspend fun plan(
        sessionId: String,
        workingDirectory: String?,
        again: Boolean,
    ): SessionLaunch =
        when (val launch = activeLaunch()) {
            is ProviderLaunch.Env ->
                SessionLaunch(
                    NativeProcessSpawner,
                    ClaudeLaunchSpec(
                        sessionId = sessionId,
                        cwd = workingDirectory,
                        env = launch.env,
                        permissionPromptToolStdio = true,
                    ),
                )
            is ProviderLaunch.NeedsBedrockSignIn -> bedrock(launch, sessionId, workingDirectory, again)
        }

    private suspend fun bedrock(
        launch: ProviderLaunch.NeedsBedrockSignIn,
        sessionId: String,
        workingDirectory: String?,
        again: Boolean,
    ): SessionLaunch =
        when (val outcome = signIn(launch) { sameSignIn(launch, activeLaunch()) }) {
            is SignInOutcome.SignedIn ->
                SessionLaunch(
                    FilteringProcessSpawner(BedrockLaunch.INHERITED_KEYS_TO_DROP),
                    ClaudeLaunchSpec(
                        sessionId = sessionId,
                        cwd = workingDirectory,
                        env = BedrockLaunch.env(launch.config, outcome.credentials),
                        permissionPromptToolStdio = true,
                    ),
                )
            SignInOutcome.Cancelled -> throw SessionStartException(SessionFailure.BedrockSignInCancelled)
            SignInOutcome.NoLongTermKeys -> throw SessionStartException(SessionFailure.BedrockKeysMissing)
            is SignInOutcome.StoreUnavailable ->
                throw SessionStartException(SessionFailure.BedrockSecretsUnavailable(outcome.reason))
            SignInOutcome.SettingsChanged ->
                if (again) {
                    throw SessionStartException(SessionFailure.BedrockSettingsChanged)
                } else {
                    plan(sessionId, workingDirectory, again = true)
                }
        }
}

/**
 * Whether [now] signs in and launches the way [asked] does: the same provider, region, models, MFA device and session
 * length. The display name is not compared — it reaches neither STS nor the launch environment.
 */
fun sameSignIn(
    asked: ProviderLaunch.NeedsBedrockSignIn,
    now: ProviderLaunch,
): Boolean =
    now is ProviderLaunch.NeedsBedrockSignIn &&
        now.providerId == asked.providerId &&
        now.config.region == asked.config.region &&
        now.config.model == asked.config.model &&
        now.config.sonnetModelId == asked.config.sonnetModelId &&
        now.config.haikuModelId == asked.config.haikuModelId &&
        now.mfaDevice == asked.mfaDevice &&
        now.sessionDurationSeconds == asked.sessionDurationSeconds

/**
 * Starts nothing in a project the IDE does not trust. `claude` runs with `-p`, which turns off its own workspace trust
 * check, so an untrusted folder's settings (hooks, environment overrides, MCP servers) would apply unasked. The answer
 * is asked for on every launch; nothing waits for the project to become trusted — the user restarts the session.
 */
class TrustGatedPlanner(
    private val trusted: () -> Boolean,
    private val planner: SessionLaunchPlanner,
) : SessionLaunchPlanner {
    override suspend fun plan(
        sessionId: String,
        workingDirectory: String?,
    ): SessionLaunch {
        if (!trusted()) throw SessionStartException(SessionFailure.ProjectNotTrusted)
        return planner.plan(sessionId, workingDirectory)
    }
}
