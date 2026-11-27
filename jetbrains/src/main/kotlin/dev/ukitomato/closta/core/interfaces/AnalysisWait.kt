package dev.ukitomato.closta.core.interfaces

/**
 * Lets core wait for the IDE to analyse a file again after something else wrote it. The counterpart of a VS Code host
 * is its diagnostics change event.
 */
interface AnalysisWait {
    /** True when a visible editor shows the file at [path], so the IDE keeps analysing it. */
    fun canAnalyse(path: String): Boolean

    /**
     * Makes the IDE read the file at [path] again; true once its analysis has finished, false when [limitMillis] ran
     * out or the file cannot be analysed.
     */
    suspend fun refreshAndAwait(
        path: String,
        limitMillis: Long,
    ): Boolean
}
