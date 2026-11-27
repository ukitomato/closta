package dev.ukitomato.closta.core.interfaces

/** What [UnsavedDocuments.saveIfModified] did with one file. */
enum class SaveResult { SAVED, NOT_MODIFIED, NOT_OPEN, FAILED }

/**
 * The IDE's editor buffers that are not yet on disk, seen from core. The counterpart of a VS Code host is its open
 * text documents.
 */
interface UnsavedDocuments {
    /** Saves the file at [path] (an absolute path as the IDE writes it) when its open document has unsaved changes. */
    suspend fun saveIfModified(path: String): SaveResult
}
