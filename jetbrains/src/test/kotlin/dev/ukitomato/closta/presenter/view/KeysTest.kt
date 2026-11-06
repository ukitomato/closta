package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.ApprovalDecision
import dev.ukitomato.closta.core.models.ConversationState
import dev.ukitomato.closta.presenter.at
import dev.ukitomato.closta.presenter.keysOf
import dev.ukitomato.closta.presenter.message
import dev.ukitomato.closta.presenter.messages
import dev.ukitomato.closta.presenter.part
import dev.ukitomato.closta.presenter.status
import dev.ukitomato.closta.presenter.str
import dev.ukitomato.closta.presenter.tree.JsonString
import dev.ukitomato.closta.presenter.tree.TreeRules
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

/** Keys come from two places — the host and the CLI — and every one must be a key the webview accepts. */
class KeysTest {
    private val tricky =
        listOf("toolu_1", "", "0", "42", "__proto__", "constructor", "prototype", "id:", "id:42", "id:id:42", "a")

    @Test
    fun `an id that is a key stays as it is, any other gets one prefix, so no two ids share a key`() {
        assertEquals("toolu_1", Keys.ofCliId("toolu_1"))
        assertEquals("id:42", Keys.ofCliId("42"))
        assertEquals("id:", Keys.ofCliId(""))
        assertEquals("id:__proto__", Keys.ofCliId("__proto__"))
        assertEquals("id:id:42", Keys.ofCliId("id:42"))
        val keys = tricky.map(Keys::ofCliId)
        assertTrue(keys.all(TreeRules::isKey), "$keys")
        assertEquals(tricky.size, keys.toSet().size, "$keys")
    }

    @Test
    fun `CLI ids that are not keys are escaped wherever they name something, and still correlate`() {
        val session = Session()
        session.send("send-1", "go")
        session.turn("7")
        session.events(
            Lines.messageStart("__proto__"),
            Lines.blockStart(0, Lines.toolUse("42", "Bash")),
            Lines.assistant("__proto__", Lines.toolUse("42", "Bash", """{"command":"ls"}""")),
            Lines.request("0", "Bash", "42"),
        )
        val waiting = session.thread.message("id:7").part("id:42")
        assertEquals(JsonString("id:42"), waiting["toolCallId"])
        assertEquals("requires-action/interrupt", waiting.status())
        assertEquals("0", waiting.at("approval").str("id"), "the approval keeps the request id the host answers with")
        session.decide(ApprovalDecision.Allow("0"))
        session.events(Lines.user("u-1", Lines.toolResult("42", "\"ok\"")), Lines.result("7"))
        val done = session.thread.message("id:7").part("id:42")
        assertEquals(JsonString("ok"), done["result"])
        assertEquals("complete", done.status())
        assertEquals(listOf("send-1", "id:7"), session.thread.keysOf("messages"))
    }

    @Test
    fun `a host id that a CLI id also takes gets a key of its own`() {
        val session = Session()
        session.send("abc", "first")
        session.turn("abc")
        session.send("abc", "again")
        assertEquals(listOf("abc", "abc~2", "abc~3"), session.thread.keysOf("messages"))
        assertEquals(listOf("user", "assistant", "user"), session.thread.messages().map { it.str("role") })
        assertEquals(listOf("abc~3:0"), session.thread.message("abc~3").keysOf("parts"))
    }

    @Test
    fun `the host's ids must be keys`() {
        for (bad in listOf("", "12", "__proto__", "constructor", "prototype")) {
            assertThrows<IllegalArgumentException>(bad) { PresenterInput.UserSent(bad, "x") }
            assertThrows<IllegalArgumentException>(bad) { ThreadSource(bad, ConversationState(), Transcript()) }
        }
        assertThrows<IllegalArgumentException> { TreeProjector().project(emptyList()) }
        val thread = ThreadSource("t1", ConversationState(), Transcript())
        assertThrows<IllegalArgumentException> { TreeProjector().project(listOf(thread, thread)) }
    }

    @Test
    fun `a collection's order cannot be changed through a cast`() {
        val keyed = Keyed.empty<String>().put("a", "1").put("b", "2")

        @Suppress("UNCHECKED_CAST")
        val refused = assertThrows<RuntimeException> { (keyed.order as MutableList<String>).add("c") }
        assertTrue(refused is UnsupportedOperationException || refused is ClassCastException, "$refused")
        assertEquals(listOf("a", "b"), keyed.order)
    }
}
