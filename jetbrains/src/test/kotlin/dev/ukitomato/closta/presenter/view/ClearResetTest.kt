package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.platforms.intellij.chat.clockOf
import dev.ukitomato.closta.platforms.intellij.chat.openSessionOf
import dev.ukitomato.closta.platforms.intellij.session.SessionView
import dev.ukitomato.closta.platforms.intellij.session.resumeIdOf
import dev.ukitomato.closta.providers.claude.fixtures.CaptureFixtures
import dev.ukitomato.closta.providers.claude.protocol.StreamJsonCodec
import dev.ukitomato.closta.providers.claude.synthetic.StreamScript
import org.junit.jupiter.api.Assertions.assertAll
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.ZoneId

/**
 * `/clear` in capture 41: a turn, `/clear` (a `conversation_reset`, then an init under a new session id), and a turn of
 * the new conversation. The thread keeps what came before, below a divider, and offers no rewind or fork before it.
 */
class ClearResetTest {
    private val steps = CaptureReplay.replay(SCENARIO, uuids = true)
    private val transcript = steps.last().transcript

    private fun replay(inputs: List<PresenterInput>): HostState =
        inputs.fold(HostState()) { state, input -> state.next(input) }

    private fun dividers(rows: List<ThreadRow>) = rows.filterIsInstance<DividerRow>()

    @Test
    fun `the thread is divided once, the first exchange above and the third below`() {
        val rows = ThreadRows().of(transcript)
        val divider = dividers(rows).single()
        val at = rows.indexOf(divider)
        val asks = rows.filterIsInstance<AskRow>()
        val texts = rows.filterIsInstance<TextRow>()

        assertAll(
            { assertEquals(Divider.Cleared(at = "2026-11-14T12:26:36.305Z"), divider.divider) },
            { assertTrue(rows.indexOf(asks.first { it.key == "send-1" }) < at, "the first ask stays above") },
            { assertTrue(rows.indexOf(texts.first { it.markdown == "pong" }) < at, "and its answer") },
            { assertTrue(rows.indexOf(asks.first { it.key == "send-3" }) > at, "the third ask is below") },
            { assertTrue(rows.indexOf(texts.first { it.markdown == "unknown" }) > at, "and its answer") },
        )
    }

    @Test
    fun `the divider sits in the message of the clear's turn, which is where the last clear is`() {
        val holder =
            transcript.messages.values().single { message ->
                message.parts.values().any { it is ClearedRecord }
            }

        assertEquals(transcript.messages.order.indexOf(holder.key), transcript.clearedAt)
    }

    @Test
    fun `an ask before the divider offers no rewind and no fork`() {
        listOf("send-1", "send-2").forEach { ask ->
            val actions = askActions(transcript, running = false, askKey = ask)
            assertAll(
                ask,
                { assertEquals(RewindRefusal.BEFORE_CLEAR, actions.refusal) },
                { assertNull(actions.rewind) },
                { assertNull(actions.rewindFiles) },
                { assertNull(actions.fork) },
                { assertEquals(RewindRefusal.BEFORE_CLEAR, turnEndActions(transcript, false, ask).refusal) },
            )
        }
    }

    @Test
    fun `an ask before the divider offers nothing while a reply runs either, for the clear`() {
        listOf("send-1", "send-2").forEach { ask ->
            assertEquals(RewindRefusal.BEFORE_CLEAR, askActions(transcript, running = true, askKey = ask).refusal, ask)
            assertEquals(RewindRefusal.BEFORE_CLEAR, turnEndActions(transcript, true, ask).refusal, ask)
        }
        assertEquals(RewindRefusal.RUNNING, askActions(transcript, running = true, askKey = "send-3").refusal)
    }

    @Test
    fun `the saved conversation a clear started is the open session's, the one before it is not`() {
        val open = mapOf(HOST_ID to resumeIdOf(SessionView(steps.last().conversation, transcript), HOST_ID))

        assertAll(
            { assertEquals(HOST_ID, openSessionOf(SECOND_SESSION, open)) },
            { assertNull(openSessionOf(FIRST_SESSION, open), "the cleared conversation is no open session's") },
        )
    }

    @Test
    fun `the ask after the divider follows the usual rules, as the first of its conversation`() {
        val actions = askActions(transcript, running = false, askKey = "send-3")

        assertAll(
            { assertEquals(RewindConversation(null), actions.rewind, "the new record's first line keeps nothing") },
            { assertEquals(ForkFrom(null), actions.fork) },
            { assertEquals(RewindRefusal.NOTHING_AFTER, turnEndActions(transcript, false, "send-3").refusal) },
        )
    }

    @Test
    fun `no turn end before the divider offers its rewind`() {
        val ends = ThreadRows().of(transcript).filterIsInstance<TurnEndRow>()

        assertTrue(ends.none { it.followed }, ends.toString())
    }

    @Test
    fun `the session id is the second init's after the fold`() {
        assertEquals(
            SECOND_SESSION,
            steps
                .last()
                .conversation.session
                ?.sessionId,
        )
    }

