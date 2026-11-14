package dev.ukitomato.closta.platforms.intellij.session

import dev.ukitomato.closta.core.interfaces.SettingsStore

/** The sandbox choice a project keeps: written when a switch of it is applied, read by the next new session. */
class SandboxMemory(
    private val store: SettingsStore,
    projectKey: String,
) {
    private val key = "closta.sandbox.enabled.$projectKey"

    /** The saved choice; off when none was saved. */
    fun read(): Boolean = store.get(key) == "true"

    fun write(on: Boolean) = store.set(key, on.toString())
}

/** The sandbox value a session launches with: the one asked for (a fork, a rewind), else the project's saved one. */
fun launchSandbox(
    asked: Boolean?,
    memory: SandboxMemory,
): Boolean = asked ?: memory.read()
