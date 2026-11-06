package dev.ukitomato.closta.platforms.intellij.bench

import dev.ukitomato.closta.providers.claude.synthetic.ReplayScript

/** The stream-json lines the replay plays: one turn whose reply is the long Markdown in `bench/replay-reply.md`. */
object ReplayLines {
    const val PROMPT = "Retry up to 3 times when login fails"

    fun load(): List<String> {
        val reply =
            checkNotNull(ReplayLines::class.java.getResourceAsStream("/bench/replay-reply.md")) { "no replay reply" }
                .use { it.readBytes().toString(Charsets.UTF_8) }
        return ReplayScript.lines(reply)
    }
}
