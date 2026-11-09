package dev.ukitomato.closta.presenter.stream

import dev.ukitomato.closta.presenter.ProtocolFixtures
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonRead
import dev.ukitomato.closta.presenter.tree.JsonString
import dev.ukitomato.closta.presenter.view.CaptureReplay
import dev.ukitomato.closta.presenter.view.Goldens
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.api.fail
import org.opentest4j.AssertionFailedError
import java.io.File

/**
 * Holds `src/test/protocol-fixtures/replay.jsonl` to the stream [ReplayGolden] generates from the captures, so the
 * file the webview replays is the one the host's code makes now. A drift names the first line that differs.
 *
 * Regenerate with `PRESENTER_GOLDEN_UPDATE=true` in the environment, the variable the projection's goldens use (the
 * build declares it an input of the test task, so the run is not skipped as up to date or taken from the cache); that
 * run fails once it has rewritten the file, and the next run without it — which the changed fixture makes run, since
 * the fixtures are an input too — checks what was written. `test` does not run the webview's side; only the webview's
 * own replay test shows the new file goes through the real applier.
 *
 * Line ends are made LF on both sides before comparing: a checkout that turned them into CRLF is not a drift.
 */
class ReplayGoldenTest {
    private val how =
        "if the change is intended, regenerate it — do not edit it by hand: in jetbrains/, run " +
            "`${Goldens.ENV}=true ./gradlew test --tests '*ReplayGoldenTest'`, run it again without the variable, " +
            "and read the diff of replay.jsonl"

    private fun file(): File = ProtocolFixtures.file(ReplayGolden.FILE)

    private fun lf(text: String): String = text.replace("\r\n", "\n")

    /**
     * Holds [stored] (null: no file) to [generated]: with [update], a file that differs is rewritten through [write]
     * and the run fails, so a rewrite is never taken for a pass; without, a drift fails naming its first line.
     */
    private fun holdToGolden(
        stored: String?,
        generated: String,
        update: Boolean,
        write: (String) -> Unit,
    ) {
        val kept = stored?.let(::lf)
        if (update) {
            if (kept != generated) {
                write(generated)
                fail(
                    "rewrote ${ReplayGolden.FILE}; run the tests again without ${Goldens.ENV} to check it",
                )
            }
            return
        }
        if (kept == null) fail("${ReplayGolden.FILE} is missing; $how")
        if (kept != generated) {
            fail("${ReplayGolden.FILE} drifted from the stream: ${firstDifference(kept, generated)}; $how")
        }
    }

    @Test
    fun `the replay fixture is the stream the host makes from the captures now`() {
        val file = file()
        val stored = if (file.isFile) file.readText(Charsets.UTF_8) else null
        holdToGolden(stored, ReplayGolden.text(), update = System.getenv(Goldens.ENV) == "true") {
            file.writeText(it, Charsets.UTF_8)
        }
    }

