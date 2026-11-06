package dev.ukitomato.closta.providers.claude.launch

import java.io.IOException

/** How a launch in WSL is made: the two marks the IDE's WSL support turns into its options. */
data class WslOptions(
    /** Run through the user's login shell: `~/.local/bin` is on PATH only after its init. */
    val loginShell: Boolean,
    /** Pass the environment through WSLENV, so a value is never on a command line. */
    val envViaInterop: Boolean,
) {
    companion object {
        /** How the CLI itself is run, and the probe for where it keeps its records: the same both times. */
        val CLI = WslOptions(loginShell = true, envViaInterop = true)
    }
}

/** Starts a process inside one WSL distribution. The IDE implements it with `WSLDistribution`; tests with a fake. */
fun interface WslRunner {
    fun start(
        args: List<String>,
        env: Map<String, String>,
        linuxDirectory: String,
        options: WslOptions,
    ): Process
}

/** The process could not be started in WSL: no such distribution, or a working folder that is not in it. */
class WslUnavailableException(
    message: String,
    /** The distribution the launch was for. */
    val distro: String,
) : IOException(message)

/**
 * The [ProcessSpawner] of a WSL project. It decides how a launch is made — the working folder as a Linux path,
 * through the login shell, the environment by interop — and hands that to the [WslRunner] of the distribution
 * [findDistro] finds. Free of `com.intellij`.
 */
class WslSpawner(
    private val location: WslLocation,
    private val findDistro: (String) -> WslRunner?,
) : ProcessSpawner {
    /** The distribution this spawner starts in. */
    val distro: String get() = location.distro

    override fun spawn(
        args: List<String>,
        env: Map<String, String>,
        workingDir: String?,
    ): Process {
        val directory = location.linuxDirectoryOf(workingDir)
        val runner =
            findDistro(location.distro)
                ?: throw WslUnavailableException("WSL distribution ${location.distro} was not found", location.distro)
        return runner.start(args, env, directory, WslOptions.CLI)
    }

    // Only the distribution is named: nothing of a launch's environment is in any string form.
    override fun toString(): String = "WslSpawner(distro=${location.distro})"
}

/** The one of [installed] named [name], without regard to case (a UNC host and a Windows name are case-blind). */
fun <T : Any> distroNamed(
    name: String,
    installed: Collection<T>,
    nameOf: (T) -> String,
): T? = installed.firstOrNull { nameOf(it).equals(name, ignoreCase = true) }
