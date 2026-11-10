package dev.ukitomato.closta.platforms.intellij.session

import com.intellij.ide.trustedProjects.TrustedProjects
import com.intellij.openapi.Disposable
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.util.SystemInfo
import com.intellij.platform.util.coroutines.childScope
import dev.ukitomato.closta.core.interfaces.SavedSessions
import dev.ukitomato.closta.core.models.SavedSessionSummary
import dev.ukitomato.closta.platforms.intellij.auth.BedrockSignInService
import dev.ukitomato.closta.platforms.intellij.ide.IdeBridgeService
import dev.ukitomato.closta.platforms.intellij.launch.IdeWsl
import dev.ukitomato.closta.platforms.intellij.settings.BehaviourRecords
import dev.ukitomato.closta.platforms.intellij.settings.ProviderPick
import dev.ukitomato.closta.platforms.intellij.settings.ProviderSettings
import dev.ukitomato.closta.platforms.intellij.settings.launchFor
import dev.ukitomato.closta.platforms.intellij.store.AppSettingsStore
import dev.ukitomato.closta.providers.claude.history.ProjectTranscripts
import dev.ukitomato.closta.providers.claude.launch.WslLocation
import dev.ukitomato.closta.providers.claude.launch.WslSpawner
import dev.ukitomato.closta.providers.claude.mcp.ideContextServers
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import java.nio.file.Path
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/**
 * Owns this project's Claude sessions and ties their lifetime to the IDE's. Each session gets a named child of the
 * injected scope; closing a session cancels its child, and closing the project cancels them all, which ends each
 * process through `ClaudeSession`'s teardown.
 *
 * The IDE cancels a project's scope and waits for it when the project closes or the IDE exits; how long it waits
 * depends on its settings, so [dispose] also destroys every session's processes on the spot, as a second guard.
 *
 * Nothing starts in a project the IDE does not trust, and the launch follows the provider chosen for new sessions in
 * Settings | Tools | Closta; an Amazon Bedrock provider signs in first, over this project's window.
 *
 * What the IDE can tell Claude: the project's [IdeBridgeService] is asked for the in-process MCP servers it
 * can back, and each session is given them. A bridge without diagnostics gives none, and the session is not wrapped.
 *
 * A light project service: registered by the annotation, not in plugin.xml.
 */
