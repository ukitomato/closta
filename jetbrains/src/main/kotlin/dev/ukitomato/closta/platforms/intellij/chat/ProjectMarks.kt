package dev.ukitomato.closta.platforms.intellij.chat

import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import dev.ukitomato.closta.platforms.intellij.store.AppSettingsStore

// The marks of the sessions that ran when a project last closed, in the application's settings under the project's own
// key (wasRunningKey).

/** This project's sessions that ran when it last closed (or stopped in a worktree) and have not been resumed since. */
fun Project.wasRunningMarks(): Map<String, WasRunningMark> =
    WasRunningMarks.decode(service<AppSettingsStore>().get(marksKey()))

fun Project.saveWasRunningMarks(marks: Map<String, WasRunningMark>) {
    if (marks != wasRunningMarks()) service<AppSettingsStore>().set(marksKey(), WasRunningMarks.encode(marks))
}

fun Project.clearWasRunningMark(sessionId: String) = saveWasRunningMarks(wasRunningMarks() - sessionId)

/** Leaves a mark of [sessionId], stopped from the screen, so the list offers to resume it ([marksOnStop]). */
fun Project.markStopped(
    sessionId: String,
    mark: WasRunningMark,
) = saveWasRunningMarks(wasRunningMarks() + (sessionId to mark))

/** This project's cleared tabs, by the tab's session id. */
fun Project.clearedTabs(): Map<String, ClearedTab> = ClearedTabs.decode(service<AppSettingsStore>().get(clearedKey()))

fun Project.saveClearedTabs(tabs: Map<String, ClearedTab>) {
    if (tabs.toList() != clearedTabs().toList()) service<AppSettingsStore>().set(clearedKey(), ClearedTabs.encode(tabs))
}

private fun Project.clearedKey() = clearedTabsKey(locationHash)

private fun Project.marksKey() = wasRunningKey(locationHash)
