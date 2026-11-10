package dev.ukitomato.closta.platforms.intellij.session

import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.platforms.intellij.ide.htmlEscaped
import dev.ukitomato.closta.providers.claude.launch.ProcessExitException
import dev.ukitomato.closta.providers.claude.launch.ProcessSpawner
import dev.ukitomato.closta.providers.claude.launch.WorkingDirectoryMissingException
import dev.ukitomato.closta.providers.claude.launch.WslSpawner
import dev.ukitomato.closta.providers.claude.launch.WslUnavailableException
import java.io.IOException

/**
 * Where one session is in its life. It moves forward: Starting, then Running, then one of the three ends. A restart
 * that turns the sandbox on goes from Running back to Starting once, and then to Running again.
 */
sealed interface SessionStatus {
    /** Planning the launch, checking `claude --version`, or starting the process. */
    data object Starting : SessionStatus

    /** The process is up. [commands] are the use cases bound to this session. */
    class Running(
        val version: String,
        val commands: SessionCommands,
    ) : SessionStatus {
        override fun toString(): String = "Running(version=$version)"
    }

    /** The process closed its output and exited with 0 on its own. */
    data object Ended : SessionStatus

    /** The session could not start, or its process ended abnormally. */
    data class Failed(
        val failure: SessionFailure,
    ) : SessionStatus

    /** The host closed the session (its tab was closed, it was restarted, or the project closed). */
    data object Closed : SessionStatus
}

/**
 * Why a session failed, sorted by what the user has to do about it. Every text is written here and carries no value
 * from the launch environment; the only texts taken from elsewhere are a spawn [IOException]'s message, which the JDK
 * builds from the program name and the working directory, the working folder's path the launch was given (it is also in
 * that message, and holds no secret), and the password storage's own reason (`SecretStoreUnavailableException`,
 * which promises to hold no secret).
 */
sealed interface SessionFailure {
    /** What went wrong. */
    val cause: String

    /** What to do next. */
    val remedy: String

    /** The process could not be created at all (for a native launch: `claude` is not on PATH). */
    data class LaunchFailed(
        val detail: String,
    ) : SessionFailure {
        override val cause get() = ClostaBundle.message("session.failure.launchFailed.cause", detail)
        override val remedy get() = ClostaBundle.message("session.failure.launchFailed.remedy", pathKept())
    }

    /** The process could not be created because the working folder is not there (a worktree that was removed). */
    data class WorkingDirectoryMissing(
        val path: String,
    ) : SessionFailure {
        override val cause get() = ClostaBundle.message("session.failure.workingDirectoryMissing.cause", path)
        override val remedy get() = ClostaBundle.message("session.failure.workingDirectoryMissing.remedy")
    }

    /** The process could not be started in WSL: the distribution was not found or does not hold the folder. */
    data class WslUnavailable(
        val distro: String,
        val detail: String,
    ) : SessionFailure {
        override val cause get() = ClostaBundle.message("session.failure.wslUnavailable.cause", detail)
        override val remedy get() = ClostaBundle.message("session.failure.wslUnavailable.remedy", distro)
    }

    /** A launch in WSL exited with 127: the login shell of the distribution did not find a command. */
    data class WslCommandNotFound(
        val distro: String,
    ) : SessionFailure {
        override val cause get() = ClostaBundle.message("session.failure.wslCommandNotFound.cause", distro)
        override val remedy get() = ClostaBundle.message("session.failure.wslCommandNotFound.remedy", distro)
    }

    /** The process started and exited with 127: a shell or launcher in front of it could not find a command. */
    data object CommandNotFound : SessionFailure {
        override val cause get() = ClostaBundle.message("session.failure.commandNotFound.cause")
        override val remedy get() = ClostaBundle.message("session.failure.commandNotFound.remedy", pathKept())
    }

    /** The process ended with another nonzero code, or its output broke while it ran. */
    data class EndedAbnormally(
        val detail: String,
    ) : SessionFailure {
        override val cause get() = ClostaBundle.message("session.failure.endedAbnormally.cause", detail)

        // The process's error output is not kept anywhere (its reader drains it), so the way to see why is a terminal.
        override val remedy get() = ClostaBundle.message("session.failure.endedAbnormally.remedy")
    }

    /** `claude --version` exited nonzero, printed nothing, or did not answer in time. */
    data class VersionCheckFailed(
        val detail: String,
    ) : SessionFailure {
        override val cause get() = ClostaBundle.message("session.failure.versionCheckFailed.cause", detail)
        override val remedy get() = ClostaBundle.message("session.failure.versionCheckFailed.remedy")
    }

    /** The launch could not be planned — for a provider, its settings or credentials could not be read. */
    data class PlanFailed(
        val errorType: String,
    ) : SessionFailure {
        override val cause get() = ClostaBundle.message("session.failure.planFailed.cause", errorType)
        override val remedy get() = ClostaBundle.message("session.failure.planFailed.remedy")
    }

    /** The IDE does not trust the project, so nothing was started in it. */
    data object ProjectNotTrusted : SessionFailure {
        override val cause get() = ClostaBundle.message("session.failure.projectNotTrusted.cause")
        override val remedy get() = ClostaBundle.message("session.failure.projectNotTrusted.remedy")
    }

