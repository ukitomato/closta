package dev.ukitomato.closta.platforms.intellij.session

import dev.ukitomato.closta.platforms.intellij.settings.FakeSettingsStore
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Test

/** The sandbox choice a project keeps, and which value a new session launches with. */
class SandboxMemoryTest {
    private val store = FakeSettingsStore()

    @Test
    fun missingIsOff() {
        assertFalse(SandboxMemory(store, "p").read())
    }

    @Test
    fun newSessionReadsMemory() {
        val memory = SandboxMemory(store, "p")
        memory.write(true)
        assertEquals(true, launchSandbox(null, memory))
        memory.write(false)
        assertEquals(false, launchSandbox(null, memory))
    }

    @Test
    fun askedValueWins() {
        val memory = SandboxMemory(store, "p")
        memory.write(false)
        assertEquals(true, launchSandbox(true, memory))
        memory.write(true)
        assertEquals(false, launchSandbox(false, memory))
    }

    @Test
    fun keyIsPerProject() {
        SandboxMemory(store, "a").write(true)
        assertFalse(SandboxMemory(store, "b").read())
        assertEquals("true", store.get("closta.sandbox.enabled.a"))
    }
}
