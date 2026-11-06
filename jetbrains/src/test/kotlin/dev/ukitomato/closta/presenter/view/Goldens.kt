package dev.ukitomato.closta.presenter.view

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.fail

/**
 * Holds printed trees to goldens. With [update], a golden that differs is rewritten and the run fails, so a
 * rewrite is never taken for a pass; the next run, without [update], checks what was written.
 */
class Goldens(
    private val update: Boolean,
    private val read: (String) -> String?,
    private val write: (String, String) -> Unit,
) {
    fun check(
        name: String,
        actual: String,
    ) {
        val expected = read(name)
        if (update) {
            if (expected != actual) {
                write(name, actual)
                fail<Unit>("rewrote the golden of $name; run the tests again without $ENV to check it")
            }
            return
        }
        if (expected == null) fail<Unit>("$name has no golden; $HOW")
        assertEquals(expected, actual) { "$name drifted from its golden; if the change is intended, $HOW" }
    }

    companion object {
        const val ENV = "PRESENTER_GOLDEN_UPDATE"
        const val HOW = "regenerate with `$ENV=true ./gradlew test --tests '*ProjectionGoldenTest'`, then run again"
    }
}
