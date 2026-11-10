package dev.ukitomato.closta.platforms.intellij.session

import dev.ukitomato.closta.core.interfaces.SavedSessions
import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.core.models.ConversationState
import dev.ukitomato.closta.presenter.view.ControlKind
import dev.ukitomato.closta.presenter.view.PresenterInput
import dev.ukitomato.closta.presenter.view.SwitchKind
import dev.ukitomato.closta.presenter.view.SwitchOutcome
import dev.ukitomato.closta.presenter.view.SwitchRecord
import dev.ukitomato.closta.presenter.view.asksForSettings
import dev.ukitomato.closta.presenter.view.runningTasks
import dev.ukitomato.closta.presenter.view.threadIsRunning
import dev.ukitomato.closta.providers.claude.AgentProcess
import dev.ukitomato.closta.providers.claude.ClaudeSession
import dev.ukitomato.closta.providers.claude.launch.ProcessSpawner
import dev.ukitomato.closta.providers.claude.launch.launchClaude
import dev.ukitomato.closta.providers.claude.mcp.McpAgentProcess
import dev.ukitomato.closta.providers.claude.mcp.SdkMcpServer
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.async
import kotlinx.coroutines.cancel
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import java.util.UUID
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds

/**
 * One session's life, inside the [scope] its owner cut for it: plan the launch, check `claude --version`, start the
 * long-lived process through [launchClaude], fold its events, and notice when it ends. Cancelling [scope]
 * (through [close], or by the owner's own scope) ends it; `ClaudeSession` destroys the process when its collection
 * stops.
 *
 * Every process is registered with [live] inside the same IO block that creates it, and the body's `finally` destroys
 * whatever is registered. That is what keeps a process from escaping a cancellation that lands between the spawn and
 * the first collection: `withContext` throws away its result when the caller was cancelled meanwhile, and the
 * process it created would otherwise have no owner.
 *
 * With [sdkServers] the started process goes through [McpAgentProcess], which declares the servers in an
 * `initialize` written before anything else and answers the CLI's `mcp_message` requests. With none — the default —
 * nothing is wrapped and no `initialize` is written: the session is a plain one.
 *
 * Free of `com.intellij`, so the fast `src/test` suite measures it with fake processes.
 */