    /** The Amazon Bedrock sign-in was cancelled: the MFA prompt was closed. */
    data object BedrockSignInCancelled : SessionFailure {
        override val cause get() = ClostaBundle.message("session.failure.bedrockSignInCancelled.cause")
        override val remedy get() = ClostaBundle.message("session.failure.bedrockSignInCancelled.remedy")
    }

    /** The Amazon Bedrock provider for new sessions has no long-term access key stored. */
    data object BedrockKeysMissing : SessionFailure {
        override val cause get() = ClostaBundle.message("session.failure.bedrockKeysMissing.cause")
        override val remedy get() = ClostaBundle.message("session.failure.bedrockKeysMissing.remedy")
    }

    /** The IDE's password storage did not answer while signing in to Amazon Bedrock. */
    data class BedrockSecretsUnavailable(
        val reason: String?,
    ) : SessionFailure {
        override val cause get() =
            reason?.let { ClostaBundle.message("session.failure.bedrockSecretsUnavailable.cause.reason", it) }
                ?: ClostaBundle.message("session.failure.bedrockSecretsUnavailable.cause")
        override val remedy get() = ClostaBundle.message("session.failure.bedrockSecretsUnavailable.remedy")
    }

    /** The Amazon Bedrock provider's settings changed twice while signing in, so nothing was launched. */
    data object BedrockSettingsChanged : SessionFailure {
        override val cause get() = ClostaBundle.message("session.failure.bedrockSettingsChanged.cause")
        override val remedy get() = ClostaBundle.message("session.failure.bedrockSettingsChanged.remedy")
    }

    /** A fork was opened by the CLI under another id than the one the plugin gave it. */
    data object ForkIdMismatch : SessionFailure {
        override val cause get() = ClostaBundle.message("session.failure.forkIdMismatch.cause")
        override val remedy get() = ClostaBundle.message("session.failure.forkIdMismatch.remedy")
    }

    /** The conversation could not be rewound to the line asked for: the saved record has no point to cut at. */
    data object RewindPointMissing : SessionFailure {
        override val cause get() = ClostaBundle.message("session.failure.rewindPointMissing.cause")
        override val remedy get() = ClostaBundle.message("session.failure.rewindPointMissing.remedy")
    }

    companion object {
        private const val COMMAND_NOT_FOUND = 127

        // NativeProcessSpawner adds to the environment the IDE was started with, so a changed PATH needs a new IDE.
        private fun pathKept(): String = ClostaBundle.message("session.failure.pathKept")

        private fun exitCode(code: Int): String = ClostaBundle.message("session.failure.exitCode", code.toString())

        /** A spawn that threw: an [IOException] keeps the JDK's message, anything else only its type. */
        fun launchFailed(failure: Exception): SessionFailure {
            val typeName = failure.javaClass.name
            return when (failure) {
                is WorkingDirectoryMissingException -> WorkingDirectoryMissing(failure.path)
                is WslUnavailableException -> WslUnavailable(failure.distro, failure.message ?: typeName)
                is IOException -> LaunchFailed(failure.message ?: typeName)
                else -> LaunchFailed(typeName)
            }
        }

        /** How a running session's event stream ended abnormally. */
        fun ended(failure: Exception): SessionFailure =
            when {
                failure is ProcessExitException && failure.exitCode == COMMAND_NOT_FOUND -> CommandNotFound
                failure is ProcessExitException -> EndedAbnormally(exitCode(failure.exitCode))
                else -> EndedAbnormally(failure.javaClass.name)
            }

        /**
         * [failure] as it reads for a launch through [spawner]: in WSL a 127 is the distribution's login shell not
         * finding a command, which the IDE's PATH has nothing to do with; anything else stays as it is.
         */
        fun forSpawner(
            failure: SessionFailure,
            spawner: ProcessSpawner?,
        ): SessionFailure =
            if (failure == CommandNotFound && spawner is WslSpawner) WslCommandNotFound(spawner.distro) else failure

        /** The version check's own exit code: 127 means the same as for the session, anything else fails the check. */
        fun versionExit(exitCode: Int): SessionFailure =
            if (exitCode == COMMAND_NOT_FOUND) CommandNotFound else VersionCheckFailed(exitCode(exitCode))
    }
}

/** What to show the user about a session, or nothing while it is starting, running, or closed. */
class SessionNotice(
    val cause: String,
    val remedy: String,
) {
    /**
     * The notice as the tool window's label shows it, escaped so that no text can inject markup, in a block [width]
     * pixels wide: the label wraps it there instead of laying it out on one line wider than the tool window.
     */
    fun toHtml(width: Int): String =
        "<html><body><div width=\"$width\"><b>${escape(cause)}</b><br>${escape(remedy)}</div></body></html>"

    companion object {
        fun of(status: SessionStatus): SessionNotice? =
            when (status) {
                is SessionStatus.Failed -> SessionNotice(status.failure.cause, status.failure.remedy)
                SessionStatus.Ended ->
                    SessionNotice(
                        ClostaBundle.message("session.ended.cause"),
                        ClostaBundle.message("session.ended.remedy"),
                    )
                SessionStatus.Starting, is SessionStatus.Running, SessionStatus.Closed -> null
            }

        private fun escape(text: String): String = htmlEscaped(text)
    }
}

/** A start-up step failed in a way the session reports as [failure]. Its message is [SessionFailure.cause]. */
internal class SessionStartException(
    val failure: SessionFailure,
) : Exception(failure.cause)
