package dev.ukitomato.closta.platforms.intellij.session

/**
 * Where a session records its launch: the argv of the version check and the version, the argv of the process, and how
 * it ended. Callers never hand it the launch environment: the launch log holds only the arguments.
 */
interface SessionLog {
    fun info(message: String)

    fun warn(message: String)
}
