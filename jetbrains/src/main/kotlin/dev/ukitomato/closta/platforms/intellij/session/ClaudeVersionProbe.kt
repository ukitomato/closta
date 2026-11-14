package dev.ukitomato.closta.platforms.intellij.session

import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.runInterruptible
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import java.io.IOException
import java.io.InputStream
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds

/**
 * Runs `claude --version` the way the session itself will be started — same spawner, environment and working
 * directory, and the executable the session's argv names — and returns the version it prints. It doubles as the PATH
 * check: a `claude` that cannot be found fails here, before the long-lived process is started.
 *
 * The idle stream-json process prints nothing until the first turn, so the version cannot come from the session.
 * Free of `com.intellij`, so the fast `src/test` suite measures it with fake processes.
 */
internal object ClaudeVersionProbe {
    private const val TIMEOUT_SECONDS = 30
    private const val VERSION_FLAG = "--version"
    private val VERSION = Regex("\\d{1,9}\\.\\d{1,9}\\.\\d{1,9}[0-9A-Za-z.+-]{0,32}")

    /** How long `claude --version` may take before the check fails. */
    val TIMEOUT: Duration = TIMEOUT_SECONDS.seconds

    /** The command line of the check. */
    fun argv(launch: SessionLaunch): List<String> = listOf(launch.spec.toArgv().first(), VERSION_FLAG)

    /**
     * The version `claude --version` prints: the first word of its first non-empty line, when that word is a version
     * (such as 2.1.286). Throws [SessionStartException] when the process cannot be created, exits nonzero, prints
     * nothing or no version, or does not exit within [timeout]; what it printed instead is never repeated, since the
     * command on PATH may not be claude and runs with the launch's environment. The process is registered with
     * [live] the moment it exists and destroyed before this returns.
     */
    suspend fun version(
        launch: SessionLaunch,
        timeout: Duration,
        live: LiveProcesses,
    ): String {
        // A cancel that lands during the spawn makes withContext drop what it returns, so the process is kept here.
        var spawned: Process? = null
        val process =
            try {
                withContext(Dispatchers.IO) { live.track(spawn(launch), Process::destroy).also { spawned = it } }
            } catch (cancel: CancellationException) {
                spawned?.destroy()
                throw cancel
            }
        return coroutineScope {
            try {
                // stdout goes line by line into an UNLIMITED channel and stderr is drained, both on IO while the
                // process runs: a reader that stops lets the pipe fill and the child blocks on it (as seen over WSL's
                // stdio).
                val lines = Channel<String>(Channel.UNLIMITED)
                launch(Dispatchers.IO) { readLines(process.inputStream, lines) }
                launch(Dispatchers.IO) { drain(process.errorStream) }
                val exitCode =
                    withTimeoutOrNull(timeout) { runInterruptible(Dispatchers.IO) { process.waitFor() } }
                        ?: fail(failedCheck("session.versionCheck.noAnswer", timeout.toString()))
                if (exitCode != 0) fail(SessionFailure.versionExit(exitCode))
                val line = firstLine(lines) ?: fail(failedCheck("session.versionCheck.noOutput"))
                versionOf(line) ?: fail(failedCheck("session.versionCheck.notAVersion"))
            } finally {
                // Before this scope waits for the readers: their blocking reads return only once the process is gone.
                process.destroy()
            }
        }
    }

    private fun spawn(launch: SessionLaunch): Process =
        try {
            launch.spawner.spawn(argv(launch), launch.spec.env, launch.spec.cwd)
        } catch (
            @Suppress("TooGenericExceptionCaught") failure: Exception,
        ) {
            throw SessionStartException(SessionFailure.launchFailed(failure))
        }

    // A pipe that breaks because the process was destroyed has nothing more to say; what was read so far stands.
    @Suppress("SwallowedException")
    private fun readLines(
        stream: InputStream,
        lines: Channel<String>,
    ) {
        try {
            stream.bufferedReader().forEachLine { lines.trySend(it) }
        } catch (broken: IOException) {
            // the process is gone; the lines already sent stand
        } finally {
            lines.close()
        }
    }

    @Suppress("SwallowedException")
    private fun drain(stream: InputStream) {
        try {
            stream.readBytes()
        } catch (broken: IOException) {
            // the process is gone; stderr is not protocol
        }
    }

    private suspend fun firstLine(lines: Channel<String>): String? {
        for (line in lines) {
            val trimmed = line.trim()
            if (trimmed.isNotEmpty()) return trimmed
        }
        return null
    }

    /** The first word of [line] when it is a version — digits.digits.digits and a short suffix — else null. */
    fun versionOf(line: String): String? =
        line
            .trim()
            .split(' ', '\t')
            .first()
            .takeIf { VERSION.matches(it) }

    private fun fail(failure: SessionFailure): Nothing = throw SessionStartException(failure)

    private fun failedCheck(
        key: String,
        vararg params: Any,
    ): SessionFailure = SessionFailure.VersionCheckFailed(ClostaBundle.message(key, *params))
}
