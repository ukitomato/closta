package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.ConversationState
import dev.ukitomato.closta.presenter.tree.JsonBool
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonString
import dev.ukitomato.closta.presenter.tree.JsonValue
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

private typealias View = Pair<ConversationState, Transcript>

/** How the sessions list groups a session, and which notifications a change of its view raises or takes back. */
class SessionGroupsTest {
    private fun views(scenario: String): List<View> =
        CaptureReplay.replay(scenario).map { it.conversation to it.transcript }

    private fun View.pending(): Boolean = first.pendingApprovals.any { it.requestId.isNotEmpty() }

    /** The first view where an approval waits, and the one before it. */
    private fun firstWait(scenario: String): Pair<View, View> {
        val all = views(scenario)
        val at = all.indexOfFirst { it.pending() }
        return all[at - 1] to all[at]
    }

    /** No capture asks for Bash (the recorder runs it without asking): 05's request, with a command for its input. */
    private fun View.asBash(command: String = COMMAND): View =
        first to
            second.copy(
                approvals =
                    second.approvals.values().fold(second.approvals) { approvals, record ->
                        approvals.put(
                            record.requestId,
                            record.copy(toolName = "Bash", input = JsonObject.of("command" to JsonString(command))),
                        )
                    },
            )

    private fun View.asTool(
        tool: String,
        input: JsonObject? = null,
    ): View =
        first to
            second.copy(
                approvals =
                    second.approvals.values().fold(second.approvals) { approvals, record ->
                        approvals.put(record.requestId, record.copy(toolName = tool, input = input ?: record.input))
                    },
            )

    private fun summary(
        view: View,
        unread: Boolean = false,
    ) = sessionSummary(view.first, view.second, unread)

    @Test
    fun waitingComesFirst() {
        val (_, bash) = firstWait("05-permission-can-use-tool")
        val waiting = summary(bash.asBash(), unread = true)
        assertEquals(SessionGroup.WAITING, waiting.group)
        assertEquals(WaitReason.Permission("Bash", COMMAND.take(40)), waiting.reason)

        val (_, question) = firstWait("14-ask-answers-updatedinput")
        assertEquals(SessionSummary(SessionGroup.WAITING, WaitReason.Question), summary(question))

        val (_, plan) = firstWait("05-permission-can-use-tool")
        assertEquals(WaitReason.Plan, summary(plan.asTool("ExitPlanMode")).reason)
    }

    @Test
    fun runningThenUnreadThenOther() {
        val all = views("01-baseline-text")
        val running = all.first { threadIsRunning(it.first, it.second) && !it.pending() }
        assertEquals(SessionSummary(SessionGroup.RUNNING, null), summary(running, unread = true))
        val done = all.last()
        assertEquals(SessionSummary(SessionGroup.UNREAD, null), summary(done, unread = true))
        assertEquals(SessionSummary(SessionGroup.OTHER, null), summary(done, unread = false))
        assertTrue(
            SessionGroup.entries ==
                listOf(SessionGroup.WAITING, SessionGroup.RUNNING, SessionGroup.UNREAD, SessionGroup.OTHER),
        )
    }

    @Test
    fun aPermissionWhileHiddenAlerts() {
        val (before, after) = firstWait("05-permission-can-use-tool")
        val id =
            after.first.pendingApprovals
                .single()
                .requestId

        val change = alertsBetween(before.asBash(), after.asBash())

        assertEquals(listOf(PermissionAlert(id, id, "Bash", COMMAND.take(80), answerable = false)), change.raised)
        assertEquals(emptyList<String>(), change.expired)
    }

    @Test
    fun samePendingAlertsOnce() {
        val (_, after) = firstWait("05-permission-can-use-tool")
        assertEquals(AlertChange(emptyList(), emptyList()), alertsBetween(after, after))
    }

    @Test
    fun answeredExpiresTheAlert() {
        val all = views("05-permission-can-use-tool")
        val at = all.indexOfFirst { it.pending() }
        val id =
            all[at]
                .first.pendingApprovals
                .single()
                .requestId
        val answered = all.drop(at).first { !it.pending() }

        assertEquals(listOf(id), alertsBetween(all[at], answered).expired)
    }

    @Test
    fun editAndQuestionAreOpenOnly() {
        val (beforeEdit, edit) = firstWait("17-edit-approval")
        val editId =
            edit.first.pendingApprovals
                .single()
                .requestId
        assertEquals(listOf(OpenOnlyAlert(editId, editId, AlertKind.EDIT)), alertsBetween(beforeEdit, edit).raised)

        val (beforeAsk, ask) = firstWait("14-ask-answers-updatedinput")
        val askId =
            ask.first.pendingApprovals
                .single()
                .requestId
        assertEquals(listOf(OpenOnlyAlert(askId, askId, AlertKind.QUESTION)), alertsBetween(beforeAsk, ask).raised)

        val (beforeWrite, write) = firstWait("05-permission-can-use-tool")
        assertEquals(AlertKind.EDIT, (alertsBetween(beforeWrite, write).raised.single() as OpenOnlyAlert).what)
        val plan = alertsBetween(beforeWrite.asTool("ExitPlanMode"), write.asTool("ExitPlanMode")).raised.single()
        assertEquals(AlertKind.PLAN, (plan as OpenOnlyAlert).what)
    }

    private fun alertFor(
        tool: String,
        input: JsonObject,
    ): PermissionAlert {
        val (before, after) = firstWait("05-permission-can-use-tool")
        return alertsBetween(before.asTool(tool, input), after.asTool(tool, input)).raised.single() as PermissionAlert
    }

    private fun bashAlert(
        command: String,
        vararg more: Pair<String, JsonValue> = emptyArray(),
    ) = alertFor("Bash", JsonObject.of("command" to JsonString(command), *more))

