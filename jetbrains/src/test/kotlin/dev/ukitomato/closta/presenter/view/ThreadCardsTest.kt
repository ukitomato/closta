package dev.ukitomato.closta.presenter.view

import com.google.gson.JsonParser
import dev.ukitomato.closta.presenter.tree.JsonText
import dev.ukitomato.closta.providers.claude.fixtures.CaptureFixtures
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
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

    private fun answersOf(card: QuestionCard): Map<String, String> =
        card.questions.associate { it.text to it.options.first().label }

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
        val sent = JsonParser.parseString(answerPayload(approval, mapOf(card.questions[0].text to "A")))
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
        val answers = questionAnswers(listOf(QuestionPick(text, listOf("A", "B"), other = null)))
        val sent = JsonParser.parseString(answerPayload(approval, answers)).asJsonObject
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

    private fun permissionCard(
        tool: String,
        input: dev.ukitomato.closta.presenter.tree.JsonObject,
    ): Pair<PermissionCard, ApprovalRecord> {
        val approval = ApprovalRecord("r1", "t1", tool, null, input, ask = false, anchor = null)
        return (cardOf(approval) as PermissionCard) to approval
    }

    private fun str(value: String) =
        dev.ukitomato.closta.presenter.tree
            .JsonString(value)

    @Test
    fun `a long command is kept whole`() {
        val command = "echo " + "x".repeat(995)
        val (card, _) =
            permissionCard(
                "Bash",
                dev.ukitomato.closta.presenter.tree.JsonObject
                    .of("command" to str(command)),
            )
        assertEquals(1000, command.length)
        assertEquals(command, card.subject)
        assertEquals(emptyList<InputField>(), card.inputFields)
        assertFalse(card.hiddenMarked)
    }

    @Test
    fun `a tool other than Bash and the file tools shows every key`() {
        val (card, _) =
            permissionCard(
                "mcp__repo__run",
                dev.ukitomato.closta.presenter.tree.JsonObject
                    .of("repo" to str("my-app"), "action" to str("delete")),
            )
        assertEquals(listOf(InputField("repo", "my-app"), InputField("action", "delete")), card.inputFields)
    }

    @Test
    fun `a value that is not a string is shown as JSON`() {
        val (card, _) =
            permissionCard(
                "mcp__repo__run",
                dev.ukitomato.closta.presenter.tree.JsonObject.of(
                    "force" to dev.ukitomato.closta.presenter.tree.JsonBool.TRUE,
                    "paths" to
                        dev.ukitomato.closta.presenter.tree
                            .JsonArray(listOf(str("a"), str("b"))),
                ),
            )
        assertEquals(listOf(InputField("force", "true"), InputField("paths", "[\"a\",\"b\"]")), card.inputFields)
    }

    @Test
    fun `the file tools show their path and no fields`() {
        val (card, _) =
            permissionCard(
                "Read",
                dev.ukitomato.closta.presenter.tree.JsonObject
                    .of("file_path" to str("/p/a.kt"), "offset" to str("3")),
            )
        assertEquals("/p/a.kt", card.subject)
        assertEquals(emptyList<InputField>(), card.inputFields)
    }

    @Test
    fun `an empty input shows no fields`() {
        val (card, approval) =
            permissionCard(
                "mcp__repo__run",
                dev.ukitomato.closta.presenter.tree.JsonObject.EMPTY,
            )
        assertEquals(emptyList<InputField>(), card.inputFields)
        assertEquals("{}", allowPayload(approval))
    }

    @Test
    fun `a command with a right-to-left override is marked`() {
        val override = Char(0x202E).toString()
        val (card, _) =
            permissionCard(
                "Bash",
                dev.ukitomato.closta.presenter.tree.JsonObject
                    .of("command" to str("ls ${override}txt.exe")),
            )
        assertEquals("ls <U+202E>txt.exe", card.subject)
        assertTrue(card.hiddenMarked)
    }

    @Test
    fun `a field with a hidden character in its key or value is marked`() {
        val zeroWidth = Char(0x200B).toString()
        val (byValue, _) =
            permissionCard(
                "mcp__repo__run",
                dev.ukitomato.closta.presenter.tree.JsonObject
                    .of("repo" to str("my${zeroWidth}app")),
            )
        assertEquals(listOf(InputField("repo", "my<U+200B>app")), byValue.inputFields)
        assertTrue(byValue.hiddenMarked)
        val (byKey, _) =
            permissionCard(
                "mcp__repo__run",
                dev.ukitomato.closta.presenter.tree.JsonObject
                    .of("re${zeroWidth}po" to str("my-app")),
            )
        assertEquals(listOf(InputField("re<U+200B>po", "my-app")), byKey.inputFields)
        assertTrue(byKey.hiddenMarked)
    }
}
