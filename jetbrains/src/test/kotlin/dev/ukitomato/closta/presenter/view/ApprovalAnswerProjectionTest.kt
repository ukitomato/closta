package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.ApprovalDecision
import dev.ukitomato.closta.presenter.at
import dev.ukitomato.closta.presenter.message
import dev.ukitomato.closta.presenter.part
import dev.ukitomato.closta.presenter.tree.JsonArray
import dev.ukitomato.closta.presenter.tree.JsonBool
import dev.ukitomato.closta.presenter.tree.JsonNumber
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonRead
import dev.ukitomato.closta.presenter.tree.JsonString
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Test

/**
 * What the host did with an approval's answer, as the tree shows it: the suggestions it passed on, the input it
 * sent when that is a rewrite, and the answers it could not pass on.
 */
class ApprovalAnswerProjectionTest {
    private val suggestions =
        """[{"type":"setMode","mode":"acceptEdits","destination":"session"},""" +
            """{"type":"addDirectories","directories":["/a","/b"],"destination":"userSettings"}]"""
    private val input = """{"command":"ls"}"""

    private fun asked(): Session {
        val session = Session()
        session.turn("c1")
        session.events(
            Lines.assistant("m1", Lines.toolUse("toolu_1", "Bash", input)),
            Lines.request("r1", "Bash", "toolu_1", input, suggestions = suggestions),
        )
        return session
    }

    private fun Session.approval(): JsonObject = thread.message("c1").part("toolu_1").at("approval")

    @Test
    fun `an allow that passed suggestions on shows their ids, and one that did not shows none`() {
        val accepted = asked()
        accepted.input(
            PresenterInput.Decided(ApprovalDecision.Allow("r1"), 1_000, PassedOn(acceptedSuggestions = listOf("s1"))),
        )
        assertEquals(JsonArray(listOf(JsonString("s1"))), accepted.approval()["acceptedSuggestions"])

        val plain = asked()
        plain.decide(ApprovalDecision.Allow("r1"))
        assertNull(plain.approval()["acceptedSuggestions"])

        val denied = asked()
        denied.input(
            PresenterInput.Decided(ApprovalDecision.Deny("r1"), 1_000, PassedOn(acceptedSuggestions = listOf("s1"))),
        )
        assertNull(denied.approval()["acceptedSuggestions"], "a denial passes nothing on")
    }

    @Test
    fun `a suggestion keeps the item as the CLI sent it, and the tree does not carry it`() {
        val session = asked()
        val kept = session.transcript.approvals["r1"]!!.suggestions
        assertEquals(JsonRead.parse(suggestions), JsonArray(kept.map { JsonRead.parse(it.raw)!! }))
        val shown = (session.approval()["suggestions"] as JsonArray).items.map { it as JsonObject }
        assertFalse(shown.any { it.containsKey("raw") }, "raw is the host's, not the screen's")
    }

    @Test
    fun `an input is shown only when it is not the request's own`() {
        val same = asked()
        same.input(
            PresenterInput.Decided(
                ApprovalDecision.Allow("r1"),
                1_000,
                PassedOn(input = JsonRead.parse(input) as JsonObject),
            ),
        )
        assertNull(same.approval()["updatedInput"])

        val rewritten = asked()
        rewritten.input(
            PresenterInput.Decided(
                ApprovalDecision.Allow("r1"),
                1_000,
                PassedOn(input = JsonRead.parse("""{"command":"ls -la"}""") as JsonObject),
            ),
        )
        assertEquals(JsonObject.of("command" to JsonString("ls -la")), rewritten.approval()["updatedInput"])

        val answered = asked()
        answered.input(
            PresenterInput.Decided(
                ApprovalDecision.Deny("r1"),
                1_000,
                PassedOn(input = JsonRead.parse("""{"command":"x"}""") as JsonObject),
            ),
        )
        assertNull(answered.approval()["updatedInput"], "a denial runs nothing")
    }

    @Test
    fun `answers not passed on are counted, each one a change, and the next answer clears the sentence`() {
        val session = asked()
        session.input(PresenterInput.AnswerFailed("r1", "could not"))
        val first = session.approval()
        assertEquals(JsonString("could not"), first["failure"])
        assertEquals(JsonNumber.of(1), first["failures"])

        session.input(PresenterInput.AnswerFailed("r1", "could not"))
        val second = session.approval()
        assertEquals(JsonNumber.of(2), second["failures"], "the same sentence again is still a change")

        session.decide(ApprovalDecision.Allow("r1"))
        val settled = session.approval()
        assertNull(settled["failure"], "an answer that went through clears the sentence")
        assertEquals(JsonNumber.of(2), settled["failures"], "and keeps the count")
        assertEquals(JsonBool.TRUE, settled["approved"])
    }

    @Test
    fun `a failure for an approval that is settled or unknown changes nothing`() {
        val session = asked()
        session.decide(ApprovalDecision.Allow("r1"))
        val before = session.transcript
        session.input(PresenterInput.AnswerFailed("r1", "late"))
        assertSame(before, session.transcript, "an approval already settled stays as it ended")
        session.input(PresenterInput.AnswerFailed("nope", "x"))
        assertSame(before, session.transcript)
    }

    @Test
    fun `a failure for an approval the CLI cancelled changes nothing, it is not one still open to answer`() {
        val session = asked()
        session.events(Lines.result("c1"))
        val cancelled = session.approval()
        assertEquals(JsonString("cancelled"), cancelled["resolution"])
        val before = session.transcript
        session.input(PresenterInput.AnswerFailed("r1", "late"))
        assertSame(before, session.transcript, "a cancelled approval carries no failure of an answer it could not take")
        assertNull(session.approval()["failure"])
        assertNull(session.approval()["failures"])
    }

    @Test
    fun `the records of a request and its suggestions print without what they hold`() {
        val record = asked().transcript.approvals["r1"]!!
        val printed = "$record ${record.suggestions} ${PassedOn(input = JsonObject.of("k" to JsonString("SECRET")))}"
        for (secret in listOf("command", "acceptEdits", "/a", "SECRET", "directories")) {
            assertFalse(secret in printed) { printed }
        }
    }
}
