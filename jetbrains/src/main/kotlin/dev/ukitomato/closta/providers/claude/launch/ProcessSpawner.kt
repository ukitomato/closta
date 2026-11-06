package dev.ukitomato.closta.providers.claude.launch

import dev.ukitomato.closta.providers.claude.AgentProcess
import java.io.IOException

/**
 * Creates the OS process for a launch. Splitting this out keeps the process-to-[AgentProcess]
 * bridge ([ProcessAgentProcess]) free of `com.intellij`: the **native** spawner below uses only `ProcessBuilder`,
 * and the **WSL** spawner ([WslSpawner]) implements this same seam; only the part that touches the IDE's WSL
 * support (`WSLDistribution`) is in `platforms`. `env`
 * travels in the process environment, never on argv; `workingDir` is set explicitly.
 *
 * A spawner that can tell that the process could not be created because [workingDir] is not a folder (on the machine
 * the process would run on) may throw [WorkingDirectoryMissingException], an [IOException]; one that does not simply
 * throws its own [IOException], which the session reports as a launch that failed.
 */
fun interface ProcessSpawner {
    fun spawn(
        args: List<String>,
        env: Map<String, String>,
        workingDir: String?,
    ): Process
}

/**
 * A non-WSL spawner (`ProcessBuilder`), for an IDE running natively on Linux/macOS and for tests. It does not
 * force a login shell: unlike WSL (`~/.local/bin` needs the user's shell init), a native
 * `claude` is normally already on PATH. stderr is left to the [AgentProcess] to drain (not redirected here).
 */
object NativeProcessSpawner : ProcessSpawner {
    override fun spawn(
        args: List<String>,
        env: Map<String, String>,
        workingDir: String?,
    ): Process {
        val builder = ProcessBuilder(args)
        builder.environment().putAll(env)
        workingDir?.let { builder.directory(java.io.File(it)) }
        return builder.startIn(workingDir)
    }
}

/**
 * A native spawner like [NativeProcessSpawner] that does not pass [dropped] on from the environment the IDE was started
 * with: a Bedrock launch must not let an inherited `AWS_PROFILE` or another provider's switch override the
 * credentials it injects. Everything else is inherited as before, and `env` is laid over it.
 */
class FilteringProcessSpawner(
    val dropped: Set<String>,
) : ProcessSpawner {
    override fun spawn(
        args: List<String>,
        env: Map<String, String>,
        workingDir: String?,
    ): Process {
        val builder = ProcessBuilder(args)
        overlayEnvironment(builder.environment(), dropped, env)
        workingDir?.let { builder.directory(java.io.File(it)) }
        return builder.startIn(workingDir)
    }
}

/**
 * The process could not be created and the working folder it was given ([path]) is not a folder. Thrown by a spawner
 * that checked, so that the failure is told apart from `claude` being missing.
 */
class WorkingDirectoryMissingException(
    val path: String,
    cause: IOException,
) : IOException(cause.message ?: "The working folder $path was not found", cause)

// Starts [this]; when that fails and a working folder was given that is not a folder, says so by type.
private fun ProcessBuilder.startIn(workingDir: String?): Process =
    try {
        start()
    } catch (failure: IOException) {
        if (workingDir != null && !java.io.File(workingDir).isDirectory) {
            throw WorkingDirectoryMissingException(workingDir, failure)
        }
        throw failure
    }

/** Removes [dropped] from an inherited [environment], then lays [env] over it: a key in [env] wins over both. */
fun overlayEnvironment(
    environment: MutableMap<String, String>,
    dropped: Set<String>,
    env: Map<String, String>,
) {
    environment.keys.removeAll(dropped)
    environment.putAll(env)
}

/** Launches `claude` for [spec] with [spawner] and wraps the process as an [AgentProcess]. */
fun launchClaude(
    spec: ClaudeLaunchSpec,
    spawner: ProcessSpawner = NativeProcessSpawner,
): AgentProcess = ProcessAgentProcess(spawner.spawn(spec.toArgv(), spec.childEnv(), spec.cwd))
