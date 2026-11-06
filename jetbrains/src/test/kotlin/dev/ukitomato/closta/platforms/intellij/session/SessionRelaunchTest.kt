package dev.ukitomato.closta.platforms.intellij.session

import dev.ukitomato.closta.presenter.view.ResumeRefusal
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

/** What a restart for a new effort does and in which order, over functions that only write down their calls. */
class SessionRelaunchTest {
    private val calls = mutableListOf<String>()

    private fun SessionOpening.isFork() = this is SessionOpening.Fork

    private fun relaunch(
        open: (String?, SessionOpening, String?) -> Unit = { effort, opening, _ ->
            calls +=
                "open $effort${opening.savedId?.let { " resume $it" }.orEmpty()}"
        },
        close: () -> Unit = { calls += "close" },
    ) = SessionRelaunch(open, close)

    private fun relaunchHeld(held: Set<String>) =
        SessionRelaunch(
            { effort, opening, _ -> calls += "open $effort ${opening.savedId ?: "-"}" },
            { calls += "close" },
            { id ->
                calls += "asked $id"
                id in held
            },
        )

    @Test
    fun `the first start has no effort, and a relaunch closes the old session before it opens one with it`() {
        val relaunch = relaunch()
        assertNull(relaunch.effort)
        relaunch.start()
        relaunch.relaunch("high")
        assertEquals(listOf("open null", "close", "open high"), calls)
        assertEquals("high", relaunch.effort)
    }

    @Test
    fun `a saved session is opened once with the effort remembered, and no later start carries it`() {
        val relaunch = relaunch()
        relaunch.relaunch("high")
        relaunch.relaunch(null, SessionOpening.Resume("336ed47b-2675-4317-b3f5-a3b48abb03a2"))
        relaunch.restart()
        relaunch.relaunch("low")
        relaunch.start()

        assertEquals(
            listOf(
                "close",
                "open high",
                "close",
                "open high resume 336ed47b-2675-4317-b3f5-a3b48abb03a2",
                "close",
                "open high",
                "close",
                "open low",
                "open low",
            ),
            calls,
            "the effort goes on to the opened session, the saved one only to it",
        )
        assertEquals("low", relaunch.effort)
    }

    @Test
    fun `an open of a saved session that throws leaves the effort, and a later restart() is a new session`() {
        var failing = true
        val relaunch =
            relaunch(open = { effort, opening, _ ->
                calls += "open $effort ${opening.savedId ?: "-"}"
                if (failing) error("could not open")
            })
        assertThrows(IllegalStateException::class.java) { relaunch.relaunch("max", SessionOpening.Resume("x")) }
        failing = false
        relaunch.restart()

        assertEquals("max", relaunch.effort)
        assertEquals(listOf("close", "open max x", "close", "open max -"), calls)
    }

    @Test
    fun `restart() of the relaunch starts as the last relaunch did, and a later relaunch is remembered over it`() {
        val relaunch = relaunch()
        relaunch.restart()
        relaunch.relaunch("low")
        relaunch.restart()
        relaunch.relaunch("max")
        relaunch.restart()
        assertEquals(
            listOf(
                "close",
                "open null",
                "close",
                "open low",
                "close",
                "open low",
                "close",
                "open max",
                "close",
                "open max",
            ),
            calls,
        )
    }

    @Test
    fun `an open that throws leaves the effort remembered, so a later restart() tries it again`() {
        var failing = true
        val relaunch =
            relaunch(open = { effort, _, _ ->
                calls += "open $effort"
                if (failing) error("could not open")
            })
        assertThrows(IllegalStateException::class.java) { relaunch.relaunch("xhigh") }
        assertEquals("xhigh", relaunch.effort)
        failing = false
        relaunch.restart()
        assertEquals(listOf("close", "open xhigh", "close", "open xhigh"), calls)
    }

    @Test
    fun `the old session is closed before the new one is opened even when the effort is remembered first`() {
        lateinit var relaunch: SessionRelaunch
        relaunch = relaunch(close = { calls += "close with ${relaunch.effort}" })
        relaunch.relaunch("medium")
        assertEquals(listOf("close with medium", "open medium"), calls)
    }

