package dev.ukitomato.closta.providers.claude.synthetic

import com.google.gson.JsonObject
import kotlin.random.Random

/** One turn of a made-up session: the user's words (the host shows them; the CLI does not echo them) and stdout. */
data class SyntheticTurn(
    val prompt: String,
    val lines: List<String>,
)

/**
 * A made-up session in the shape of the user's largest recorded one (counted from `~/.claude/projects` without
 * reading what was said, 2026-11-03): its turns, tool calls (sub-agents' included), sub-agents, Skill and MCP calls,
 * and the length of its replies. Nothing of the user's own sessions is in it. The history is written the way a resumed
 * session reads it: finished snapshots, nothing streamed.
 */
object SyntheticSession {
    data class Shape(
        val turns: Int,
        val tools: Int,
        val subagents: Int,
        val skills: Int,
        val mcp: Int,
        val totalText: Int,
        val longestText: Int,
    )

    val LARGEST =
        Shape(
            turns = 200,
            tools = 2_000,
            subagents = 150,
            skills = 70,
            mcp = 13,
            totalText = 170_000,
            longestText = 7_500,
        )

    private const val NESTED_TOOLS = 4
    private const val SUBAGENT_TEXT = 200
    private const val INTERLEAVED_TEXT = 120
    private const val INTERLEAVED_EVERY = 4
    private const val LONG_EVERY = 40
    private const val RESULT_TEXT = 400

    private val PLAIN_TOOLS = listOf("Read", "Grep", "Edit", "Bash", "Glob", "Read", "Edit", "Write")

    @Suppress("LongMethod") // the session, written out turn by turn
    fun turns(
        shape: Shape = LARGEST,
        seed: Long = 1,
    ): List<SyntheticTurn> {
        val random = Random(seed)
        val writer = MarkdownWriter(random)
        val topLevel = shape.tools - shape.subagents * NESTED_TOOLS
        val kinds = toolKinds(shape, topLevel, random)
        val interleaved = (0 until topLevel).count { it % INTERLEAVED_EVERY == 0 }
        val longTurns = (LONG_EVERY until shape.turns step LONG_EVERY).toSet()
        val budget =
            shape.totalText - shape.subagents * SUBAGENT_TEXT - interleaved * INTERLEAVED_TEXT -
                longTurns.size * shape.longestText
        val finalLength = budget / (shape.turns - longTurns.size)

        var call = 0
        var message = 0
        return (0 until shape.turns).map { turn ->
            val script = StreamScript("synthetic")
            val command = "cmd-$turn"
            script.lifecycle(command, "queued")
            script.lifecycle(command, "started")
            if (turn == 0) script.init()
            val count = topLevel / shape.turns + if (turn < topLevel % shape.turns) 1 else 0
            repeat(count) {
                val id = "toolu_$call"
                val kind = kinds[call]
                val blocks = mutableListOf<JsonObject>()
                if (call % INTERLEAVED_EVERY == 0) blocks += StreamScript.text(writer.paragraph(INTERLEAVED_TEXT))
                blocks += StreamScript.toolUse(id, kind, inputFor(kind, call))
                script.assistant("msg_${message++}", blocks)
                if (kind == "Task") {
                    repeat(NESTED_TOOLS) { nested ->
                        val nestedId = "${id}_n$nested"
                        val nestedKind = PLAIN_TOOLS[nested % PLAIN_TOOLS.size]
                        script.assistant(
                            "msg_${message++}",
                            listOf(
                                StreamScript.toolUse(
                                    nestedId,
                                    nestedKind,
                                    inputFor(
                                        nestedKind,
                                        call * NESTED_IDS + nested,
                                    ),
                                ),
                            ),
                            parent = id,
                        )
                        script.toolResult(nestedId, writer.result(RESULT_TEXT), parent = id)
                    }
                    script.assistant(
                        "msg_${message++}",
                        listOf(StreamScript.text(writer.paragraph(SUBAGENT_TEXT))),
                        parent = id,
                    )
                }
                script.toolResult(id, writer.result(RESULT_TEXT))
                call++
            }
            val length = if (turn in longTurns) shape.longestText else finalLength
            val reply = writer.reply(length)
            script.assistant("msg_${message++}", listOf(StreamScript.text(reply)))
            script.result(reply)
            script.lifecycle(command, "completed")
            SyntheticTurn("Request ${turn + 1}: ${writer.paragraph(PROMPT_LENGTH)}", script.lines)
        }
    }

