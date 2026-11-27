package dev.ukitomato.closta.platforms.intellij.session

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/** When the notice that the IDE's folders changed since the session started is shown, taken back, and never again. */
class RootsNoticeTest {
    private val launched = setOf("/a", "/b")

    @Test
    fun `the same folders say nothing`() {
        assertEquals(NoticeChange.NONE, rootsNotice(launched, setOf("/b", "/a"), shown = false, shownOnce = false))
    }

    @Test
    fun `different folders are shown once`() {
        assertEquals(NoticeChange.SHOW, rootsNotice(launched, setOf("/a"), shown = false, shownOnce = false))
        assertEquals(
            NoticeChange.SHOW,
            rootsNotice(launched, setOf("/a", "/b", "/c"), shown = false, shownOnce = false),
        )
    }

    @Test
    fun `a notice that is shown stays while the folders still differ`() {
        assertEquals(NoticeChange.NONE, rootsNotice(launched, setOf("/a"), shown = true, shownOnce = true))
    }

    @Test
    fun `back to the folders it started with takes the notice back`() {
        assertEquals(NoticeChange.HIDE, rootsNotice(launched, launched, shown = true, shownOnce = true))
    }

    @Test
    fun `after it was taken back a new difference is not shown again`() {
        assertEquals(NoticeChange.NONE, rootsNotice(launched, setOf("/z"), shown = false, shownOnce = true))
    }

    @Test
    fun `a sync that changes nothing never shows a notice, however often it runs`() {
        repeat(5) {
            assertEquals(NoticeChange.NONE, rootsNotice(launched, launched, shown = false, shownOnce = false))
        }
    }

    @Test
    fun `a watch shows the notice once for a session however often the roots change`() {
        var now = setOf("/a", "/b")
        val watch = RootsWatch { now }
        watch.launched("s1", "/work", launched)
        watch.rootsChanged()
        assertEquals(emptySet<String>(), watch.pending.value)
        now = setOf("/a")
        watch.rootsChanged()
        assertEquals(setOf("s1"), watch.pending.value)
        watch.rootsChanged()
        assertEquals(setOf("s1"), watch.pending.value)
        now = launched
        watch.rootsChanged()
        assertEquals(emptySet<String>(), watch.pending.value)
        now = setOf("/z")
        watch.rootsChanged()
        assertEquals(emptySet<String>(), watch.pending.value)
    }

    @Test
    fun `a watch asks each session's roots by its own folder, and forgets a session that is gone`() {
        val asked = mutableListOf<String?>()
        val watch =
            RootsWatch { cwd ->
                asked += cwd
                setOf("/new")
            }
        watch.launched("s1", "/work/a", launched)
        watch.launched("s2", null, launched)
        watch.rootsChanged()
        assertEquals(listOf<String?>("/work/a", null), asked)
        assertEquals(setOf("s1", "s2"), watch.pending.value)
        watch.forget("s1")
        assertEquals(setOf("s2"), watch.pending.value)
    }
}
