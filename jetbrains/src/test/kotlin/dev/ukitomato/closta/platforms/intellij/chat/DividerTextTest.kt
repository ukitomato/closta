package dev.ukitomato.closta.platforms.intellij.chat

import dev.ukitomato.closta.presenter.view.Divider
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.util.Locale

class DividerTextTest {
    private val saved = Locale.getDefault()

    @BeforeEach
    fun english() = Locale.setDefault(Locale.ENGLISH)

    @AfterEach
    fun restore() = Locale.setDefault(saved)

    @Test
    fun `a compaction says both counts in short form`() {
        assertEquals(
            "Conversation compacted (21.8k → 3.4k tokens)",
            dividerText(Divider.Compacted("manual", 21819, 3447, failed = false)),
        )
    }

    @Test
    fun `an automatic one says so after the words`() {
        assertEquals(
            "Conversation compacted (21.8k → 3.4k tokens) (auto)",
            dividerText(Divider.Compacted("auto", 21819, 3447, failed = false)),
        )
    }

    @Test
    fun `in Japanese the auto mark follows the words with no space`() {
        assertEquals(
            "Conversation compacted (21.8k \u2192 3.4k tokens)(auto)",
            compactedText(Divider.Compacted("auto", 21819, 3447, failed = false), japanese = true),
        )
    }

    @Test
    fun `with no count after, only the one before is said`() {
        assertEquals(
            "Conversation compacted (950 tokens before)",
            dividerText(Divider.Compacted("manual", 950, null, failed = false)),
        )
    }

    @Test
    fun `a failure says so and nothing of counts`() {
        assertEquals("Compacting failed", dividerText(Divider.Compacted("unknown", 0, null, failed = true)))
    }
}