    @Test
    fun `a drift names its first line and how to regenerate, a rewrite fails after writing`() {
        val written = ArrayList<String>()
        val stored = "{\"scenario\":\"01\"}\n{\"input\":-1}\n{\"input\":0}\n"
        val generated = "{\"scenario\":\"01\"}\n{\"input\":-1}\n{\"input\":1}\n"
        val drift = assertThrows<AssertionFailedError> { holdToGolden(stored, generated, false) { written += it } }
        assertTrue("""line 3 (in "01"): was {"input":0}, is now {"input":1}""" in drift.message!!, drift.message)
        for (part in listOf(
            Goldens.ENV,
            "do not edit it by hand",
            "in jetbrains/",
            "./gradlew test",
        )) {
            assertTrue(part in drift.message!!, "the message says $part: ${drift.message}")
        }
        // A checkout that made the line ends CRLF holds the same stream.
        holdToGolden(generated.replace("\n", "\r\n"), generated, false) { written += it }
        val long = "{\"input\":0,\"value\":\"${"x".repeat(LONG)}a\"}"
        val far =
            assertThrows<AssertionFailedError> { holdToGolden(long, long.replace("xa", "xb"), false) { written += it } }
        // The x's start after the 20 characters of {"input":0,"value":", and columns count from 1.
        val tail = "\"} (${long.length} chars, from column ${LONG + 21})"
        assertTrue("xxxa$tail, is now …xxx" in far.message!! && "xxxb$tail;" in far.message!!, far.message)
        // A line added at the end shows as missing before, not as an empty line.
        val header = "{\"scenario\":\"01\"}\n"
        val added =
            assertThrows<AssertionFailedError> {
                holdToGolden(header, header + "{\"input\":-1}\n", false) { written += it }
            }
        assertTrue("""line 2 (in "01"): was missing, is now {"input":-1}""" in added.message!!, added.message)
        val missing = assertThrows<AssertionFailedError> { holdToGolden(null, generated, false) { written += it } }
        assertTrue("missing" in missing.message!!, missing.message)
        holdToGolden(generated, generated, false) { written += it }
        assertEquals(emptyList<String>(), written, "a check never writes")
        val rewrite = assertThrows<AssertionFailedError> { holdToGolden(stored, generated, true) { written += it } }
        assertTrue("rewrote" in rewrite.message!! && Goldens.ENV in rewrite.message!!, rewrite.message)
        assertEquals(listOf(generated), written)
        holdToGolden(generated, generated, true) { written += it }
        assertEquals(1, written.size, "an unchanged file is left alone")
    }

    @Test
    fun `the replay's epochs are new each time, as a host's would be`() {
        val epochs = ReplayGolden.epochs()
        assertEquals(listOf("e1", "e2", "e3"), List(3) { epochs() })
        assertEquals("e1", ReplayGolden.epochs()(), "each capture starts again")
    }

    @Test
    fun `the replay fixture holds every capture once, in the recorder's order, as the webview's test expects`() {
        val file = file()
        val scenarios =
            file
                .readLines(Charsets.UTF_8)
                .map { checkNotNull(JsonRead.parse(it) as? JsonObject) { "a line that is not an object: $it" } }
                .mapNotNull { (it["scenario"] as? JsonString)?.value }
        assertEquals(CaptureReplay.scenarios(), scenarios)
        assertEquals(EXPECTED_SCENARIOS, scenarios.size, "the webview's replay test counts the same number")
    }

    private fun firstDifference(
        stored: String,
        generated: String,
    ): String {
        // A final line end is the end of the last line, not the start of an empty one.
        val old = stored.removeSuffix("\n").lines()
        val new = generated.removeSuffix("\n").lines()
        val index = old.indices.firstOrNull { it >= new.size || old[it] != new[it] } ?: new.size.coerceAtMost(old.size)
        val scenario =
            new
                .take(index + 1)
                .lastOrNull { it.startsWith("{\"scenario\":") }
                ?.let { (JsonRead.parse(it) as JsonObject)["scenario"] }
        val was = old.getOrNull(index)
        val now = new.getOrNull(index)
        // Where in the line they part, so a long line shows the part that changed.
        val column = if (was == null || now == null) 0 else was.zip(now).takeWhile { (a, b) -> a == b }.size
        return "line ${index + 1} (in $scenario): was ${excerpt(was, column)}, is now ${excerpt(now, column)}"
    }

    private fun excerpt(
        line: String?,
        column: Int,
    ): String =
        when {
            line == null -> "missing"
            line.length <= EXCERPT -> line
            else -> {
                val start = (column - EXCERPT / 2).coerceIn(0, line.length - EXCERPT)
                val head = if (start > 0) "…" else ""
                val tail = if (start + EXCERPT < line.length) "…" else ""
                "$head${line.substring(start, start + EXCERPT)}$tail (${line.length} chars, from column ${column + 1})"
            }
        }

    private companion object {
        const val EXPECTED_SCENARIOS = 32
        const val EXCERPT = 160
        const val LONG = 400
    }
}
