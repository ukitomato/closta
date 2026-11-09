package dev.ukitomato.closta.platforms.intellij.launch

import com.intellij.execution.ExecutionException
import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.wsl.WSLCommandLineOptions
import com.intellij.execution.wsl.WslDistributionManager
import com.intellij.openapi.project.Project
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.providers.claude.launch.ProbeOutput
import dev.ukitomato.closta.providers.claude.launch.WslLocation
import dev.ukitomato.closta.providers.claude.launch.WslOptions
import dev.ukitomato.closta.providers.claude.launch.WslRunner
import dev.ukitomato.closta.providers.claude.launch.WslUnavailableException
import dev.ukitomato.closta.providers.claude.launch.distroNamed
import java.io.IOException
import java.nio.file.Path
import java.util.concurrent.TimeUnit

/**
 * The IDE's side of a WSL launch: the only place that uses `com.intellij.execution.wsl`. It turns a
 * distribution's name into a [WslRunner] over `WSLDistribution.patchCommandLine`, and asks a distribution where the CLI
 * keeps its records. The decisions (what is passed, where, how) are made by `WslSpawner`; this only carries them out.
 * Not tested without a Windows IDE (it is checked by hand). [log] gets lines that never hold an environment.
 */
class IdeWsl(
    private val project: Project,
    private val log: (String) -> Unit,
) {
    /** The runner of the installed distribution named [name] (case-blind), or null when there is none. */
    fun runnerFor(name: String): WslRunner? {
        val distribution =
            distroNamed(name, WslDistributionManager.getInstance().installedDistributions) { it.msId } ?: return null
        return WslRunner { args, env, linuxDirectory, options ->
            val command = GeneralCommandLine(args).withEnvironment(env)
            val wsl =
                WSLCommandLineOptions()
                    .setRemoteWorkingDirectory(linuxDirectory)
                    .setExecuteCommandInLoginShell(options.loginShell)
                    .setPassEnvVarsUsingInterop(options.envViaInterop)
            try {
                distribution.patchCommandLine(command, project, wsl).createProcess()
            } catch (failure: ExecutionException) {
                throw WslUnavailableException(
                    failure.message ?: ClostaBundle.message("launch.wsl.couldNotStart"),
                    distribution.msId,
                ).apply { initCause(failure) }
            }
        }
    }

    /**
     * The place of the CLI's records in [location]'s distribution as a UNC path, or null when it cannot be found. It
     * asks the login shell, as the CLI is started, and gives up after [PROBE_SECONDS]. Blocks: not for the EDT.
     */
    @Suppress("TooGenericExceptionCaught") // any failure here only means no place, and the reason is logged
    fun recordHome(location: WslLocation): Path? {
        var reason = "the probe could not be run"
        val path =
            try {
                val runner = runnerFor(location.distro)
                val process = runner?.start(WslLocation.PROBE_ARGV, emptyMap(), "/", WslOptions.CLI)
                val output = process?.let { ProbeOutput.within(it, TimeUnit.SECONDS.toMillis(PROBE_SECONDS)) }
                reason =
                    when {
                        runner == null -> "the distribution was not found"
                        process == null -> "the probe could not be started"
                        output == null -> "no answer within $PROBE_SECONDS seconds"
                        else -> "the answer had no ${WslLocation.HOME_MARK} line"
                    }
                output?.let(location::recordHome)?.let { Path.of(it) }
            } catch (ignored: RuntimeException) {
                null
            } catch (ignored: IOException) {
                null
            }
        val line =
            if (path != null) {
                "the CLI's records are read from $path"
            } else {
                "the CLI's config directory could not be found ($reason)"
            }
        log("WSL ${location.distro}: $line")
        return path
    }

    companion object {
        const val PROBE_SECONDS = 5L
    }
}
