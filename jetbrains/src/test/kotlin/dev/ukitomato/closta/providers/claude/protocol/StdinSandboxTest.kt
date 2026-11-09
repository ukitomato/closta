package dev.ukitomato.closta.providers.claude.protocol

import com.google.gson.JsonObject
import com.google.gson.JsonParser
import dev.ukitomato.closta.providers.claude.fixtures.CaptureFixtures
import org.junit.jupiter.api.Assertions.assertAll
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Test

/**
 * The write direction for turning the sandbox off mid-session. Capture 33 kept no stdin lines, so the request is
 * held to what the CLI made of it: the answer, and the flag layer `get_settings` reported right after.
 */
class StdinSandboxTest {
    private fun captureLine(number: Int): JsonObject =
        JsonParser
            .parseString(CaptureFixtures.nonBlankLines(CaptureFixtures.textOf("$CAPTURE.ndjson"))[number - 1])
            .asJsonObject

    @Test
    fun sandboxOffSendsOnlyEnabledFalse() {
        val request = JsonParser.parseString(StdinEncoder.sandboxOff("r1")).asJsonObject["request"].asJsonObject
        assertEquals("apply_flag_settings", request["subtype"].asString)
        assertEquals("""{"sandbox":{"enabled":false}}""", request["settings"].toString())
    }

    @Test
    fun sandboxOffAnswerMatchesCapture33() {
        // 33 line 79 answers the request that turned the sandbox off (req-5); line 80 is the get_settings after it.
        val written = JsonParser.parseString(StdinEncoder.sandboxOff("$CAPTURE-req-5")).asJsonObject
        val answer = captureLine(79)["response"].asJsonObject
        val settings = captureLine(80)["response"].asJsonObject["response"].asJsonObject
        val flagLayer =
            settings["sources"].asJsonArray.map { it.asJsonObject }.single { it["source"].asString == "flagSettings" }

        assertAll(
            { assertEquals("control_request", written["type"].asString) },
            { assertEquals("$CAPTURE-req-5", written["request_id"].asString) },
            { assertEquals("$CAPTURE-req-5", answer["request_id"].asString) },
            { assertEquals("success", answer["subtype"].asString) },
            { assertFalse(answer.has("response"), "a success without a body") },
            // The flag layer is replaced by what was sent, so it holds exactly the request's settings.
            { assertEquals(written["request"].asJsonObject["settings"], flagLayer["settings"]) },
            { assertEquals("""{"enabled":false}""", settings["effective"].asJsonObject["sandbox"].toString()) },
        )
    }

    private companion object {
        const val CAPTURE = "33-sandbox-live"
    }
}