@Service(Service.Level.PROJECT)
class ClaudeSessionService(
    private val project: Project,
    private val scope: CoroutineScope,
) : Disposable {
    private val sessions = ConcurrentHashMap<String, SessionRuntime>()

    /**
     * Opens a new session and starts it; returns at once (spawning and the version check run off the calling thread).
     * [planner] decides how `claude` is launched — by default from the active provider — and nothing is launched
     * while the project is not trusted. [effort] is the level the process is started with; null leaves it to the
     * CLI. [sandbox] is whether it launches in the sandbox; null is the project's saved choice. With a saved
     * [opening] the session opens the saved session of that id instead of a new one: its id is that
     * id, and its earlier conversation is put back from the CLI's record; a fork is a copy under a new id. The session
     * runs in [workingDirectory], and its saved sessions are the ones of that directory; null is the project's root.
     */
    @Suppress("LongParameterList") // each is a separate choice of one session's opening
    fun open(
        planner: SessionLaunchPlanner? = null,
        effort: String? = null,
        opening: SessionOpening = SessionOpening.New,
        workingDirectory: String? = null,
        provider: ProviderPick = ProviderPick.Active,
        sandbox: Boolean? = null,
    ): SessionRuntime {
        val directory = workingDirectory ?: project.basePath
        val id = sessionIdFor(opening, UUID.randomUUID().toString())
        val ide = project.service<IdeBridgeService>()
        // A project in a WSL distribution is launched and read there; the trust check still comes first.
        val wsl = WslLocation.parse(directory, SystemInfo.isWindows)
        val ideWsl = IdeWsl(project, IdeSessionLog::info)
        val wslAware =
            WslAwarePlanner(
                planner ?: providerPlanner(provider),
                wsl,
                { WslSpawner(it, ideWsl::runnerFor) },
                IdeSessionLog,
            )
        val gated = TrustGatedPlanner({ TrustedProjects.isProjectTrusted(project) }, wslAware)
        val runtime =
            SessionRuntime(
                id,
                scope.childScope("Claude session $id"),
                gated,
                directory,
                IdeSessionLog,
                sdkServers = ideContextServers(ide, ide.cliPaths),
                effort = effort,
                opening = opening,
                saved = projectTranscripts(directory, wsl, ideWsl),
                beforeSend = saveBeforeSend(),
                startMode = { behaviour().initialPermissionMode?.wire },
                sandbox = launchSandbox(sandbox, SandboxMemory(service<AppSettingsStore>(), project.locationHash)),
            )
        sessions[id] = runtime
        runtime.start()
        return runtime
    }

    /**
     * Closes the session [id]; its process ends with its scope. The [Job] is complete when the process has ended or the
     * wait for it ran out; null for an unknown id, which is not touched.
     */
    fun close(id: String): Job? = sessions.remove(id)?.closeJob()

    /**
     * The project's saved sessions, read from the CLI's record without starting a CLI (the sessions list names the
     * sessions that ran when the project closed by them). Throws when the record cannot be read.
     */
    suspend fun savedSessions(): List<SavedSessionSummary> {
        val directory = project.basePath
        val wsl = WslLocation.parse(directory, SystemInfo.isWindows)
        return projectTranscripts(directory, wsl, IdeWsl(project, IdeSessionLog::info)).list()
    }

    /** Whether a session of [id] is open in this project now: another tab's, when the panel asks. */
    fun isOpen(id: String): Boolean = sessions.containsKey(id)

    /** A scope for a view of these sessions: cancelled when [parent] is disposed or the project closes. */
    fun viewScope(parent: Disposable): CoroutineScope =
        scope.childScope("Closta view").also { view -> Disposer.register(parent) { view.cancel() } }

    override fun dispose() {
        sessions.values.forEach(SessionRuntime::destroyNow)
    }

    // The CLI keeps its record in its config directory (CLAUDE_CONFIG_DIR, else ~/.claude). Started on the IDE's own OS
    // that is the IDE's own environment and home; for a project in WSL it is the one the CLI sees in its
    // distribution, read by its UNC path.
    private fun projectTranscripts(
        directory: String?,
        wsl: WslLocation?,
        ideWsl: IdeWsl,
    ): SavedSessions {
        val source =
            recordSource(
                directory,
                wsl,
                System.getenv("CLAUDE_CONFIG_DIR")?.takeIf { it.isNotBlank() }?.let(Path::of)
                    ?: Path.of(System.getProperty("user.home"), ".claude"),
                ideWsl::recordHome,
            )
        return ProjectTranscripts(
            configDir = source.configDir,
            workingDirectory = source.workingDirectory,
            resolveLinks = source.resolveLinks,
            log = IdeSessionLog::info,
        )
    }

    // Behaviour is read where it is used, never remembered: a change in Settings applies at the next message,
    // and at the next session.
    private fun behaviour() = BehaviourRecords.load(service<AppSettingsStore>(), IdeSessionLog::warn)

    private fun saveBeforeSend(): suspend () -> Unit {
        val step =
            SaveBeforeSend(
                enabled = { behaviour().saveBeforeSend },
                save = DocumentSaving::saveAll,
                log = IdeSessionLog::warn,
            )
        return { step() }
    }

    private fun providerPlanner(provider: ProviderPick): SessionLaunchPlanner =
        NativeSessionLaunchPlanner(
            activeLaunch = { service<ProviderSettings>().launchFor(provider) },
            signIn = { launch, stillCurrent -> service<BedrockSignInService>().signIn(project, launch, stillCurrent) },
        )

    private object IdeSessionLog : SessionLog {
        private val LOG = Logger.getInstance(ClaudeSessionService::class.java)

        override fun info(message: String) = LOG.info(message)

        override fun warn(message: String) = LOG.warn(message)
    }
}