    @Test
    fun `a saved session another session has is neither closed nor opened, and the effort is not remembered`() {
        val relaunch = relaunchHeld(setOf("held"))
        relaunch.relaunch("low")
        calls.clear()

        assertEquals(ResumeRefusal.ELSEWHERE, relaunch.relaunch("high", SessionOpening.Resume("held")))

        assertEquals(listOf("asked held"), calls)
        assertEquals("low", relaunch.effort)
    }

    @Test
    fun `a saved session nobody has is closed and opened as before, and nothing is refused`() {
        val relaunch = relaunchHeld(setOf("held"))

        assertNull(relaunch.relaunch(null, SessionOpening.Resume("free")))

        assertEquals(listOf("asked free", "close", "open null free"), calls)
    }

    @Test
    fun `a relaunch without a saved session and a restart do not ask`() {
        val relaunch = relaunchHeld(setOf("held"))
        assertNull(relaunch.relaunch("high"))
        relaunch.restart()
        relaunch.start()

        assertEquals(listOf("close", "open high -", "close", "open high -", "open high -"), calls)
    }

    @Test
    fun `a relaunch built with two arguments never finds a session held`() {
        val relaunch = relaunch()
        assertNull(relaunch.relaunch(null, SessionOpening.Resume("any")))
        assertEquals(listOf("close", "open null resume any"), calls)
    }

    @Test
    fun `every way of opening a session gives open the working directory it was built with, null as null`() {
        for (directory in listOf("/work/wt", null)) {
            val seen = mutableListOf<String?>()
            val relaunch =
                SessionRelaunch(
                    open = { _, _, where -> seen += where },
                    close = {},
                    workingDirectory = directory,
                )
            relaunch.start()
            relaunch.restart()
            relaunch.relaunch("high")
            relaunch.relaunch(null, SessionOpening.Resume("saved"))
            assertEquals(List(4) { directory }, seen)
        }
    }

    @Test
    fun `a refused saved session opens nothing in any directory`() {
        val seen = mutableListOf<String?>()
        val relaunch =
            SessionRelaunch(
                open = { _, _, where -> seen += where },
                close = { calls += "close" },
                heldElsewhere = { true },
                workingDirectory = "/work/wt",
            )
        assertEquals(ResumeRefusal.ELSEWHERE, relaunch.relaunch(null, SessionOpening.Resume("other")))
        assertEquals(emptyList<String?>(), seen)
        assertEquals(emptyList<String>(), calls)
    }

    @Test
    fun `the session this tab has now is not another tab's, even when asked it would say held`() {
        val asked = mutableListOf<String>()
        val relaunch =
            SessionRelaunch(
                open = { _, opening, _ -> calls += "open ${opening.savedId ?: "-"}" },
                close = { calls += "close" },
                heldElsewhere = {
                    asked += it
                    true
                },
                current = { "mine" },
            )

        assertNull(relaunch.relaunch(null, SessionOpening.Resume("mine")))
        assertEquals(emptyList<String>(), asked)
        assertEquals(listOf("close", "open mine"), calls)
        assertEquals(ResumeRefusal.ELSEWHERE, relaunch.relaunch(null, SessionOpening.Resume("theirs")))
        assertEquals(listOf("theirs"), asked)
    }

    @Test
    fun `a fork is opened with the flag, refused for another tab's session, allowed for this tab's own`() {
        val forks = mutableListOf<Boolean>()
        val relaunch =
            SessionRelaunch(
                open = { _, opening, _ ->
                    forks += opening is SessionOpening.Fork
                    calls += "open ${opening.savedId ?: "-"}"
                },
                close = { calls += "close" },
                heldElsewhere = { it == "theirs" },
                current = { "mine" },
            )

        assertEquals(ResumeRefusal.ELSEWHERE, relaunch.relaunch(null, SessionOpening.Fork("theirs")))
        assertEquals(emptyList<String>(), calls, "nothing was closed or opened")
        assertNull(relaunch.relaunch(null, SessionOpening.Fork("mine")))
        assertNull(relaunch.relaunch(null, SessionOpening.Fork("free")))
        relaunch.relaunch(null, SessionOpening.Resume("free"))
        relaunch.restart()
        relaunch.start()
        assertEquals(listOf(true, true, false, false, false), forks)
    }

