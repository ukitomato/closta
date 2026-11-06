package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.presenter.at
import dev.ukitomato.closta.presenter.str
import dev.ukitomato.closta.presenter.tree.JsonArray
import dev.ukitomato.closta.presenter.tree.JsonBool
import dev.ukitomato.closta.presenter.tree.JsonNumber
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonString
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Test

/**
 * What the composer is offered, as the tree shows it. Every tree a [Session]
 * builds is held to the webview's contract and to a projector without a memo, so a field that is wrong, extra or
 * never updated fails there too.
 */
class ComposerProjectionTest {
    private fun strings(array: JsonArray) = array.items.map { (it as JsonString).value }

    @Test
    fun `a thread has no commands, file search or selection until the host says`() {
        val thread = Session().thread
        assertNull(thread["commands"])
        assertNull(thread["fileSearch"])
        assertNull(thread["selection"])
        assertNull(thread["applied"])
    }

    @Test
    fun `the commands of the initialize response reach the thread with their sentence and hint, in the CLI's order`() {
        val session = Session()
        session.events(
            Lines.initialized(
                """{"commands":[{"name":"config","description":"Set a setting by key","argumentHint":"key=value"},""" +
                    """{"name":"help","description":"Help","argumentHint":""}]}""",
            ),
        )
        val commands = (session.thread["commands"] as JsonArray).items.map { it as JsonObject }
        assertEquals(listOf("config", "help"), commands.map { it.str("name") })
        assertEquals("Set a setting by key", commands[0].str("description"))
        assertEquals("key=value", commands[0].str("argumentHint"))
        assertNull(commands[1]["argumentHint"], "an empty hint is no hint")
    }

    @Test
    fun `the names of system init reach the thread with an empty sentence while no response has given more`() {
        val session = Session()
        session.events(Lines.init(slashCommands = """["context","config"]"""))
        val commands = (session.thread["commands"] as JsonArray).items.map { it as JsonObject }
        assertEquals(listOf("context" to "", "config" to ""), commands.map { it.str("name") to it.str("description") })
    }

    @Test
    fun `a file search answer reaches the thread under the webview's command id, and the next one replaces it`() {
        val session = Session()
        session.input(PresenterInput.FilesFound(FileSearchRecord("c7", "App", listOf("src/App.kt", "App.md"), true)))
        val first = session.thread.at("fileSearch")
        assertEquals("c7", first.str("commandId"))
        assertEquals("App", first.str("match"))
        assertEquals(listOf("src/App.kt", "App.md"), strings(first["paths"] as JsonArray))
        assertEquals(JsonBool.TRUE, first["truncated"])
        assertNull(first["failure"])
        session.input(PresenterInput.FilesFound(FileSearchRecord("c8", "Ap", failure = ComposerFailure.UNAVAILABLE)))
        val second = session.thread.at("fileSearch")
        assertEquals("c8", second.str("commandId"))
        assertEquals(JsonBool.FALSE, second["truncated"])
        assertEquals("unavailable", second.str("failure"))
        assertEquals(emptyList<String>(), strings(second["paths"] as JsonArray))
    }

    @Test
    fun `a selection answer is a place, none or a failure, and never carries text`() {
        val session = Session()
        session.input(
            PresenterInput.SelectionCaptured(SelectionRecord("c9", SelectionAnswer.Selected("src/App.kt", 3, 5))),
        )
        val place = session.thread.at("selection")
        assertEquals(setOf("commandId", "path", "startLine", "endLine"), place.keys)
        assertEquals("src/App.kt", place.str("path"))
        assertEquals(JsonNumber("3"), place["startLine"])
        assertEquals(JsonNumber("5"), place["endLine"])
        session.input(PresenterInput.SelectionCaptured(SelectionRecord("c10", SelectionAnswer.NoSelection)))
        assertEquals(setOf("commandId", "none"), session.thread.at("selection").keys)
        session.input(PresenterInput.SelectionCaptured(SelectionRecord("c11", SelectionAnswer.Failed("not-found"))))
        val failed = session.thread.at("selection")
        assertEquals(setOf("commandId", "failure"), failed.keys)
        assertEquals("not-found", failed.str("failure"))
    }

    @Test
    fun `an apply answer is the lines written or a failure, the last one only, and never carries text`() {
        val session = Session()
        session.input(
            PresenterInput.CodeApplied(ApplyRecord("c12", ApplyAnswer.Written("src/App.kt", 3, 5, undoable = true))),
        )
        val written = session.thread.at("applied")
        assertEquals(setOf("commandId", "path", "startLine", "endLine", "undoable"), written.keys)
        assertEquals("c12", written.str("commandId"))
        assertEquals("src/App.kt", written.str("path"))
        assertEquals(JsonNumber("3"), written["startLine"])
        assertEquals(JsonNumber("5"), written["endLine"])
        assertEquals(JsonBool.TRUE, written["undoable"])
        session.input(PresenterInput.CodeApplied(ApplyRecord("c13", ApplyAnswer.Failed(ComposerFailure.NO_SELECTION))))
        val failed = session.thread.at("applied")
        assertEquals(setOf("commandId", "failure"), failed.keys)
        assertEquals("no-selection", failed.str("failure"))
        assertNull(session.thread["selection"], "a selection answer is a thing of its own")
    }

    @Test
    fun `an answer that is the same again leaves the thread as the same object`() {
        val session = Session()
        val record = FileSearchRecord("c7", "App", listOf("src/App.kt"), false)
        session.input(PresenterInput.FilesFound(record))
        val before = session.thread
        session.input(PresenterInput.FilesFound(record.copy()))
        assertSame(before, session.thread)
        session.input(PresenterInput.FilesFound(record.copy(commandId = "c8")))
        assertEquals("c8", session.thread.at("fileSearch").str("commandId"))
    }

    @Test
    fun `an answer changes only its own field, and a message added later leaves it where it was`() {
        val session = Session()
        session.events(Lines.initialized("""{"commands":[{"name":"config","description":"d"}]}"""))
        session.input(PresenterInput.FilesFound(FileSearchRecord("c7", "App", listOf("a"), false)))
        val commands = session.thread["commands"]
        val search = session.thread["fileSearch"]
        session.send("send-1", "hello")
        assertSame(commands, session.thread["commands"])
        assertSame(search, session.thread["fileSearch"])
    }
}
