package dev.ukitomato.closta.platforms.intellij.session

import com.intellij.openapi.application.EDT
import com.intellij.openapi.fileEditor.FileDocumentManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Saves the IDE's unsaved documents. `FileDocumentManager.saveAllDocuments` must run on the UI thread and takes
 * the write action it needs itself; the legacy `Dispatchers.EDT` enters the UI thread with the write-intent lock, as
 * `IdeEditorEdits` already relies on for its own write, so nothing is wrapped around the call. The decision to save,
 * and the time limit, are [SaveBeforeSend]'s; this only calls the platform, and is measured in a running IDE.
 */
internal object DocumentSaving {
    suspend fun saveAll() = withContext(Dispatchers.EDT) { FileDocumentManager.getInstance().saveAllDocuments() }
}