@Suppress("LongParameterList", "TooManyFunctions") // the session's inputs, each with its own meaning; its steps
class SessionRuntime(
    val id: String,
    private val scope: CoroutineScope,
    private val planner: SessionLaunchPlanner,
    /** The folder the CLI runs in; null is the project's root. */
    val workingDirectory: String?,
    private val log: SessionLog,
    private val versionTimeout: Duration = ClaudeVersionProbe.TIMEOUT,
    private val sdkServers: List<SdkMcpServer> = emptyList(),
    /** The effort level the process is started with, or null for the CLI's own. */
    private val effort: String? = null,
    /**
     * How this session is opened. For a resume [id] is the saved session's id: the id of a resumed
     * session is the one it was saved under, so the tree's thread, the bridge's checks and the user lines written to
     * the CLI all say the id the CLI says. For a fork [id] is a new id the host chose, and the CLI is told to fork.
     * The earlier conversation is still put back from the record of the saved session.
     */
    private val opening: SessionOpening = SessionOpening.New,
    /** Where the record of the saved session is read from, to put the earlier conversation back. */
    private val saved: SavedSessions? = null,
    /** Called before each user message is written to the CLI (it saves the IDE's unsaved documents). */
    private val beforeSend: suspend () -> Unit = {},
    /**
     * The permission mode new sessions start in, read once when this session starts; null leaves it to the
     * CLI. Read each time a session starts, so a change in Settings applies from the next one.
     */
    private val startMode: () -> String? = { null },
    /** How long a close waits for the process to end before it lets the scope finish. */
    private val closeWait: Duration = CLOSE_WAIT,
    private val killWait: Duration = KILL_WAIT,
    /** Whether the CLI is launched in the sandbox (`--settings`); a restart can turn it on later ([turnSandboxOn]). */
    private val sandbox: Boolean = false,
) {
    init {
        // A resumed session is opened by the id it was saved under: the tree's thread, the bridge's checks and the user
        // lines written to the CLI all say the id the CLI says. A runtime that holds two ids would split them.
        // A fork is the exception: its id is a new one the host made (the CLI is told it with --session-id), not the id
        // it forks from.
        require(opening !is SessionOpening.Resume || opening.id == id) { "a resumed session's id is the id it resumes" }
    }

    private val live = LiveProcesses()
    private val statusFlow = MutableStateFlow<SessionStatus>(SessionStatus.Starting)
    private val store = ConversationStore()

    // Set by [closeJob] before it cancels the scope: only that close waits for the process to end.
    @Volatile private var waitOnClose = false

    // Read by [turnSandboxOn] on the caller's thread and written by the session's coroutine: the job collecting the
    // process that runs now, and the sandbox switch a restart is marked for (cleared once the old process ended).
    @Volatile private var processJob: Job? = null

    @Volatile private var restartFor: String? = null

    // The process that runs now: the one a close through [closeJob] waits for.
    @Volatile private var current: AgentProcess? = null

    // The earlier conversation is put back once, by the first process (the session's coroutine only).
    private var restored = false

    /** Where this session is; it ends at Ended, Failed or Closed. */
    val status: StateFlow<SessionStatus> = statusFlow.asStateFlow()

    /** The conversation folded from this session's events. */
    val conversation: StateFlow<ConversationState> = store.state

    /** The conversation and its transcript, which the webview's tree is projected from. */
    val view: StateFlow<SessionView> = store.view

    /**
     * Lists the project's saved sessions into this session's view, whatever state the session is in: the record
     * is read without the CLI, so a session that is starting, or failed to start, or ended, can still be asked, and the
     * user can pick another from it. A closed session is not asked: its view is no one's (a restart closes it before
     * the new one is bound), and a list that comes back after it was closed, or after its asker went, is not written.
     */
    suspend fun listSaved() {
        if (status.value is SessionStatus.Closed) return
        val listed = listing(saved, id, log)
        currentCoroutineContext().ensureActive()
        if (status.value is SessionStatus.Closed) return
        store.transition { it.listed(listed) }
    }

    /** Starts the session in its scope. Returns at once. */
    fun start(): Job = scope.launch { run() }

    /** Ends the session: its scope is cancelled, and with it the process. Returns at once. */
    fun close() {
        statusFlow.value = SessionStatus.Closed
        scope.cancel()
    }

    /**
     * [close], returning the scope's [Job], which is complete when the process has ended or [closeWait] has
     * passed: a caller that must not start something before this process is gone (a fork of this session's own
     * record) joins it. Apart from [close] so that [close] stays a function returning nothing: a test written as
     * `= runBlocking { …; runtime.close() }` returns what its last call returns, and JUnit does not run a test that
     * returns a value.
     */
    fun closeJob(): Job {
        val job = scope.coroutineContext.job
        waitOnClose = true
        statusFlow.value = SessionStatus.Closed
        scope.cancel()
        return job
    }

    /**
     * Destroys this session's processes now, on the calling thread. For the owner's disposal, as a second guard: the
     * IDE cancels the owner's scope and waits for it when the project closes or the IDE exits, but how long it waits
     * depends on its settings, and this ends the processes even if that wait is cut short.
     */
    fun destroyNow() = live.destroyAll()

    /**
     * Turns the sandbox on: the CLI is started again with `--settings` (a restart, as a live `apply_flag_settings`
     * was seen to say yes while Bash still ran outside the sandbox: capture 36), under the same runtime, so the
     * conversation, the records and the tab stay. Nothing happens when the session is not running or a switch of the
     * sandbox already waits; a turn or a background task that runs refuses it, on the record. Returns whether a
     * restart was started: the switch is then pending until the new CLI's settings say whether the sandbox is on.
     */
    suspend fun turnSandboxOn(): Boolean {
        val id = UUID.randomUUID().toString()
        val running = status.value as? SessionStatus.Running
        var stopping: Job? = null
        var marked = false
        if (running != null && restartFor == null) {
            // Under the store's lock, so two presses make one switch.
            store.transition { view ->
                val transcript = view.transcript
                when {
                    restartFor != null || transcript.operations.switches.any { it.isPendingSandbox() } -> view
                    threadIsRunning(view.conversation, transcript) || runningTasks(transcript).isNotEmpty() ->
                        view.requested(PresenterInput.SandboxRefused(id))
                    // From the mark on the session is Starting, so nothing is sent through the commands of the CLI
                    // that is being stopped. A status that moved meanwhile (a close) is kept, and nothing is marked.
                    !statusFlow.compareAndSet(running, SessionStatus.Starting) -> view
                    else -> {
                        marked = true
                        restartFor = id
                        // The job of the process that runs now, taken with the mark: a job started after it sees
                        // the mark itself (runProcess), and must not be cancelled from here.
                        stopping = processJob
                        view.requested(PresenterInput.ControlRequested(id, ControlKind.SANDBOX, SANDBOX_ON))
                    }
                }
            }
        }
        // The process's collection is stopped; the session's own coroutine starts the next one (runProcess).
        stopping?.cancel()
        return marked
    }

    // The session's life in order: start, read, settle. Split, the order is lost.
    private suspend fun run() {
        var closing = false
        var spawner: ProcessSpawner? = null
        val outcome =
            try {
                val mode = startMode()
                // A rewind finds where to cut before anything is started: a record without the point is a failure
                // that no process was spent on.
                val cut = cutPoint()
                val launch = withChoices(plan(), mode, cut)
                spawner = launch.spawner
                val version = ClaudeVersionProbe.version(launch, versionTimeout, live)
                log.info("claude session $id: ${ClaudeVersionProbe.argv(launch)} -> $version")
                runProcesses(launch, version)
            } catch (cancel: CancellationException) {
                statusFlow.value = SessionStatus.Closed
                closing = waitOnClose
                throw cancel
            } catch (start: SessionStartException) {
                SessionStatus.Failed(SessionFailure.forSpawner(start.failure, spawner))
            } catch (
                @Suppress("TooGenericExceptionCaught") failure: Exception,
            ) {
                SessionStatus.Failed(SessionFailure.forSpawner(SessionFailure.ended(failure), spawner))
            } finally {
                live.destroyAll()
                // A switch into the sandbox that the session ended before (a close mid-restart, a CLI that failed) is
                // over with it: it does not stay pending.
                withContext(NonCancellable) { failPendingSandbox() }
                // Only a close through [closeJob] waits (a Failed or Ended session publishes its state at once, and
                // [close] and the owner's own cancellation do not wait): the scope's Job stays
                // open until the process is gone, so a fork of this session's record starts after the CLI stopped
                // writing it.
                if (closing) current?.let { awaitEnd(it, closeWait, killWait, id, log) }
            }
        statusFlow.value = outcome
        when (outcome) {
            // The kind only: the cause can name the working folder or carry an exception's text with a path in it.
            is SessionStatus.Failed -> log.warn("claude session $id: failed (${outcome.failure.javaClass.simpleName})")
            else -> log.info("claude session $id: ended")
        }
    }

    /**
     * The session's processes one after another: the launch's, then a restart into the sandbox, or the one start
     * without it that follows a CLI that could not sandbox. The plan, the version check and the restore of the earlier
     * conversation are done once, for all of them.
     */
    private suspend fun runProcesses(
        first: SessionLaunch,
        version: String,
    ): SessionStatus {
        var spec = first.spec
        var switchId: String? = null
        var relaunch = false
        while (true) {
            val end = runProcess(SessionLaunch(first.spawner, spec), version, relaunch, switchId)
            spec =
                when (end) {
                    ProcessEnd.Ended -> return SessionStatus.Ended
                    is ProcessEnd.NotStarted -> spec.copy(sandbox = false)
                    is ProcessEnd.Restart -> {
                        val sent = view.value.transcript.routing.sends > 0
                        restartSpec(first.spec, opening, sent, carriedChoices(view.value), sandbox = true)
                    }
                }
            switchId = (end as? ProcessEnd.Restart)?.switchId
            relaunch = true
            // A close that landed while the old process was waited for is not overwritten by a start.
            currentCoroutineContext().ensureActive()
            statusFlow.value = SessionStatus.Starting
        }
    }

    /**
     * Starts one process and folds what it says until it ends. [switchId] is the sandbox switch this start serves, if
     * it is one. The process's collection runs in a job of its own, which [turnSandboxOn] cancels; the next process is
     * started only after that job is over (so nothing the old CLI answers is folded after the new one's `Launched`)
     * and the old process has ended (so two CLIs never write the same record).
     */
    private suspend fun runProcess(
        planned: SessionLaunch,
        version: String,
        relaunch: Boolean,
        switchId: String?,
    ): ProcessEnd {
        val process = startProcess(planned, switchId)
        val session = ClaudeSession(process, id)
        val sandboxed = planned.spec.sandbox
        // The tree says the effort and the in-process MCP servers' names from its first snapshot on, before the
        // session is Running. A session with neither says nothing; one with only the names (no effort) says
        // them (the list of MCP servers shows them as the host's own). Every start after the first says what it
        // was started with, the sandbox included.
        val declared = sdkServers.map { it.name }
        val saysSomething = effort != null || declared.isNotEmpty()
        if (relaunch || sandboxed || saysSomething) {
            val started = if (relaunch) planned.spec.effort else effort
            store.transition { it.requested(PresenterInput.Launched(started, declared, sandboxed)) }
        }
        // After the first process is up (a start that fails restores nothing) and before anything it says is
        // folded, and before the session runs, so nothing the user sends can come before the earlier conversation.
        // Once: a restart keeps the view, and with it what was put back.
        if (!restored) {
            restored = true
            restoreHistory()
        }
        val commands = SessionCommands(session, SystemClock(), store, beforeSend, log::warn)
        statusFlow.value = SessionStatus.Running(version, commands)
        // A CLI in the sandbox is asked its settings at once, so a session that writes no `initialize` still
        // learns whether the sandbox is on.
        if (sandboxed) askSettings(commands)
        var ended: ProcessEnd? = null
        coroutineScope {
            val job = launch { ended = collect(session, commands, sandboxed) }
            processJob = job
            // A switch marked before this job was known cancels it here: one of the two sides always sees the other.
            if (restartFor != null) job.cancel()
            job.join()
        }
        return settled(process, ended, switchId)
    }

    // How the process whose collection is over ended, with the records that says: a CLI that did not start in the
    // sandbox fails its switch (before anything else is started), and a restart waits for the old process to end.
    private suspend fun settled(
        process: AgentProcess,
        ended: ProcessEnd?,
        switchId: String?,
    ): ProcessEnd {
        if (ended is ProcessEnd.NotStarted) {
            val record = switchId ?: UUID.randomUUID().toString()
            store.transition { it.requested(PresenterInput.SandboxNotStarted(record, ended.detail)) }
        }
        val mark = restartFor
        val end = if (mark != null) ProcessEnd.Restart(mark) else checkNotNull(ended)
        if (end != ProcessEnd.Ended) {
            restartFor = null
            // A job cancelled before it ran never collected, so nothing else destroyed the process.
            process.destroy()
            awaitEnd(process, closeWait, killWait, id, log)
        }
        return end
    }

    // A switch into the sandbox whose CLI could not be created is over: the session fails, and the switch with it.
    private suspend fun startProcess(
        launch: SessionLaunch,
        switchId: String?,
    ): AgentProcess {
        val process =
            try {
                // [current] is set where the process is registered, so a cancellation right after the spawn still
                // finds it to wait for.
                withContext(Dispatchers.IO) {
                    live.track(withServers(launchProcess(launch)), AgentProcess::destroy).also { current = it }
                }
            } catch (start: SessionStartException) {
                if (switchId != null) {
                    store.transition { it.requested(PresenterInput.SandboxNotStarted(switchId, null)) }
                }
                throw start
            }
        log.info("claude session $id: started ${launch.spec.toArgv()}")
        return process
    }

    /**
     * Folds what one process says until it ends. A CLI asked into the sandbox that ends having said nothing but a
     * `result` did not start ([SandboxStartWatch]): whether it exited with 0 or not, that is no failure of the session,
     * and its result is not folded.
     */
    private suspend fun collect(
        session: ClaudeSession,
        commands: SessionCommands,
        sandboxed: Boolean,
    ): ProcessEnd {
        val watch = SandboxStartWatch(sandboxed)
        // A sandboxed CLI was asked its settings as it started.
        val checks = ProcessChecks(forkChecked = opening !is SessionOpening.Fork, settingsAsked = sandboxed)
        try {
            session.events.collect { line -> watch.pass(line).forEach { foldEvent(it, commands, checks) } }
        } catch (cancel: CancellationException) {
            throw cancel
        } catch (
            @Suppress("TooGenericExceptionCaught") failure: Exception,
        ) {
            if (watch.started) throw failure
        }
        return if (watch.started) ProcessEnd.Ended else ProcessEnd.NotStarted(watch.detail)
    }

    // What one process was checked for; each process is checked again.
    private class ProcessChecks(
        var forkChecked: Boolean,
        var settingsAsked: Boolean,
    )

    private suspend fun foldEvent(
        event: AgentEvent,
        commands: SessionCommands,
        checks: ProcessChecks,
    ) {
        // A fork's first system/init says the id the CLI opened it under; the plugin's tree, tab and history
        // all run on the id it gave, so a different one stops the session. The check is before the
        // init is folded, not before the first message is written: the CLI says init after the first user line
        // (captures 25 and 26), so when the ids differ that turn has reached the CLI, and the record it keeps
        // under its own id stays (History may list it). Thrown as a start failure, though the session runs:
        // it is handled the same way (the process is closed, the status is Failed).
        if (!checks.forkChecked && event is AgentEvent.SystemInit) {
            checks.forkChecked = true
            if (event.sessionId != id) throw SessionStartException(SessionFailure.ForkIdMismatch)
        }
        // The settings in effect (the effort and the model the next request goes with) are asked for
        // once `initialize` is answered, and again after a model or an effort switch the CLI took. A session
        // with no `initialize` (no in-process server) asks at its first `system/init`.
        val asks =
            store.view.value.transcript.operations
                .asksForSettings(event) ||
                (!checks.settingsAsked && event is AgentEvent.SystemInit)
        store.transition { it.event(PresenterInput.Event(event)) }
        if (asks) {
            checks.settingsAsked = true
            askSettings(commands)
        }
    }

    private suspend fun failPendingSandbox() {
        store.transition { view ->
            val pending =
                restartFor ?: view.transcript.operations.switches
                    .lastOrNull { it.isPendingSandbox() && it.value == SANDBOX_ON }
                    ?.id
            restartFor = null
            if (pending == null) view else view.requested(PresenterInput.SandboxNotStarted(pending, null))
        }
    }

    // A settings request that could not be written is recorded as failed by the commands; it is not a reason to end
    // the session, whose own end the event stream says.
    private suspend fun askSettings(commands: SessionCommands) {
        try {
            commands.requestSettings()
        } catch (cancel: CancellationException) {
            throw cancel
        } catch (
            @Suppress("TooGenericExceptionCaught") failure: Exception,
        ) {
            log.warn("claude session $id: the settings could not be asked for (${failure.javaClass.name})")
        }
    }

    @Suppress("SwallowedException")
    private suspend fun plan(): SessionLaunch =
        try {
            planner.plan(id, workingDirectory)
        } catch (cancel: CancellationException) {
            throw cancel
        } catch (named: SessionStartException) {
            // A failure the planner can name (an untrusted project, a sign-in that is not there) keeps its own words.
            throw named
        } catch (
            @Suppress("TooGenericExceptionCaught") failure: Exception,
        ) {
            // The planner's own types say what failed; their messages are not ours to vouch for.
            throw SessionStartException(SessionFailure.PlanFailed(failure.javaClass.name))
        }

    // The planner knows the provider and not the effort, which is the user's choice for this session, and makes a
    // new session's launch: a resumed one is opened by the id it was saved under.
    private fun withChoices(
        launch: SessionLaunch,
        permissionMode: String?,
        cut: String?,
    ): SessionLaunch {
        val asPlanned = effort == null && opening == SessionOpening.New && permissionMode == null
        return if (asPlanned && !sandbox) {
            launch
        } else {
            SessionLaunch(
                launch.spawner,
                launch.spec.copy(
                    effort = effort ?: launch.spec.effort,
                    resume = opening.savedId ?: launch.spec.resume,
                    forkSession = opening is SessionOpening.Fork || launch.spec.forkSession,
                    resumeSessionAt = cut ?: launch.spec.resumeSessionAt,
                    permissionMode = permissionMode ?: launch.spec.permissionMode,
                    sandbox = sandbox,
                ),
            )
        }
    }

    // Where a rewound fork is cut: the parent of the line it rewinds to, read from the saved record. Null when
    // the opening is not a rewind. A record that has no such line (or no parent for it, or cannot be read) is a
    // failure, said once in the log.
    private suspend fun cutPoint(): String? {
        val fork = opening as? SessionOpening.Fork
        val line = fork?.rewindBefore ?: return null
        return readCutPoint(fork.id, line) ?: throw SessionStartException(SessionFailure.RewindPointMissing)
    }

    private suspend fun readCutPoint(
        from: String,
        line: String,
    ): String? =
        try {
            saved?.cutPoint(from, line).also { if (it == null) log.warn("claude session $id: no point to cut at") }
        } catch (cancel: CancellationException) {
            throw cancel
        } catch (
            @Suppress("TooGenericExceptionCaught") failure: Exception,
        ) {
            log.warn("claude session $id: no cut point, the record could not be read (${failure.javaClass.name})")
            null
        }

    /**
     * Puts the earlier conversation of a resumed session back into the view, from its saved record, in two writes
     * (the newest lines, then all of them; [restoreSteps]): the lines through the same fold stdout's go through, then
     * the mark that they end there. A record that cannot be read
     * is not a reason to fail the session: it goes on without it, and the view says so. Only the type of the failure is
     * logged, as its message may carry the record.
     */
    private suspend fun restoreHistory() {
        val from = opening.savedId ?: return
        val record = saved
        val read =
            try {
                val stopBefore = (opening as? SessionOpening.Fork)?.rewindBefore
                val source = checkNotNull(record) { "no saved sessions to read from" }
                if (stopBefore == null) source.read(from) else source.read(from, stopBefore)
            } catch (cancel: CancellationException) {
                throw cancel
            } catch (
                @Suppress("TooGenericExceptionCaught") failure: Exception,
            ) {
                log.warn("claude session $id: the saved record could not be read (${failure.javaClass.name})")
                store.transition { it.historyUnavailable() }
                return
            }
        // The newest lines first, so the first screen comes quickly, then every line in their place: each step is
        // folded onto the view from before the restore. Nothing else is folded between them, as the session is not
        // running yet and its stdout is read only after this.
        lateinit var before: SessionView
        for ((index, step) in restoreSteps(read.events, read.dropped).withIndex()) {
            val (lines, dropped) = step
            store.transition { now ->
                if (index == 0) before = now
                before.restored(lines, dropped)
            }
        }
        log.info("claude session $id: put back ${read.events.size} lines of the saved record ($read)")
    }

    private fun withServers(process: AgentProcess): AgentProcess =
        if (sdkServers.isEmpty()) process else McpAgentProcess(process, sdkServers)

    private fun launchProcess(launch: SessionLaunch): AgentProcess =
        try {
            launchClaude(launch.spec, launch.spawner)
        } catch (
            @Suppress("TooGenericExceptionCaught") failure: Exception,
        ) {
            throw SessionStartException(SessionFailure.launchFailed(failure))
        }
}

