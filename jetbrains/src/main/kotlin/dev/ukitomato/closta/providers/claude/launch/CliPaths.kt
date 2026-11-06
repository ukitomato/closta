package dev.ukitomato.closta.providers.claude.launch

import java.net.URI
import java.net.URISyntaxException
import java.nio.file.Paths

/**
 * The mouth between the paths the CLI knows and the paths the IDE knows. For a project in WSL the CLI
 * runs in Linux while the Windows IDE reads the same files by UNC paths; anywhere else the two are the same and this
 * changes nothing. Pure string rules — free of `com.intellij`, so they are tested without an IDE.
 */
interface CliPaths {
    /** The IDE's path for a path the CLI gave. */
    fun toIde(cliPath: String): String

    /** The CLI's path for a path the IDE gave. */
    fun toCli(idePath: String): String

    /** What a `getDiagnostics` argument (a `file:` URI or an absolute path) is, before the IDE's own checks read it. */
    fun toIdeArgument(text: String): String

    /** The `file:` URI the CLI is told for [idePath]. */
    fun toCliUri(idePath: String): String
}

/** The paths where the CLI and the IDE share one file system: every path is its own. */
object NativeCliPaths : CliPaths {
    override fun toIde(cliPath: String): String = cliPath

    override fun toCli(idePath: String): String = idePath

    override fun toIdeArgument(text: String): String = text

    override fun toCliUri(idePath: String): String = Paths.get(idePath).toUri().toString()
}

/**
 * The mouth for a project of [location]'s distribution. [ideRoot] is the project's own UNC head
 * (`//wsl.localhost/Ubuntu` or `\\wsl$\Ubuntu`, host and separators as the project has them), so the paths made
 * agree with the IDE's.
 * Made only by [cliPathsFor], so the distribution is held once.
 */
private class WslCliPaths(
    private val location: WslLocation,
    private val ideRoot: String,
) : CliPaths {
    private val separator = ideRoot.first()

    override fun toIde(cliPath: String): String {
        val drive = MNT.matchEntire(cliPath)
        return when {
            drive != null -> {
                val rest = drive.groupValues[2].replace('/', '\\')
                drive.groupValues[1].uppercase() + ":" + rest.ifEmpty { "\\" }
            }
            cliPath.startsWith("/") -> ideRoot + cliPath.replace('/', separator)
            else -> cliPath
        }
    }

    override fun toCli(idePath: String): String {
        val there = WslLocation.parse(idePath, ideOnWindows = true)
        val letter = DRIVE.matchEntire(idePath)
        return when {
            there != null && there.distro.equals(location.distro, ignoreCase = true) -> there.linuxPath
            letter != null -> "/mnt/" + letter.groupValues[1].lowercase() + letter.groupValues[2].replace('\\', '/')
            else -> idePath
        }
    }

    override fun toIdeArgument(text: String): String =
        when {
            text.startsWith("/") -> toIde(text)
            else -> plainFileUriPath(text)?.let(::fileUriPathToIde) ?: text
        }

    // `file:///C:/x` is a Windows drive, which the IDE reads as it is; any other path is a Linux one.
    private fun fileUriPathToIde(path: String): String =
        if (DRIVE_URI_PATH.matches(path)) path.removePrefix("/") else toIde(path)

    // The decoded path of a `file:///…` URI with no authority, query or fragment; null for anything else.
    private fun plainFileUriPath(text: String): String? {
        val uri = if (text.startsWith("file:///")) parsed(text) else null
        val plain = uri != null && !uri.isOpaque && uri.rawAuthority == null && uri.rawQuery == null
        return if (plain && uri?.rawFragment == null) uri?.path else null
    }

    private fun parsed(text: String): URI? =
        try {
            URI(text)
        } catch (
            @Suppress("SwallowedException") bad: URISyntaxException,
        ) {
            null
        }

    override fun toCliUri(idePath: String): String {
        val linux = toCli(idePath)
        return if (linux.startsWith("/")) {
            URI("file", "", linux, null).toString()
        } else {
            NativeCliPaths.toCliUri(idePath)
        }
    }

    private companion object {
        val MNT = Regex("^/mnt/([A-Za-z])((?:/.*)?)$")
        val DRIVE = Regex("^([A-Za-z]):([\\\\/].*)$")
        val DRIVE_URI_PATH = Regex("^/[A-Za-z]:([\\\\/].*)?$")
    }
}

/**
 * The mouth for the project folder [directory] (the IDE's `basePath`): a WSL one when [directory] is a UNC path on a
 * WSL host and the IDE is on Windows, [NativeCliPaths] otherwise. The head is taken from the folder as written, so a
 * `\\wsl$\Ubuntu\…` project makes `\\wsl$\Ubuntu\…` paths.
 */
fun cliPathsFor(
    directory: String?,
    ideOnWindows: Boolean,
): CliPaths {
    val location = WslLocation.parse(directory, ideOnWindows) ?: return NativeCliPaths
    val parts = directory!!.replace('\\', '/').removePrefix("//").split('/')
    val separator = directory.first()
    val head = "$separator$separator${parts[0]}$separator${parts[1]}"
    return WslCliPaths(location, head)
}