    // The opens handed to afterClosed, kept to be run by the test when "the session has ended".
    private val waiting = mutableListOf<() -> Unit>()

    private fun relaunchWaiting() =
        SessionRelaunch(
            open = { effort, opening, _ -> calls += "open $effort ${opening.savedId ?: "-"} fork=${opening.isFork()}" },
            close = { calls += "close" },
            current = { "mine" },
            afterClosed = { open ->
                calls += "wait"
                waiting += open
            },
        )

    @Test
    fun `a fork of this tab's own session opens inside afterClosed, after the close`() {
        val relaunch = relaunchWaiting()
        relaunch.relaunch("high", SessionOpening.Fork("mine"))

        assertEquals(listOf("close", "wait"), calls, "nothing is opened until the wait ends")
        waiting.single()()
        assertEquals(listOf("close", "wait", "open high mine fork=true"), calls)
    }

    @Test
    fun `a second fork of the same id while the first waits waits too, and the first never opens`() {
        var shown: String? = "mine"
        val relaunch =
            SessionRelaunch(
                open = { effort, opening, _ ->
                    calls += "open $effort ${opening.savedId ?: "-"} fork=${opening.isFork()}"
                },
                close = {
                    calls += "close"
                    shown = null
                },
                heldElsewhere = { true },
                current = { shown },
                afterClosed = { open ->
                    calls += "wait"
                    waiting += open
                },
            )
        relaunch.relaunch(null, SessionOpening.Fork("mine"))
        assertEquals(null, relaunch.relaunch("low", SessionOpening.Fork("mine")), "not refused: it is still ours")
        assertEquals(listOf("close", "wait", "close", "wait"), calls)

        waiting.first()()
        assertEquals(listOf("close", "wait", "close", "wait"), calls, "the first wait was replaced")
        waiting.last()()
        assertEquals(listOf("close", "wait", "close", "wait", "open low mine fork=true"), calls)
    }

    @Test
    fun `a fork of another session, a resume and a restart open at once, without afterClosed`() {
        val relaunch = relaunchWaiting()
        relaunch.relaunch(null, SessionOpening.Fork("free"))
        relaunch.relaunch(null, SessionOpening.Resume("mine"))
        relaunch.relaunch(null)
        relaunch.restart()
        relaunch.start()

        assertEquals(
            listOf(
                "close",
                "open null free fork=true",
                "close",
                "open null mine fork=false",
                "close",
                "open null - fork=false",
                "close",
                "open null - fork=false",
                "open null - fork=false",
            ),
            calls,
        )
        assertEquals(emptyList<() -> Unit>(), waiting)
    }

    @Test
    fun `a fork with no current session is not waited for`() {
        val relaunch =
            SessionRelaunch(
                open = { _, opening, _ -> calls += "open ${opening.savedId ?: "-"}" },
                close = { calls += "close" },
                current = { null },
                afterClosed = { calls += "wait" },
            )
        relaunch.relaunch(null, SessionOpening.Fork("mine"))
        assertEquals(listOf("close", "open mine"), calls)
    }

    @Test
    fun `an open that waited does not open after another relaunch, a restart or cancelPending`() {
        for (later in listOf<(SessionRelaunch) -> Unit>(
            { it.relaunch(null, SessionOpening.Resume("free")) },
            { it.restart() },
            { it.start() },
            { it.cancelPending() },
        )) {
            calls.clear()
            waiting.clear()
            val relaunch = relaunchWaiting()
            relaunch.relaunch(null, SessionOpening.Fork("mine"))
            later(relaunch)
            val before = calls.toList()
            waiting.single()()
            assertEquals(before, calls, "the held open did nothing")
        }
    }

    @Test
    fun `an open that waited opens with the effort of the relaunch that held it`() {
        val relaunch = relaunchWaiting()
        relaunch.relaunch("low", SessionOpening.Fork("mine"))
        waiting.single()()
        assertEquals("open low mine fork=true", calls.last())
    }
}
