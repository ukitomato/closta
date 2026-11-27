package dev.ukitomato.closta.platforms.intellij.session

import dev.ukitomato.closta.providers.claude.launch.CliPaths
import dev.ukitomato.closta.providers.claude.launch.NativeCliPaths

/**
 * The CLI's path for the IDE's folder [idePath], or null when the CLI cannot reach it. In a WSL project a folder of
 * another distribution, a UNC path of another host and a path that stayed as it was are null: handing the CLI a path it
 * cannot open would only be an error it prints. Outside WSL ([NativeCliPaths]) the path is the CLI's own.
 */
fun cliRootOf(
    paths: CliPaths,
    idePath: String,
): String? {
    if (paths === NativeCliPaths) return idePath
    return paths.toCli(idePath).takeIf { it.startsWith("/") && !it.startsWith("//") }
}

/**
 * The folders to give the CLI beside [cwd], from the IDE's content [roots], in the IDE's order and each once. A folder
 * is left out when it is [cwd] or inside it, when [toCli] has no path for it, and — in a worktree ([worktree]) — when
 * it is the project's own folder [projectBase] or inside it (the worktree is a copy of that). The comparison is made on
 * the CLI's paths.
 */
fun extraRoots(
    cwd: String,
    roots: List<String>,
    projectBase: String?,
    worktree: Boolean,
    toCli: (String) -> String?,
): List<String> {
    val here = toCli(cwd)?.let(::compared)
    val project = projectBase?.takeIf { worktree }?.let(toCli)?.let(::compared)
    return roots
        .mapNotNull { root -> toCli(root) }
        .distinctBy(::compared)
        .filterNot { root ->
            val path = compared(root)
            here != null && within(path, here) || project != null && within(path, project)
        }.map { it.trimEnd('/', '\\').ifEmpty { it.take(1) } }
}

private fun compared(path: String): String {
    val slashed = path.replace('\\', '/')
    return if (slashed.length > 1) slashed.trimEnd('/').ifEmpty { "/" } else slashed
}

private fun within(
    path: String,
    folder: String,
): Boolean = path == folder || path.startsWith(if (folder.endsWith("/")) folder else "$folder/")

/** What the notice that the IDE's folders changed since the session started does now. */
enum class NoticeChange { NONE, SHOW, HIDE }

/**
 * The folders the session was launched with ([launched]) against the ones the IDE has now ([now]). A difference is
 * shown
 * once for the session's life: when it is not shown ([shown]) and was never ([shownOnce]). A shown notice is taken back
 * when the folders are the same again. Anything else changes nothing, so no sync of the project makes it appear again.
 */
fun rootsNotice(
    launched: Set<String>,
    now: Set<String>,
    shown: Boolean,
    shownOnce: Boolean,
): NoticeChange =
    when {
        launched != now && !shown && !shownOnce -> NoticeChange.SHOW
        launched == now && shown -> NoticeChange.HIDE
        else -> NoticeChange.NONE
    }

/**
 * Gives a launch the IDE's content roots outside its folder as working directories, while [enabled] says so (read at
 * each launch; off, the roots are not read and nothing is added). [contentRoots] are the IDE's paths. [launched] is
 * told which
 * folders the session got, with the session's folder, so a later change of the roots can be compared with them.
 */
class ExtraRootsPlanner(
    private val inner: SessionLaunchPlanner,
    private val enabled: () -> Boolean,
    private val contentRoots: () -> List<String>,
    private val projectBase: String?,
    private val paths: CliPaths,
    private val launched: (sessionId: String, cwd: String?, roots: Set<String>) -> Unit,
) : SessionLaunchPlanner {
    override suspend fun plan(
        sessionId: String,
        workingDirectory: String?,
    ): SessionLaunch {
        val launch = inner.plan(sessionId, workingDirectory)
        if (!enabled()) return launch
        val roots = rootsFor(workingDirectory)
        launched(sessionId, workingDirectory, roots.toSet())
        return SessionLaunch(launch.spawner, launch.spec.copy(additionalDirectories = roots))
    }

    private fun rootsFor(workingDirectory: String?) =
        extraRootsFor(workingDirectory, projectBase, contentRoots(), paths)
}

/**
 * The folders for a session running in [workingDirectory] (null is the project's folder [projectBase]), from the IDE's
 * content [roots]: those the CLI can reach, outside its folder, and outside the project's in a worktree.
 */
fun extraRootsFor(
    workingDirectory: String?,
    projectBase: String?,
    roots: List<String>,
    paths: CliPaths,
): List<String> {
    val cwd = workingDirectory ?: projectBase ?: return emptyList()
    return extraRoots(cwd, roots, projectBase, workingDirectory != null && workingDirectory != projectBase) {
        cliRootOf(paths, it)
    }
}
