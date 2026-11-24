package dev.ukitomato.closta.providers.claude.history

import com.google.gson.GsonBuilder
import com.google.gson.JsonArray
import com.google.gson.JsonNull
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.core.models.RawJson
import dev.ukitomato.closta.presenter.view.Goldens
import dev.ukitomato.closta.providers.claude.fixtures.CaptureFixtures
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.TestFactory
import org.junit.jupiter.api.io.TempDir
import java.io.File
import java.nio.file.Files
import java.nio.file.Path

/**
 * Holds what the reader gives for the saved records of captures 22, 27 and 39 to goldens: every field of every
 * event, the counts, and the listing, as the Rust reader is held to the same files by value. The place is made
 * as [CapturedTranscript] makes it. `updatedAtMs` is left out: it is the time the file was put down.
 *
 * Regenerate with `HISTORY_GOLDEN_UPDATE=true` in the environment; that run fails once it has rewritten a golden.
 */
class RecordGoldenTest {
    @TempDir
    lateinit var config: Path

    private val goldens =
        Goldens(
            update = System.getenv(ENV) == "true",
            read = { name -> resource("$GOLDEN_DIR/$name.json") },
            write = ::writeGolden,
            env = ENV,
            how = "regenerate with `$ENV=true ./gradlew test --tests '*RecordGoldenTest'`, then run again",
        )

    @TestFactory
    fun `each saved record reads to its golden`(): List<DynamicTest> =
        CAPTURES.map { capture ->
            DynamicTest.dynamicTest(capture) {
                val (name, _) = checkNotNull(CaptureFixtures.manifestTranscript("$capture.ndjson"))
                val bytes = CaptureFixtures.bytesOf(name)
                val sessionId = sessionIdOf(bytes)
                val directory = "/work/the project"
                val place = config.resolve(capture).resolve("projects").resolve(ProjectTranscripts.nameOf(directory))
                Files.createDirectories(place)
                Files.write(place.resolve("$sessionId.jsonl"), bytes)
                val reader =
                    ProjectTranscripts(
                        { config.resolve(capture) },
                        directory,
                        Dispatchers.Unconfined,
                        resolveLinks = false,
                    )
                val read = runBlocking { reader.read(sessionId) }
                val list = runBlocking { reader.list() }
                assertEquals(1, list.size, "$capture: one record is listed")
                if (capture == "22-resume") {
                    assertEquals(
                        listOf("User", "Assistant", "Assistant", "User", "Assistant"),
                        read.events.map { it::class.simpleName },
                    )
                    assertEquals(22, read.skipped)
                    assertEquals(0, read.dropped)
                }
                val root =
                    JsonObject().apply {
                        addProperty("capture", capture)
                        addProperty("sessionId", sessionId)
                        add(
                            "read",
                            JsonObject().apply {
                                add("events", JsonArray().also { a -> read.events.forEach { a.add(eventJson(it)) } })
                                addProperty("skipped", read.skipped)
                                addProperty("dropped", read.dropped)
                            },
                        )
                        add(
                            "list",
                            JsonArray().also { a ->
                                list.forEach {
                                    a.add(
                                        JsonObject().apply {
                                            addProperty("id", it.id)
                                            addProperty("title", it.title)
                                            addProperty("bytes", it.bytes)
                                        },
                                    )
                                }
                            },
                        )
                    }
                goldens.check(capture, GSON.toJson(root) + "\n")
            }
        }

    private companion object {
        const val ENV = "HISTORY_GOLDEN_UPDATE"
        const val GOLDEN_DIR = "dev/ukitomato/closta/providers/claude/history/golden"
        val CAPTURES = listOf("22-resume", "27-resume-session-at", "39-sandbox-resume")
        val GSON =
            GsonBuilder()
                .setPrettyPrinting()
                .serializeNulls()
                .disableHtmlEscaping()
                .create()

        // The first line that has a "sessionId", as CapturedTranscript takes it.
        fun sessionIdOf(bytes: ByteArray): String {
            val first = String(bytes, Charsets.UTF_8).lineSequence().first { "\"sessionId\"" in it }
            return JsonParser
                .parseString(first)
                .asJsonObject
                .get("sessionId")
                .asString
        }

        fun eventJson(event: AgentEvent): JsonObject =
            JsonObject().apply {
                when (event) {
                    is AgentEvent.User -> {
                        addProperty("kind", "User")
                        addProperty("uuid", event.uuid)
                        addProperty("sessionId", event.sessionId)
                        addProperty("timestamp", event.timestamp)
                        add("message", raw(event.message))
                        text("parentToolUseId", event.parentToolUseId)
                        add("toolUseResult", raw(event.toolUseResult))
                        text("subagentType", event.subagentType)
                        text("taskDescription", event.taskDescription)
                    }
                    is AgentEvent.Assistant -> {
                        addProperty("kind", "Assistant")
                        addProperty("uuid", event.uuid)
                        addProperty("sessionId", event.sessionId)
                        addProperty("timestamp", event.timestamp)
                        text("requestId", event.requestId)
                        add("message", raw(event.message))
                        text("parentToolUseId", event.parentToolUseId)
                        text("userMessageUuid", event.userMessageUuid)
                        add("userMessageUuids", raw(event.userMessageUuids))
                        add("wireToolInputs", raw(event.wireToolInputs))
                        text("subagentType", event.subagentType)
                        text("taskDescription", event.taskDescription)
                        text("error", event.error)
                    }
                    else -> error("the reader gave an event that is neither a user nor an assistant line")
                }
            }

        fun JsonObject.text(
            name: String,
            value: String?,
        ) = if (value == null) add(name, JsonNull.INSTANCE) else addProperty(name, value)

        fun raw(value: RawJson?) = if (value == null) JsonNull.INSTANCE else JsonParser.parseString(value.text)

        fun writeGolden(
            name: String,
            text: String,
        ) = File("src/test/resources/$GOLDEN_DIR").apply { mkdirs() }.resolve("$name.json").writeText(text)

        fun resource(path: String): String? =
            RecordGoldenTest::class.java.classLoader
                .getResourceAsStream(path)
                ?.use { String(it.readBytes(), Charsets.UTF_8) }
    }
}