    private const val PROMPT_LENGTH = 80
    private const val NESTED_IDS = 10
    private const val WRITE_LINES = 12

    private fun toolKinds(
        shape: Shape,
        topLevel: Int,
        random: Random,
    ): List<String> {
        val special =
            List(shape.subagents) { "Task" } + List(shape.skills) { "Skill" } + List(shape.mcp) { "mcp__jira__search" }
        val plain = List(topLevel - special.size) { PLAIN_TOOLS[it % PLAIN_TOOLS.size] }
        return (special + plain).shuffled(random)
    }

    private fun inputFor(
        kind: String,
        n: Int,
    ): JsonObject =
        JsonObject().apply {
            when (kind) {
                "Read", "Write", "Edit" -> {
                    addProperty("file_path", "/repo/module$n/src/main/kotlin/Service$n.kt")
                    if (kind == "Edit") {
                        addProperty("old_string", "fun call$n() =\n    old()")
                        addProperty("new_string", "fun call$n() =\n    retry {\n        new()\n    }")
                    }
                    if (kind == "Write") addProperty("content", (1..WRITE_LINES).joinToString("\n") { "line $it" })
                }
                "Bash" -> addProperty("command", "./gradlew :module$n:test --tests '*Service${n}Test'")
                "Grep", "Glob" -> addProperty("pattern", "Service$n")
                "Task" -> {
                    addProperty("description", "Investigate module $n")
                    addProperty("prompt", "Look into module $n and report what calls Service$n.")
                }
                "Skill" -> addProperty("skill", "review-$n")
                else -> addProperty("query", "PROJ-$n")
            }
        }

    /** Markdown of a given length, drawn from a few kinds of block, in English. */
    private class MarkdownWriter(
        private val random: Random,
    ) {
        private val sentences =
            listOf(
                "The change is kept to two places: `AuthService` and `RetryPolicy`.",
                "The retry only counts network failures; anything the server says is returned at once.",
                "The tests run on virtual time, so no wait is really waited.",
                "Callers on the EDT now go through a coroutine, so the UI no longer blocks.",
                "There are three existing callers, and none of them changes behaviour.",
                "This keeps the log free of user names and URLs.",
            )

        fun paragraph(length: Int): String {
            val text = StringBuilder()
            while (text.length < length) text.append(sentences[random.nextInt(sentences.size)]).append(' ')
            return text.substring(0, length).trimEnd()
        }

        fun result(length: Int): String = paragraph(length)

        fun reply(length: Int): String {
            val text = StringBuilder()
            var section = 1
            while (true) {
                val block = block(section++)
                if (text.length + block.length > length) break
                text.append(block)
            }
            val rest = length - text.length
            if (rest > 0) text.append(paragraph(rest).padEnd(rest, '.'))
            return text.toString()
        }

        private fun block(section: Int): String =
            when (random.nextInt(BLOCK_KINDS)) {
                0 -> "## Change $section\n\n"
                1 -> paragraph(PARAGRAPH) + "\n\n"
                2 -> (1..LIST_ITEMS).joinToString("") { "- ${paragraph(ITEM)}\n" } + "\n"
                CODE ->
                    "```kotlin\n" + (1..CODE_LINES).joinToString("\n") { "val value$it = compute($it) // $section" } +
                        "\n```\n\n"
                else ->
                    "| Item | Before | After | Notes |\n|---|---|---|---|\n" +
                        (1..TABLE_ROWS).joinToString(
                            "",
                        ) { "| item$it | ${it + it} | ${it + it + it} | ${paragraph(ITEM)} |\n" } +
                        "\n"
            }

        private companion object {
            const val BLOCK_KINDS = 5
            const val CODE = 3
            const val PARAGRAPH = 180
            const val ITEM = 40
            const val LIST_ITEMS = 4
            const val CODE_LINES = 8
            const val TABLE_ROWS = 4
        }
    }
}
