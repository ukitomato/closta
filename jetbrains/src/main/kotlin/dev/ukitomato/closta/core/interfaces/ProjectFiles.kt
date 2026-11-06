package dev.ukitomato.closta.core.interfaces

/**
 * The files of the open project, asked by query. Paths are strings relative to the project root.
 *
 * Second implementation: VS Code's `workspace.findFiles(include, exclude, maxResults)`.
 */
interface ProjectFiles {
    /**
     * Files whose name (the last part of the path) contains [FileQuery.match], ignoring case, at most
     * [FileQuery.limit] of them. Excluded folders and (unless [FileQuery.includeIgnored]) files the version control
     * ignores are never returned.
     */
    suspend fun list(query: FileQuery): IdeResult<FileList>
}

/** A file-name query. [limit] is clamped into 1..[MAX_LIMIT] by the host; [match] empty matches every file. */
data class FileQuery(
    val match: String = "",
    val limit: Int = DEFAULT_LIMIT,
    val includeIgnored: Boolean = false,
) {
    companion object {
        const val DEFAULT_LIMIT = 50
        const val MAX_LIMIT = 200
    }
}

/** [paths] relative to the project root; [truncated] is true when more files matched than [paths] holds. */
data class FileList(
    val paths: List<String>,
    val truncated: Boolean,
)
