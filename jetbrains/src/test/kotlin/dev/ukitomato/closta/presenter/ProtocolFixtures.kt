package dev.ukitomato.closta.presenter

import dev.ukitomato.closta.presenter.tree.JsonArray
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonRead
import dev.ukitomato.closta.presenter.tree.JsonString
import java.io.File

/**
 * The protocol's contract fixtures, read from `src/test/protocol-fixtures`. The build passes the
 * directory as `protocolFixtures.dir` and declares it an input of the test task, so a change to a fixture
 * re-runs these tests. They are read with the presenter's own reader, which keeps `__proto__` as an own key
 * the way `JSON.parse` does and reads the fixture nested past the tree's limit.
 */
object ProtocolFixtures {
    private const val PROPERTY = "protocolFixtures.dir"

    /** The fixture file [name], which may not exist yet (a generated one is written there). */
    fun file(name: String): File {
        val dir =
            checkNotNull(System.getProperty(PROPERTY)) {
                "`$PROPERTY` is not set — run the tests through Gradle (jetbrains/build.gradle.kts passes it)"
            }
        return File(dir, name)
    }

    fun cases(name: String): List<JsonObject> {
        val file = file(name)
        check(file.isFile) {
            "the contract fixture `$file` is missing: these tests need src/test/protocol-fixtures"
        }
        val parsed = JsonRead.parse(file.readText(Charsets.UTF_8)) as? JsonObject
        val root = checkNotNull(parsed) { "`$file` is not a JSON object" }
        val cases = checkNotNull(root["cases"] as? JsonArray) { "`$file` has no cases" }
        return cases.items.map { it as JsonObject }
    }

    /** The object the fixture [name] holds under [key], beside its cases. */
    fun obj(
        name: String,
        key: String,
    ): JsonObject {
        val file = file(name)
        check(file.isFile) { "the contract fixture `$file` is missing: these tests need src/test/protocol-fixtures" }
        val parsed = JsonRead.parse(file.readText(Charsets.UTF_8)) as? JsonObject
        val root = checkNotNull(parsed) { "`$file` is not a JSON object" }
        return checkNotNull(root[key] as? JsonObject) { "`$file` has no `$key`" }
    }

    /** The list of strings the fixture [name] holds under [key], beside its cases. */
    fun strings(
        name: String,
        key: String,
    ): List<String> {
        val file = file(name)
        check(file.isFile) { "the contract fixture `$file` is missing: these tests need src/test/protocol-fixtures" }
        val parsed = JsonRead.parse(file.readText(Charsets.UTF_8)) as? JsonObject
        val root = checkNotNull(parsed) { "`$file` is not a JSON object" }
        val list = checkNotNull(root[key] as? JsonArray) { "`$file` has no `$key`" }
        return list.items.map { checkNotNull((it as? JsonString)?.value) { "`$key` of `$file` holds a non-string" } }
    }
}