/** How long [SessionRuntime.closeJob] waits for the process to end. */
internal val CLOSE_WAIT: Duration = 5.seconds
internal val KILL_WAIT: Duration = 2.seconds

private const val SANDBOX_ON = "true"

private fun SwitchRecord.isPendingSandbox(): Boolean = kind == SwitchKind.SANDBOX && outcome == SwitchOutcome.PENDING

// The real process's awaitExit is a blocking waitFor that neither a cancellation nor a timeout interrupts, so it runs
// in a scope of its own and only the wait for its result is bounded; a process that does not end leaves that thread
// until it does.
private suspend fun awaitEnd(
    process: AgentProcess,
    wait: Duration,
    killWait: Duration,
    id: String,
    log: SessionLog,
) {
    val exited = CoroutineScope(Dispatchers.IO).async { runCatching { process.awaitExit() } }
    val ended = withContext(NonCancellable) { withTimeoutOrNull(wait) { exited.await() } }
    when {
        ended == null -> {
            log.warn("claude session $id: closed, the process did not end in $wait")
            // A process that ignored the end signal is killed; the wait for its end goes on for a short while.
            runCatching { process.destroyForcibly() }.onFailure {
                log.warn("claude session $id: the kill failed (${it.javaClass.name})")
            }
            val killed = withContext(NonCancellable) { withTimeoutOrNull(killWait) { exited.await() } }
            if (killed == null) {
                exited.cancel()
                log.warn("claude session $id: the process did not end after a kill")
            } else {
                // A killed CLI had no chance to flush, so the last lines of its saved record may be missing.
                log.warn("claude session $id: killed, the process ended; the end of its saved record may be missing")
            }
        }
        ended.isSuccess -> log.info("claude session $id: closed, the process ended")
        else -> {
            val type = ended.exceptionOrNull()?.javaClass?.name
            log.warn("claude session $id: closed, waiting for the process failed ($type)")
        }
    }
}
