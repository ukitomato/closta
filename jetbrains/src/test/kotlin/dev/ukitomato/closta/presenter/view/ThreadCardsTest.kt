package dev.ukitomato.closta.presenter.view

import com.google.gson.JsonParser
import dev.ukitomato.closta.presenter.tree.JsonText
import dev.ukitomato.closta.providers.claude.fixtures.CaptureFixtures
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import com.google.gson.JsonObject as GsonObject

class ThreadCardsTest {
    private fun approvals(scenario: String): List<ApprovalRecord> =
        CaptureReplay
            .replay(scenario)
            .last()
            .transcript.approvals
            .values()

    /** What the CLI took as the answered call's input: the capture's AskUserQuestion `tool_use_result`. */
    private fun answeredInput(scenario: String): GsonObject =
        CaptureFixtures
            .nonBlankLines(CaptureFixtures.textOf("$scenario.ndjson"))
            .map { JsonParser.parseString(it).asJsonObject }
            .first {
                it.get("tool_use_result")?.isJsonObject == true &&
                    it.getAsJsonObject("tool_use_result").has("answers")
            }.getAsJsonObject("tool_use_result")

    private fun answersOf(card: QuestionCard): Map<String, List<String>> =
        card.questions.associate { it.text to listOf(it.options.first().label) }

    @Test
    fun writeCardShowsTheFile() {
        val approval = approvals("05-permission-can-use-tool").first()
        val card = cardOf(approval) as PermissionCard
        val path = (approval.input as dev.ukitomato.closta.presenter.tree.JsonObject).string("file_path")
        assertEquals("Write", card.toolName)
        assertEquals(path, card.subject)
    }

    @Test
    fun bashCardShowsTheCommand() {
        // No capture asks for Bash (the recorder runs it without asking); the request's shape is the same as Write's.
        val input =
            dev.ukitomato.closta.presenter.tree.JsonObject
                .of(
                    "command" to
                        dev.ukitomato.closta.presenter.tree
                            .JsonString("./gradlew :auth:test"),
                )
        val approval = ApprovalRecord("r1", "t1", "Bash", null, input, ask = false, anchor = null)
        val card = cardOf(approval) as PermissionCard
        assertEquals("./gradlew :auth:test", card.subject)
    }

    @Test
    fun allowPayloadIsTheRequestsOwnInput() {
        val approval = approvals("05-permission-can-use-tool").first()
        assertEquals(JsonText.compact(approval.input!!), allowPayload(approval))
        assertNotEquals("{}", allowPayload(approval))
    }

    @Test
    fun answerPayloadMatchesCapture14() {
        val approval = approvals("14-ask-answers-updatedinput").single()
        val card = cardOf(approval) as QuestionCard
        val sent = JsonParser.parseString(answerPayload(approval, mapOf(card.questions[0].text to listOf("A"))))
        assertEquals(answeredInput("14-ask-answers-updatedinput"), sent)
    }

    @Test
    fun answerPayloadMatchesCapture18() {
        val approval = approvals("18-ask-multi-question").single()
        val card = cardOf(approval) as QuestionCard
        assertEquals(2, card.questions.size)
        val sent = JsonParser.parseString(answerPayload(approval, answersOf(card)))
        assertEquals(answeredInput("18-ask-multi-question"), sent)
    }

    @Test
    fun questionOptionsCarryTheirDescriptions() {
        val card = cardOf(approvals("18-ask-multi-question").single()) as QuestionCard
        assertEquals(
            listOf(QuestionOption("A", "Aを選択します"), QuestionOption("B", "Bを選択します")),
            card.questions[0].options,
        )
        assertEquals(listOf("Xを選択します", "Yを選択します"), card.questions[1].options.map { it.description })
    }

    @Test
    fun multiSelectJoinsLabels() {
        val approval = approvals("14-ask-answers-updatedinput").single()
        val text = (cardOf(approval) as QuestionCard).questions[0].text
        val sent = JsonParser.parseString(answerPayload(approval, mapOf(text to listOf("A", "B")))).asJsonObject
        assertEquals("A, B", sent.getAsJsonObject("answers").get(text).asString)
    }

    @Test
    fun approvalCardFollowsItsAnchorMessage() {
        val transcript = CaptureReplay.replay("05-permission-can-use-tool").last().transcript
        val rows = ThreadRows().of(transcript)
        val card = rows.indexOfFirst { it is CardRow }
        assertTrue(card > 0)
        val anchor =
            transcript.approvals
                .values()
                .first()
                .anchor
        assertEquals(anchor, rows[card - 1].key.substringBefore('/'))
    }

    @Test
    fun acceptedSuggestionsArePassedOnAsTheCliSentThem() {
        val approval = approvals("16-permission-suggestion-accept").single()
        val offered = approval.suggestions
        assertTrue(offered.isNotEmpty())
        val passed = passedOn(approval, offered)
        assertEquals(offered.map { it.id }, passed.acceptedSuggestions)
        assertEquals(
            JsonParser.parseString("[" + offered.joinToString(",") { it.raw } + "]"),
            JsonParser.parseString(passed.updatedPermissions),
        )
        assertEquals(approval.input, passed.input)
        assertEquals(null, passedOn(approval, emptyList()).updatedPermissions)
    }

    @Test
    fun aSuggestionCanBeKeptElsewhere() {
        val offered = approvals("16-permission-suggestion-accept").single().suggestions.first()
        val moved = withDestination(offered, "userSettings")
        assertEquals("userSettings", moved.destination)
        assertEquals("userSettings", JsonParser.parseString(moved.raw).asJsonObject["destination"].asString)
        assertEquals(offered.kind, moved.kind)
    }
}
