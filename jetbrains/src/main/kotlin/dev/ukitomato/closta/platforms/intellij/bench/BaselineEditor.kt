package dev.ukitomato.closta.platforms.intellij.bench

import com.intellij.openapi.application.EDT
import com.intellij.openapi.components.service
import com.intellij.openapi.fileEditor.FileEditor
import com.intellij.openapi.fileEditor.FileEditorPolicy
import com.intellij.openapi.fileEditor.FileEditorProvider
import com.intellij.openapi.fileEditor.FileEditorState
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.util.UserDataHolderBase
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.testFramework.LightVirtualFile
import dev.ukitomato.closta.platforms.intellij.bench.baseline.EditorSurface
import dev.ukitomato.closta.platforms.intellij.chat.ChatPanel
import dev.ukitomato.closta.platforms.intellij.chat.ChatSource
import dev.ukitomato.closta.platforms.intellij.session.ClaudeSessionService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.beans.PropertyChangeListener
import javax.swing.JComponent

/** The benchmark's baseline: the whole conversation in one IDE editor, to weigh the chat against the editor itself. */
class BaselineVirtualFile(
    val source: ChatSource.Fixed,
) : LightVirtualFile("IDE editor (baseline)") {
    init {
        isWritable = false
    }
}

class BaselineEditorProvider :
    FileEditorProvider,
    DumbAware {
    override fun accept(
        project: Project,
        file: VirtualFile,
    ): Boolean = file is BaselineVirtualFile

    override fun acceptRequiresReadAction(): Boolean = false

    override fun createEditor(
        project: Project,
        file: VirtualFile,
    ): FileEditor = BaselineEditor(project, file as BaselineVirtualFile)

    override fun getEditorTypeId(): String = "closta-baseline"

    override fun getPolicy(): FileEditorPolicy = FileEditorPolicy.HIDE_DEFAULT_EDITOR
}

/** Draws the source's transcript into an [EditorSurface] at most once a frame, as [ChatPanel] does. */
class BaselineEditor(
    project: Project,
    private val baseline: BaselineVirtualFile,
) : UserDataHolderBase(),
    FileEditor {
    val surface = EditorSurface(project)

    init {
        Disposer.register(this, surface)
        project.service<ClaudeSessionService>().viewScope(this).launch(Dispatchers.EDT) {
            baseline.source.view.collect { view ->
                val start = System.nanoTime()
                surface.render(view.transcript)
                ChatPanel.onRender?.invoke(System.nanoTime() - start)
                delay(ChatPanel.FRAME_MS)
            }
        }
    }

    override fun getComponent(): JComponent = surface.component

    override fun getPreferredFocusedComponent(): JComponent? = null

    override fun getName(): String = "Closta baseline"

    override fun getFile(): VirtualFile = baseline

    override fun setState(state: FileEditorState) = Unit

    override fun isModified(): Boolean = false

    override fun isValid(): Boolean = true

    override fun addPropertyChangeListener(listener: PropertyChangeListener) = Unit

    override fun removePropertyChangeListener(listener: PropertyChangeListener) = Unit

    override fun dispose() = Unit
}
