package dev.ukitomato.closta.platforms.intellij.settings

import dev.ukitomato.closta.core.interfaces.SettingsStore
import dev.ukitomato.closta.platforms.intellij.session.PERMISSION_MODES
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.File
import java.io.IOException

class BehaviourRecordsTest {
    private val defaults = BehaviourSettings(true, true, null)

    @Test
    fun `nothing stored reads as the defaults`() {
        assertEquals(defaults, BehaviourRecords.load(FakeSettingsStore()))
        assertEquals(BehaviourSettings(), defaults)
    }

    @Test
    fun `three values written read back the same`() {
        for (mode in listOf(null) + InitialPermissionMode.entries) {
            val chosen = BehaviourSettings(false, false, mode)
            val store = FakeSettingsStore()
            BehaviourRecords.save(store, chosen)
            assertEquals(chosen, BehaviourRecords.load(store), "mode $mode")
        }
    }

    @Test
    fun `saving writes all three keys, also when a value is the default`() {
        val store = FakeSettingsStore()
        BehaviourRecords.save(store, defaults)
        assertEquals(
            mapOf(
                "behaviour.saveBeforeSend" to "true",
                "behaviour.respectGitIgnore" to "true",
                "behaviour.initialPermissionMode" to "",
            ),
            store.entries,
        )
    }

    @Test
    fun `a flag that is not true or false, and a mode that is not one of the five, read as the default`() {
        val store = FakeSettingsStore()
        store.entries["behaviour.saveBeforeSend"] = "yes"
        store.entries["behaviour.respectGitIgnore"] = "TRUE"
        store.entries["behaviour.initialPermissionMode"] = "turbo"
        assertEquals(defaults, BehaviourRecords.load(store))
        store.entries["behaviour.saveBeforeSend"] = "false"
        store.entries["behaviour.respectGitIgnore"] = "false"
        store.entries["behaviour.initialPermissionMode"] = ""
        assertEquals(BehaviourSettings(saveBeforeSend = false, respectGitIgnore = false), BehaviourRecords.load(store))
    }

    @Test
    fun `bypassPermissions cannot be written and is not read from the store`() {
        assertNull(InitialPermissionMode.of("bypassPermissions"))
        assertTrue(InitialPermissionMode.entries.none { it.wire == "bypassPermissions" })
        val store = FakeSettingsStore()
        store.entries["behaviour.initialPermissionMode"] = "bypassPermissions"
        assertNull(BehaviourRecords.load(store).initialPermissionMode)
    }

    @Test
    fun `the modes are the host's own modes without bypassPermissions`() {
        val wires = InitialPermissionMode.entries.map { it.wire }.toSet()
        assertTrue(PERMISSION_MODES.containsAll(wires))
        assertEquals(PERMISSION_MODES - "bypassPermissions", wires)
    }

    @Test
    fun `a store that throws gives the defaults and the log says only the exception type`() {
        val logged = mutableListOf<String>()
        val throwing =
            object : SettingsStore {
                override fun get(key: String): String? = throw IOException("SECRET-CANARY /home/someone")

                override fun set(
                    key: String,
                    value: String,
                ) = Unit

                override fun clear(key: String) = Unit
            }
        assertEquals(defaults, BehaviourRecords.load(throwing, logged::add))
        assertEquals(1, logged.size)
        assertTrue("java.io.IOException" in logged.single())
        assertTrue("SECRET-CANARY" !in logged.single())
    }

    @Test
    fun `the providers' two keys are not touched`() {
        val store = FakeSettingsStore()
        store.entries["providers.v1"] = "[]"
        store.entries["providers.active"] = "x"
        BehaviourRecords.save(store, BehaviourSettings(saveBeforeSend = false))
        assertEquals("[]", store.entries["providers.v1"])
        assertEquals("x", store.entries["providers.active"])
        assertEquals(5, store.entries.size)
    }

    @Test
    fun `what is stored is flags and mode words only`() {
        val store = FakeSettingsStore()
        BehaviourRecords.save(store, BehaviourSettings(initialPermissionMode = InitialPermissionMode.PLAN))
        val allowed = setOf("true", "false", "") + InitialPermissionMode.entries.map { it.wire }
        assertTrue(store.entries.values.all { it in allowed })
    }

    @Test
    fun `the pure files do not read com intellij`() {
        for (name in listOf("BehaviourSettings.kt", "BehaviourRecords.kt", "BehaviourEditor.kt")) {
            val text = File(settingsRoot(), name).readText()
            assertTrue(Regex("""^\s*import\s+com\.intellij""", RegexOption.MULTILINE).find(text) == null) { name }
            assertTrue("com.intellij" !in text.replace(Regex("""(?s)/\*.*?\*/"""), "")) { name }
        }
    }

    private fun settingsRoot(): File {
        val relative = "src/main/kotlin/dev/ukitomato/closta/platforms/intellij/settings"
        return generateSequence(File("").absoluteFile) { it.parentFile }
            .flatMap { sequenceOf(File(it, relative), File(it, "jetbrains/$relative")) }
            .first { File(it, "BehaviourRecords.kt").isFile }
    }
}
