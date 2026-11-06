package dev.ukitomato.closta.platforms.intellij.settings

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class BehaviourEditorTest {
    @Test
    fun `nothing changed is not modified`() {
        val editor = BehaviourEditor(BehaviourSettings())
        assertFalse(editor.isModified())
        assertEquals(BehaviourSettings(), editor.current())
    }

    @Test
    fun `each of the three edits makes it modified, and changing back makes it unmodified again`() {
        val editor = BehaviourEditor(BehaviourSettings())
        editor.saveBeforeSend = false
        assertTrue(editor.isModified())
        editor.saveBeforeSend = true
        assertFalse(editor.isModified())
        editor.respectGitIgnore = false
        assertTrue(editor.isModified())
        editor.respectGitIgnore = true
        editor.initialPermissionMode = InitialPermissionMode.PLAN
        assertTrue(editor.isModified())
        editor.initialPermissionMode = null
        assertFalse(editor.isModified())
    }

    @Test
    fun `apply saves the plan mode, and what was applied is no longer modified`() {
        val store = FakeSettingsStore()
        val editor = BehaviourEditor(BehaviourRecords.load(store))
        editor.initialPermissionMode = InitialPermissionMode.PLAN
        editor.saveBeforeSend = false
        BehaviourRecords.save(store, editor.current())
        editor.applied()
        assertFalse(editor.isModified())
        val reread = BehaviourRecords.load(store)
        assertEquals(InitialPermissionMode.PLAN, reread.initialPermissionMode)
        assertFalse(reread.saveBeforeSend)
        assertTrue(reread.respectGitIgnore)
    }

    @Test
    fun `reset puts the saved values back`() {
        val saved = BehaviourSettings(saveBeforeSend = false, initialPermissionMode = InitialPermissionMode.AUTO)
        val editor = BehaviourEditor(BehaviourSettings())
        editor.respectGitIgnore = false
        editor.reset(saved)
        assertEquals(saved, editor.current())
        assertFalse(editor.isModified())
        editor.reset(BehaviourSettings())
        assertNull(editor.initialPermissionMode)
        assertTrue(editor.saveBeforeSend)
    }
}