    @Test
    fun `between the reset and the next init the old id is gone, and the host's is used`() {
        // Review Focus 2.
        val reset = steps.indexOfFirst { (it.input as? PresenterInput.Event)?.event is AgentEvent.ConversationReset }
        val init =
            steps.withIndex().first { (index, step) ->
                index > reset && (step.input as? PresenterInput.Event)?.event is AgentEvent.SystemInit
            }
        val before = steps[reset - 1].conversation
        val cleared = steps[reset].conversation

        assertAll(
            { assertEquals(FIRST_SESSION, before.session?.sessionId) },
            {
                assertEquals(
                    HOST_ID,
                    resumeIdOf(SessionView(before, steps[reset - 1].transcript), HOST_ID),
                    "no clear yet",
                )
            },
            { assertNull(cleared.session, "the reset forgets the old session") },
            { assertEquals(HOST_ID, resumeIdOf(SessionView(cleared, steps[reset].transcript), HOST_ID)) },
            {
                assertEquals(
                    SECOND_SESSION,
                    init.value.conversation.session
                        ?.sessionId,
                )
            },
            {
                assertEquals(
                    SECOND_SESSION,
                    resumeIdOf(SessionView(init.value.conversation, init.value.transcript), HOST_ID),
                )
            },
        )
    }

    @Test
    fun `a reset that says no trigger still divides the thread`() {
        val inputs =
            CaptureReplay.inputs(SCENARIO, uuids = true).map { input ->
                val reset = (input as? PresenterInput.Event)?.event as? AgentEvent.ConversationReset
                reset?.let { PresenterInput.Event(it.copy(trigger = null, userMessageUuid = null)) } ?: input
            }
        val rows = ThreadRows().of(replay(inputs).transcript)

        assertEquals(1, dividers(rows).size)
    }

    @Test
    fun `two clears make two dividers and only the ask after the last can rewind`() {
        // Review Focus 1: 41, then its /clear once more under another uuid, then one more exchange.
        val state = replay(CaptureReplay.inputs(SCENARIO, uuids = true) + clearAgain() + askAgain())
        val rows = ThreadRows().of(state.transcript)
        val last = dividers(rows).last()

        assertEquals(2, dividers(rows).size)
        rows.filterIsInstance<AskRow>().forEach { ask ->
            val actions = askActions(state.transcript, running = false, askKey = ask.key)
            if (rows.indexOf(ask) < rows.indexOf(last)) {
                assertEquals(RewindRefusal.BEFORE_CLEAR, actions.refusal, ask.key)
            } else {
                assertNotNull(actions.rewind, ask.key)
            }
        }
        assertNotNull(askActions(state.transcript, false, "send-5").rewind)
        assertEquals(
            THIRD_SESSION,
            resumeIdOf(SessionView(state.conversation, state.transcript), HOST_ID),
            "the id follows the second",
        )
    }

    @Test
    fun `the divider's time is the hour and minute where the machine is`() {
        assertAll(
            { assertEquals("21:26", clockOf("2026-11-14T12:26:36.305Z", ZoneId.of("Asia/Tokyo"))) },
            { assertEquals("12:26", clockOf("2026-11-14T12:26:36.305Z", ZoneId.of("UTC"))) },
            { assertNull(clockOf("not a time", ZoneId.of("UTC")), "a time that cannot be read has the words alone") },
        )
    }

    /**
     * Lines 15 to 22 of 41 (the `/clear` from its queued lifecycle to its completed one), under fresh uuids, as the
     * second conversation's: its lines say the second session's id until the init after the reset says a third.
     */
    private fun clearAgain(): List<PresenterInput> {
        val lines =
            CaptureFixtures
                .nonBlankLines(CaptureFixtures.textOf("$SCENARIO.ndjson"))
                .subList(CLEAR_FROM - 1, CLEAR_TO)
                .map {
                    it
                        .replace(CLEAR_UUID, CLEAR_AGAIN)
                        .replace(NEW_CONVERSATION, "conversation-again")
                        .replace(SECOND_SESSION, THIRD_SESSION)
                        .replace(FIRST_SESSION, SECOND_SESSION)
                }
        return listOf(PresenterInput.UserSent("send-4", "/clear", uuid = CLEAR_AGAIN)) + events(lines)
    }

    /** One more exchange: its result is 41's last, naming this message instead. */
    private fun askAgain(): List<PresenterInput> {
        val result =
            CaptureFixtures
                .nonBlankLines(CaptureFixtures.textOf("$SCENARIO.ndjson"))
                .single { it.contains("\"type\":\"result\"") && it.contains(THIRD_UUID) }
                .replace(THIRD_UUID, ASK_AGAIN)
                .replace(SECOND_SESSION, THIRD_SESSION)
        val script =
            StreamScript(THIRD_SESSION).apply {
                lifecycle(ASK_AGAIN, "queued")
                lifecycle(ASK_AGAIN, "started")
                assistant("msg-again", listOf(StreamScript.text("again")))
            }
        val done = StreamScript(THIRD_SESSION).apply { lifecycle(ASK_AGAIN, "completed") }
        return listOf(PresenterInput.UserSent("send-5", "Once more", uuid = ASK_AGAIN)) +
            events(script.lines + result + done.lines)
    }

    private fun events(lines: List<String>): List<PresenterInput> =
        lines.map { PresenterInput.Event(StreamJsonCodec.decode(it)) }

    private companion object {
        const val SCENARIO = "41-clear-reset"
        const val FIRST_SESSION = "a6635625-53e9-40b5-adfb-977a4e9163b2"
        const val SECOND_SESSION = "b3c1b6ae-517a-4b6a-8b61-f3693facb4f1"
        const val THIRD_SESSION = "session-after-the-second-clear"
        const val HOST_ID = "host-id"
        const val CLEAR_UUID = "84d712ce-9cd0-4cec-b51e-4dfe8cf10d9a"
        const val THIRD_UUID = "b3d716bb-9d47-4504-b06a-b4ac287cb1ba"
        const val NEW_CONVERSATION = "c0817532-7496-4d9c-8870-b9c088a63253"
        const val CLEAR_AGAIN = "clear-again"
        const val ASK_AGAIN = "ask-again"
        const val CLEAR_FROM = 15
        const val CLEAR_TO = 22
    }
}
