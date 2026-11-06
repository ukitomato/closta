package dev.ukitomato.closta.providers.claude.launch

/**
 * A project that lives in a WSL distribution, as the Windows IDE sees it: the distribution's name and the
 * Linux path of the folder in it. Pure data and string rules — free of `com.intellij`, so the rules are tested without
 * an IDE.
 */
data class WslLocation(
    val distro: String,
    /** Starts with `/`; the root of the distribution is `/`. */
    val linuxPath: String,
) {
    /** The UNC path (`\\wsl.localhost\<distro>\…`) the Windows IDE reads [linux] by. */
    fun toUnc(linux: String): String = "\\\\wsl.localhost\\$distro" + linux.replace('/', '\\')

    /**
     * The Linux path a launch in [workingDir] runs in: this location's own path for none, the Linux part of a UNC path
     * in the same distribution (the name is compared without regard to case), and a [WslUnavailableException] for
     * anything else (a folder this distribution does not hold).
     */
    fun linuxDirectoryOf(workingDir: String?): String {
        if (workingDir == null) return linuxPath
        val there = parse(workingDir, ideOnWindows = true)
        if (there == null || !there.distro.equals(distro, ignoreCase = true)) {
            throw WslUnavailableException(
                "the working folder $workingDir is not in the WSL distribution $distro",
                distro,
            )
        }
        return there.linuxPath
    }

    /**
     * The place of the CLI's records, as a UNC path, from the output of [PROBE_ARGV] run the way the CLI is run. The
     * login shell's profile may print lines of its own before or after, so only the lines that begin with
     * [HOME_MARK] and [CONFIG_MARK] are read. A configured directory that starts with `/` wins; otherwise
     * `$HOME/.claude`. Null when there is no [HOME_MARK] line or neither value can be made.
     */
    fun recordHome(probeOutput: String): String? {
        val lines = probeOutput.split('\n').map { it.trimEnd('\r') }
        val home = valueAfter(lines, HOME_MARK)
        val config = valueAfter(lines, CONFIG_MARK).orEmpty()
        return when {
            home == null -> null
            config.startsWith("/") -> toUnc(config)
            home.startsWith("/") -> toUnc(home.trimEnd('/') + "/.claude")
            else -> null
        }
    }

    private fun valueAfter(
        lines: List<String>,
        mark: String,
    ): String? = lines.firstOrNull { it.startsWith(mark) }?.removePrefix(mark)?.trim()

    companion object {
        private val HOSTS = setOf("wsl.localhost", "wsl$")

        const val HOME_MARK = "CLAUDE_AGENT_HOME="
        const val CONFIG_MARK = "CLAUDE_AGENT_CONFIG="

        /** Asks the login shell for the two values [recordHome] reads, each on a line that begins with its mark. */
        val PROBE_ARGV: List<String> =
            listOf("sh", "-c", "printf \"$HOME_MARK%s\\n$CONFIG_MARK%s\\n\" \"\$HOME\" \"\$CLAUDE_CONFIG_DIR\"")

        /**
         * The WSL location of [path], or null when it is not one: the IDE is not on Windows, or the path is not a UNC
         * path on a WSL host (`wsl.localhost` or `wsl$`, in any case; `\` and `/` both separate), or it names no
         * distribution.
         */
        fun parse(
            path: String?,
            ideOnWindows: Boolean,
        ): WslLocation? {
            val slashed = path?.replace('\\', '/')?.takeIf { ideOnWindows && it.startsWith("//") }
            val parts = slashed?.removePrefix("//")?.split('/')
            val distro = parts?.getOrNull(1)?.takeIf { it.isNotEmpty() }
            return if (parts == null || distro == null || parts[0].lowercase() !in HOSTS) {
                null
            } else {
                WslLocation(distro, "/" + parts.drop(2).filter { it.isNotEmpty() }.joinToString("/"))
            }
        }
    }
}