    private fun readAlert(path: String) = alertFor("Read", JsonObject.of("file_path" to JsonString(path)))

    @Test
    fun `a short one line command can be allowed from the notification`() {
        assertTrue(bashAlert("a".repeat(80)).answerable)
        assertTrue(bashAlert("ls", "description" to JsonString("list")).answerable)
    }

    @Test
    fun `a long or multi line command cannot`() {
        assertEquals(false, bashAlert("a".repeat(81)).answerable)
        assertEquals(false, bashAlert("ls\nrm -rf x").answerable)
    }

    @Test
    fun `a command with more input than the command cannot`() {
        assertEquals(false, bashAlert("ls", "timeout" to JsonString("5")).answerable)
        assertEquals(false, bashAlert("ls", "dangerouslyDisableSandbox" to JsonBool.TRUE).answerable)
    }

    @Test
    fun `a tool other than Bash and the file tools cannot`() {
        val input = JsonObject.of("url" to JsonString("https://example.com"))
        for (tool in listOf("WebFetch", "Grep", "mcp__server__call")) {
            assertEquals(false, alertFor(tool, input).answerable, tool)
        }
    }

    @Test
    fun `a file shows its folder`() {
        val alert = readAlert("/home/u/.ssh/id_rsa")
        assertEquals(".ssh/id_rsa", alert.subject)
        assertTrue(alert.answerable)
        assertEquals("note.txt", readAlert("note.txt").subject)
    }

    @Test
    fun `a Read with more input than the path cannot`() {
        val alert = alertFor("Read", JsonObject.of("file_path" to JsonString("/a/b"), "limit" to JsonString("1")))
        assertEquals(false, alert.answerable)
    }

    @Test
    fun `a Bash without a string command cannot`() {
        assertEquals(false, alertFor("Bash", JsonObject.of()).answerable)
        assertEquals(false, alertFor("Bash", JsonObject.of("command" to JsonBool.TRUE)).answerable)
        assertEquals(false, bashAlert("").answerable)
    }

    @Test
    fun `a Read that is not a path alone cannot`() {
        assertEquals(false, alertFor("Read", JsonObject.of()).answerable)
        assertEquals(false, readAlert("").answerable)
        for (key in listOf("offset", "pages")) {
            val input = JsonObject.of("file_path" to JsonString("/a/b"), key to JsonString("1"))
            assertEquals(false, alertFor("Read", input).answerable, key)
        }
    }

    @Test
    fun `a Windows path shows its folder`() {
        assertEquals(".ssh/id_rsa", readAlert("C:\\a\\.ssh\\id_rsa").subject)
    }

    @Test
    fun `hidden characters are marked`() {
        val rlo = String(Character.toChars(0x202E))
        val bash = bashAlert("cat evil" + rlo + "txt.sh")
        assertTrue(bash.subject.contains("<U+202E>"))
        assertEquals(false, bash.answerable)
        val read = readAlert("/a/evil" + rlo + "txt")
        assertTrue(read.subject.contains("<U+202E>"))
        assertEquals(false, read.answerable)
    }

    @Test
    fun anAlertShowsNothingOfAnotherToolsInput() {
        val (before, after) = firstWait("05-permission-can-use-tool")
        val url = JsonObject.of("url" to JsonString("https://example.com/secret?q=1"))
        for (tool in listOf("WebFetch", "Grep", "Task", "mcp__server__call")) {
            val alert =
                alertsBetween(before.asTool(tool, url), after.asTool(tool, url)).raised.single() as PermissionAlert
            assertEquals("", alert.subject, tool)
        }
    }

    @Test
    fun turnEndRaisesFinished() {
        val all = views("01-baseline-text")
        val end =
            (1 until all.size).first {
                threadIsRunning(all[it - 1].first, all[it - 1].second) &&
                    !threadIsRunning(all[it].first, all[it].second)
            }
        val turns = all[end].first.turns.size

        assertEquals(listOf(FinishedAlert("finished:$turns")), alertsBetween(all[end - 1], all[end]).raised)
        assertEquals(emptyList<SessionAlert>(), alertsBetween(all[end], all[end]).raised)
    }

    @Test
    fun aFirstLookRaisesWhatWaits() {
        val (_, after) = firstWait("17-edit-approval")
        val id =
            after.first.pendingApprovals
                .single()
                .requestId
        assertEquals(listOf(OpenOnlyAlert(id, id, AlertKind.EDIT)), alertsBetween(null, after).raised)
        assertEquals(emptyList<SessionAlert>(), alertsBetween(null, views("01-baseline-text").last()).raised)
    }

    @Test
    fun aSessionWithNothingIsOther() {
        val summary = sessionSummary(ConversationState(), Transcript(), unread = false)
        assertEquals(SessionGroup.OTHER, summary.group)
        assertNull(summary.reason)
    }

    private companion object {
        const val COMMAND =
            "./gradlew :auth:test --tests 'dev.example.auth.SignInTest' --info --stacktrace --no-daemon --rerun"
    }
}

class SessionTitleTest {
    @Test
    fun theFirstLineOfTheFirstRequestNamesASession() {
        val transcript = CaptureReplay.replay("01-baseline-text").last().transcript
        assertEquals("Respond with exactly one word: pong", sessionTitle(transcript))
    }

    @Test
    fun aLongRequestIsCut() {
        val long = "あ".repeat(100) + "\n二行目"
        val transcript =
            foldTranscript(Transcript(), PresenterInput.UserSent("u1", long), ConversationState(), ConversationState())
        assertEquals("あ".repeat(TITLE_MAX), sessionTitle(transcript))
    }

    @Test
    fun aSessionWithNoRequestHasNoTitle() {
        assertNull(sessionTitle(Transcript()))
    }
}
