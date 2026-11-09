package dev.ukitomato.closta.platforms.intellij.session

import dev.ukitomato.closta.providers.claude.launch.ProcessSpawner
import dev.ukitomato.closta.providers.claude.launch.WslLocation
import java.nio.file.Path

/**
 * Starts a WSL project's `claude` in its distribution: what [inner] plans is kept as it is, and only the
 * spawner is replaced by [spawnerFor] — so the version check, the conversation, Anthropic and Bedrock are all covered
 * in one place. With no [location] (not a WSL project, or an IDE that is not on Windows) the plan is returned as it
 * came. One line says where `claude` starts; it never holds the environment.
 */
class WslAwarePlanner(
    private val inner: SessionLaunchPlanner,
    private val location: WslLocation?,
    private val spawnerFor: (WslLocation) -> ProcessSpawner,
    private val log: SessionLog,
) : SessionLaunchPlanner {
    override suspend fun plan(
        sessionId: String,
        workingDirectory: String?,
    ): SessionLaunch {
        val launch = inner.plan(sessionId, workingDirectory)
        if (location == null) return launch
        // Not the folder: a path holds the user's name.
        log.info("claude session $sessionId: launching in WSL ${location.distro}")
        return SessionLaunch(spawnerFor(location), launch.spec)
    }
}

/** What the reader of the saved sessions is given: the config directory, the folder, and whether to resolve it. */
class RecordSource(
    val configDir: () -> Path?,
    val workingDirectory: String?,
    val resolveLinks: Boolean,
)

/**
 * Where the saved sessions of the project in [directory] are read from: for a WSL project the place [wslRecordHome]
 * finds in its distribution, named from the Linux path, which is not resolved here; otherwise [nativeConfigDir] and
 * the directory as it is, resolved to its real path as before.
 */
fun recordSource(
    directory: String?,
    location: WslLocation?,
    nativeConfigDir: Path,
    wslRecordHome: (WslLocation) -> Path?,
): RecordSource =
    if (location == null) {
        RecordSource({ nativeConfigDir }, directory, resolveLinks = true)
    } else {
        RecordSource({ wslRecordHome(location) }, location.linuxPath, resolveLinks = false)
    }
