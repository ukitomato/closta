package dev.ukitomato.closta.presenter

import dev.ukitomato.closta.presenter.tree.JsonNumber
import dev.ukitomato.closta.presenter.tree.JsonObject
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.opentest4j.AssertionFailedError

class TreeChecksTest {
    @Test
    fun `a tree the webview rejects fails with the webview's reason, not with a stricter check's`() {
        val failure =
            assertThrows<AssertionFailedError> {
                TreeChecks.assertContract(
                    JsonObject.of(
                        "threads" to JsonNumber.of(5),
                    ),
                    "here",
                )
            }
        assertTrue("bad-tree" in failure.message!!, failure.message)
        val extra =
            assertThrows<AssertionFailedError> {
                TreeChecks.assertContract(
                    Trees.oneExtraKeyEach().first().second,
                    "here",
                )
            }
        assertTrue("unknown-key" in extra.message!!, extra.message)
    }
}
