package dev.ukitomato.closta.presenter.diff

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.io.File

/**
 * Keeps the differ the only place in `src/main` that writes an op: outside `presenter/diff/`, no source holds an
 * op's type string as a literal — in double quotes, escaped inside another string (`\"set\"`, JSON written by hand)
 * or in single quotes (a script's constant) — or calls an op's or a diff's constructor. An op written by hand beside
 * the domain code can be left out while the state is right, and nothing that looks at the state shows why ([Op]).
 * The host's stream (`presenter/stream/`) holds and forwards the differ's ops and names the type [Op] to do so; it
 * builds none.
 *
 * The same holds one level up: outside `presenter/stream/`, nothing builds a `Snapshot` or a `Patch`. Only the
 * stream's cursor makes them follow the protocol's rules — a snapshot only in answer to ready or resync or for a new
 * epoch, a patch only at the next seq.
 *
 * It also keeps the direction inside presenter, which checkLayers sees as one layer: each package imports only what
 * it builds on, and names nothing else in full — `presenter/tree/` nothing of the plugin; `presenter/view/` the tree
 * and `core.models`; `presenter/diff/` the tree; `presenter/stream/` the tree and the differ. So the tree cannot
 * import what is built on it, and the projection, the differ and the stream stay apart.
 *
 * This reads the source text, not the types: each file whole, so a call the formatter broke over lines is found as
 * well as one on a line. An op type spelled any other way — built from parts, or through a type alias — gets past
 * it; review covers those. It does not tell code that writes from code that reads, or from comments, which keeps
 * the rule plain.
 */
class OnlyTheDifferWritesOpsTest {
    private val forbidden =
        listOf(
            Regex("\"set\""),
            Regex("\"append-text\""),
            Regex("""\\"(set|append-text)\\""""),
            Regex("""'(set|append-text)'"""),
            Regex("""\bDiff\s*\.\s*Ops\s*\("""),
            Regex("""\bOp\s*\.\s*(Set|AppendText)\s*\("""),
            Regex("""(?<![\w.])(Set|AppendText)\s*\("""),
            Regex("""::\s*(Set|AppendText)\b"""),
            Regex("""import\s+[\w.]*\.presenter\.diff\.Op\.(Set|AppendText)\b"""),
        )

    // Building a snapshot or a patch: a call of the constructor, or a reference to it.
    private val treeMessages =
        listOf(
            Regex("""(?<!\w)(Snapshot|Patch)\s*\("""),
            Regex("""::\s*(Snapshot|Patch)\b"""),
        )

    // A name of the plugin written in full, other than of the packages each one builds on (and its own).
    private val plugin = Regex("""closta\s*\.\s*(?!presenter\s*\.\s*(tree|diff)\b)""")
    private val pluginInStream = Regex("""closta\s*\.\s*(?!presenter\s*\.\s*(tree|diff|stream)\b)""")
    private val pluginInTree = Regex("""closta\s*\.\s*(?!presenter\s*\.\s*tree\b)""")
    private val pluginInView =
        Regex("""closta\s*\.\s*(?!presenter\s*\.\s*(tree|view)\b|core\s*\.\s*models\b)""")

    // A class named through its package (`a.b.C`): the package must be one an import may name too.
    private val qualified = Regex("""(?<![\w.])([a-z]\w*(?:\s*\.\s*[a-z]\w*)+)\s*\.\s*[A-Z]""")

    private val howToFix =
        "ops are written only by presenter/diff. This reads all of src/main as text and does not tell writing from " +
            "reading or from comments. To change what the webview shows, change the tree and let structuralDiff " +
            "write the ops; to tell ops apart, use `is Op.Set` / `is Op.AppendText`; to send them, forward " +
            "diff.ops as presenter/stream does. Where the word means something else, or sits in a comment, word " +
            "it otherwise. Only code that writes ops belongs in presenter/diff."

    /** What a scan of a source root saw: the files it read, and each place that writes an op, in the differ or not. */
    private class Scan(
        val files: List<String>,
        val inDiffer: List<String>,
        val outside: List<String>,
    )

    private fun kotlinFiles(dir: File): List<File> =
        dir.walkTopDown().filter { it.isFile && it.extension == "kt" }.toList()

    // Each match of [patterns] in the file, as `path:line: the lines it spans`, the line counted from its offset.
    private fun matches(
        file: File,
        root: File,
        patterns: List<Regex>,
    ): List<String> {
        val path = file.relativeTo(root).invariantSeparatorsPath
        val text = file.readText()
        return patterns
            .flatMap { it.findAll(text).toList() }
            .sortedBy { it.range.first }
            .map { match ->
                val line = text.substring(0, match.range.first).count { it == '\n' } + 1
                val start = text.lastIndexOf('\n', match.range.first - 1) + 1
                val end = text.indexOf('\n', match.range.last).let { if (it < 0) text.length else it }
                "$path:$line: ${text.substring(start, end).lines().joinToString(" ") { it.trim() }}"
            }.distinct()
    }

    private fun scan(root: File): Scan {
        val files = kotlinFiles(root)
        val hits = files.flatMap { matches(it, root, forbidden) }
        val (inDiffer, outside) = hits.partition { it.startsWith("presenter/diff/") }
        return Scan(files.map { it.relativeTo(root).invariantSeparatorsPath }, inDiffer, outside)
    }

    /** `src/main/kotlin/…/closta`, found from wherever the tests run (Gradle runs them in `jetbrains/`). */
    private fun mainRoot(): File {
        val relative = "src/main/kotlin/dev/ukitomato/closta"
        val start = File("").absoluteFile
        val found =
            generateSequence(start) { it.parentFile }
                .flatMap { sequenceOf(File(it, relative), File(it, "jetbrains/$relative")) }
                .firstOrNull { File(it, "presenter/diff/StructuralDiff.kt").isFile }
        return checkNotNull(found) { "no jetbrains/$relative above $start" }
    }

    private fun plant(
        root: File,
        path: String,
        vararg lines: String,
    ) {
        File(root, path).apply { parentFile.mkdirs() }.writeText(lines.joinToString("\n"))
    }

    @Test
    fun `no source outside presenter-diff writes an op type or builds an op`() {
        val scan = scan(mainRoot())
        // The scan read every layer and found the differ's own op writes, so a root or a filter that went wrong
        // cannot pass on nothing.
        assertTrue(scan.files.size >= MIN_SOURCES, "only ${scan.files.size} sources")
        assertEquals(
            setOf("core", "presenter", "providers", "platforms"),
            scan.files.map { it.substringBefore('/') }.toSet(),
        )
        assertTrue(scan.inDiffer.size >= MIN_IN_DIFFER, "the differ's own op writes: ${scan.inDiffer}")
        assertEquals(emptyList<String>(), scan.outside, howToFix)
    }

    @Test
    fun `a planted op write is found anywhere outside the differ, and only there`(
        @TempDir root: File,
    ) {
        plant(root, "presenter/diff/Op.kt", """fun toJson() = wire("set", value)""")
        plant(
            root,
            "presenter/view/Planted.kt",
            "val keys = LinkedHashSet<String>()",
            """put("type", JsonString("append-text"))""",
        )
        plant(root, "presenter/differ/Planted.kt", """val op = Op.Set(listOf("threads"), value)""")
        plant(root, "core/models/Planted.kt", """// the "set" kind""")
        plant(root, "platforms/Planted.kts", """val type = "set"""")
        // The way the formatter breaks a long call: the receiver, then the call on the next line.
        plant(
            root,
            "presenter/view/Wrapped.kt",
            "internal fun planted(): Any =",
            "    Op",
            """        .Set(listOf("threads"), JsonNull)""",
        )
        plant(root, "presenter/view/WrappedAppend.kt", "", "val op = Op", """    .AppendText(path, "x")""")
        val scan = scan(root)
        assertEquals(listOf("presenter/diff/Op.kt:1: fun toJson() = wire(\"set\", value)"), scan.inDiffer)
        assertEquals(
            listOf(
                "core/models/Planted.kt:1: // the \"set\" kind",
                "presenter/differ/Planted.kt:1: val op = Op.Set(listOf(\"threads\"), value)",
                "presenter/view/Planted.kt:2: put(\"type\", JsonString(\"append-text\"))",
                "presenter/view/Wrapped.kt:2: Op .Set(listOf(\"threads\"), JsonNull)",
                "presenter/view/WrappedAppend.kt:2: val op = Op .AppendText(path, \"x\")",
            ),
            scan.outside.sorted(),
        )
    }

    @Test
    fun `the patterns catch each way of writing an op and leave lookalikes alone`() {
        val caught =
            listOf(
                """val type = JsonString("set")""",
                """put("type", JsonString("append-text"))""",
                """val op = Op.Set(listOf("threads"), value)""",
                """dev.ukitomato.closta.presenter.diff.Op.AppendText(path, "x")""",
                """ops.add(Set(path, value))""",
                """ops += AppendText (path, text)""",
                """paths.map(Op::Set)""",
                """import dev.ukitomato.closta.presenter.diff.Op.AppendText""",
                "Op\n    .Set(path, value)",
                "Op .\n AppendText(path, text)",
                """val json = "{\"type\":\"set\",\"path\":[\"x\"]}"""",
                """const OP = 'append-text'""",
                """if (op.type === 'set') apply(op)""",
                """Diff.Ops(listOf())""",
                "Diff\n    .Ops(ops)",
            )
        for (text in caught) assertTrue(forbidden.any { it.containsMatchIn(text) }, text)
        val fine =
            listOf(
                """val keys = LinkedHashSet<String>()""",
                """val all: Set<String> = setOf("a")""",
                """is Op.Set -> op.value""",
                """// the settings""",
                """val name = "settled"""",
                """emptySet()""",
                """Collections.unmodifiableSet(keys)""",
                """is Diff.Ops -> diff.ops""",
                """fun forward(diff: Diff.Ops) = diff.ops""",
                """val json = "{\"type\":\"settled\"}"""",
                """val quoted = 'settings'""",
            )
        for (text in fine) assertTrue(forbidden.none { it.containsMatchIn(text) }, text)
    }

    /** What a package of `src/main` may name: the prefixes of its imports, and the packages it may name in full. */
    private class Allowed(
        val dir: String,
        val imports: List<String>,
        val plugin: Regex,
    ) {
        // The packages a class may be named through in full: its own, and those of the imports.
        val packages: List<String> = imports.map { it.removeSuffix(".") } + "$PLUGIN.${dir.replace('/', '.')}"
    }

    private val differ = Allowed("presenter/diff", allowedImports, plugin)
    private val stream = Allowed("presenter/stream", streamImports, pluginInStream)
    private val tree = Allowed("presenter/tree", treeImports, pluginInTree)
    private val view = Allowed("presenter/view", viewImports, pluginInView)

    /** Each import in [allowed]'s package under [root] that it may not make. */
    private fun foreignImports(
        root: File,
        allowed: Allowed,
    ): Pair<Int, List<String>> {
        val files = kotlinFiles(File(root, allowed.dir))
        val foreign =
            files.flatMap { file ->
                file
                    .readLines()
                    .map(String::trim)
                    .filter { it.startsWith("import ") }
                    .filterNot { line -> allowed.imports.any { line.removePrefix("import ").startsWith(it) } }
                    .map { "${file.name}: $it" }
            }
        return files.size to foreign
    }

    /**
     * Each place in [allowed]'s package under [root] that names, in full, what it may not import: a package of the
     * plugin other than its own and the ones it builds on, or a class of any other package outside its imports.
     */
    private fun foreignNames(
        root: File,
        allowed: Allowed,
    ): List<String> =
        kotlinFiles(File(root, allowed.dir)).flatMap { file ->
            val classNames =
                matches(file, root, listOf(qualified)).filter { hit ->
                    val packages =
                        qualified.findAll(hit.substringAfter(": ")).map { it.groupValues[1].replace(space, "") }
                    packages.any { name -> allowed.packages.none { name == it || name.startsWith("$it.") } }
                }
            (matches(file, root, listOf(allowed.plugin)) + classNames).distinct().sortedBy {
                it.substringBefore(": ").substringAfterLast(':').toInt()
            }
        }

    private val space = Regex("\\s")

    // The directories and the loose sources of presenter that no list above covers: those would be read by nothing.
    private fun unlistedPackages(root: File): List<String> {
        val listed = listOf(tree, view, differ, stream).map { it.dir }.toSet()
        val presenter = File(root, "presenter")
        val dirs = presenter.listFiles { file -> file.isDirectory }.orEmpty().map { "presenter/${it.name}" }
        val loose = presenter.listFiles { file -> file.isFile && file.extension == "kt" }.orEmpty()
        return (dirs.filter { it !in listed } + loose.map { "presenter/${it.name}" }).sorted()
    }

    @Test
    fun `each package of presenter imports and names only what it builds on`() {
        // checkLayers sees presenter as one layer; the direction inside it is a rule of its own, so it is read here.
        val packages =
            listOf(
                tree to MIN_TREE_FILES,
                view to MIN_VIEW_FILES,
                differ to MIN_DIFFER_FILES,
                stream to MIN_STREAM_FILES,
            )
        assertEquals(
            emptyList<String>(),
            unlistedPackages(mainRoot()),
            "a new package of presenter needs its own list of what it may import, beside the four here",
        )
        for ((allowed, least) in packages) {
            val (files, foreign) = foreignImports(mainRoot(), allowed)
            assertTrue(files >= least, "only $files sources in ${allowed.dir}")
            assertEquals(emptyList<String>(), foreign, "${allowed.dir} imports only ${allowed.imports}")
            assertEquals(
                emptyList<String>(),
                foreignNames(mainRoot(), allowed),
                "${allowed.dir} names nothing in full that it may not import",
            )
        }
    }

    @Test
    fun `a package or a source of presenter that no list covers is found`(
        @TempDir root: File,
    ) {
        File(root, "presenter/extra/Planted.kt").apply { parentFile.mkdirs() }.writeText("package planted\n")
        File(root, "presenter/tree").mkdirs()
        File(root, "presenter/Loose.kt").writeText("package planted\n")
        File(root, "presenter/.gitkeep").writeText("")
        assertEquals(listOf("presenter/Loose.kt", "presenter/extra"), unlistedPackages(root))
    }

    @Test
    fun `an import of the conversation in the differ or the stream is found`(
        @TempDir root: File,
    ) {
        File(root, "presenter/diff/Planted.kt").apply { parentFile.mkdirs() }.writeText(
            listOf(
                "import dev.ukitomato.closta.presenter.tree.JsonObject",
                "import java.util.Collections",
                "import dev.ukitomato.closta.presenter.view.Transcript",
                "import dev.ukitomato.closta.core.models.ConversationState",
                "import dev.ukitomato.closta.presenter.stream.OpStream",
            ).joinToString("\n"),
        )
        File(root, "presenter/stream/Planted.kt").apply { parentFile.mkdirs() }.writeText(
            listOf(
                "import dev.ukitomato.closta.presenter.diff.Op",
                "import dev.ukitomato.closta.presenter.diff.structuralDiff",
                "import java.util.UUID",
                "import dev.ukitomato.closta.presenter.view.TreeProjector",
                "import com.google.gson.JsonParser",
            ).joinToString("\n"),
        )
        assertEquals(
            1 to
                listOf(
                    "Planted.kt: import dev.ukitomato.closta.presenter.view.Transcript",
                    "Planted.kt: import dev.ukitomato.closta.core.models.ConversationState",
                    "Planted.kt: import dev.ukitomato.closta.presenter.stream.OpStream",
                ),
            foreignImports(root, differ),
        )
        assertEquals(
            1 to
                listOf(
                    "Planted.kt: import dev.ukitomato.closta.presenter.view.TreeProjector",
                    "Planted.kt: import com.google.gson.JsonParser",
                ),
            foreignImports(root, stream),
        )
    }

    @Test
    fun `a name the differ may not import, written out in full, is found`(
        @TempDir root: File,
    ) {
        plant(
            root,
            "presenter/diff/Planted.kt",
            "package dev.ukitomato.closta.presenter.diff",
            """private val key = dev.ukitomato.closta.presenter.view.Keys.ofCliId("x")""",
            "private val none = dev.ukitomato.closta.presenter.tree.JsonNull",
            "private val raw =",
            "    dev.ukitomato.closta",
            "        .core.models.RawJson(\"x\")",
            "// as in dev.ukitomato.closta.platforms.Ide",
            "private val parsed = com.google.gson.JsonParser.parseString(\"{}\")",
            "private val list: java.util.List<String>? = null",
            "private val stream = dev.ukitomato.closta.presenter.stream.OpStream::class",
            "private val other = dev.ukitomato.closta.presenter.differ.Planted::class",
            "private val self = dev.ukitomato.closta.presenter.diff.Op::class",
            // A function named in full has no class name for the package check to see.
            "private val fresh = dev.ukitomato.closta.presenter.view.projectTree(emptyList())",
        )
        plant(
            root,
            "presenter/view/Planted.kt",
            "val raw = dev.ukitomato.closta.core.models.RawJson(\"\")",
        )
        assertEquals(
            listOf(
                "presenter/diff/Planted.kt:2: private val key = dev.ukitomato.closta.presenter.view.Keys" +
                    ".ofCliId(\"x\")",
                "presenter/diff/Planted.kt:5: dev.ukitomato.closta .core.models.RawJson(\"x\")",
                "presenter/diff/Planted.kt:7: // as in dev.ukitomato.closta.platforms.Ide",
                "presenter/diff/Planted.kt:8: private val parsed = com.google.gson.JsonParser.parseString(\"{}\")",
                "presenter/diff/Planted.kt:10: private val stream = " +
                    "dev.ukitomato.closta.presenter.stream.OpStream::class",
                "presenter/diff/Planted.kt:11: private val other = dev.ukitomato.closta.presenter.differ" +
                    ".Planted::class",
                "presenter/diff/Planted.kt:13: private val fresh = " +
                    "dev.ukitomato.closta.presenter.view.projectTree(emptyList())",
            ),
            foreignNames(root, differ),
        )
    }

    @Test
    fun `a name the stream may not import, written out in full, is found`(
        @TempDir root: File,
    ) {
        plant(
            root,
            "presenter/stream/Planted.kt",
            "package dev.ukitomato.closta.presenter.stream",
            "private val op = dev.ukitomato.closta.presenter.diff.Op::class",
            "private val self = dev.ukitomato.closta.presenter.stream.OpStream::class",
            "private val projector = dev.ukitomato.closta.presenter.view.TreeProjector()",
            "private val reader = com.google.gson.stream.JsonReader(java.io.StringReader(\"\"))",
            "private val folded = dev.ukitomato.closta.core.models.fold(state, event)",
        )
        assertEquals(
            listOf(
                "presenter/stream/Planted.kt:4: private val projector = " +
                    "dev.ukitomato.closta.presenter.view.TreeProjector()",
                "presenter/stream/Planted.kt:5: private val reader = com.google.gson.stream.JsonReader(java.io" +
                    ".StringReader(\"\"))",
                "presenter/stream/Planted.kt:6: private val folded = " +
                    "dev.ukitomato.closta.core.models.fold(state, event)",
            ),
            foreignNames(root, stream),
        )
    }

    @Test
    fun `the stream may hold and forward ops, and building one there is found`(
        @TempDir root: File,
    ) {
        plant(
            root,
            "presenter/stream/Forwards.kt",
            "import dev.ukitomato.closta.presenter.diff.Op",
            "fun forward(diff: Diff.Ops): Patch = Patch(cursor, diff.ops)",
            "fun wire(ops: List<Op>) = JsonArray(ops.map(Op::toJson))",
            "fun kind(op: Op) = when (op) { is Op.Set -> 1; is Op.AppendText -> 2 }",
        )
        plant(
            root,
            "presenter/stream/Builds.kt",
            """fun handMade() = Patch(cursor, listOf(Op.Set(listOf("threads"), JsonNull)))""",
            "fun joined(a: Diff.Ops, b: Diff.Ops) = Diff.Ops(a.ops + b.ops)",
            """val escaped = "{\"type\":\"append-text\"}"""",
            "val script = \"op.type === 'set'\"",
        )
        val scan = scan(root)
        assertEquals(
            listOf(
                "presenter/stream/Builds.kt:1: fun handMade() = " +
                    "Patch(cursor, listOf(Op.Set(listOf(\"threads\"), JsonNull)))",
                "presenter/stream/Builds.kt:2: fun joined(a: Diff.Ops, b: Diff.Ops) = Diff.Ops(a.ops + b.ops)",
                "presenter/stream/Builds.kt:3: val escaped = \"{\\\"type\\\":\\\"append-text\\\"}\"",
                "presenter/stream/Builds.kt:4: val script = \"op.type === 'set'\"",
            ),
            scan.outside.sorted(),
        )
    }

    private val messagesHowToFix =
        "snapshots and patches are built only by presenter/stream (OpStream): its cursor is what keeps a snapshot to " +
            "ready, resync and a new epoch, and a patch to the next seq. Ask the stream with next, ready or resync. " +
            "This reads the text: if the match is a comment or another type of the same name, reword it or name the " +
            "type otherwise."

    /** Each place under [root] that builds a snapshot or a patch, in the stream or not. */
    private fun treeMessageBuilds(root: File): Pair<List<String>, List<String>> =
        kotlinFiles(root).flatMap { matches(it, root, treeMessages) }.partition { it.startsWith("presenter/stream/") }

    @Test
    fun `no source outside presenter-stream builds a snapshot or a patch`() {
        val (inStream, outside) = treeMessageBuilds(mainRoot())
        assertTrue(inStream.size >= MIN_IN_STREAM, "the stream's own snapshots and patches: $inStream")
        assertEquals(emptyList<String>(), outside, messagesHowToFix)
    }

    @Test
    fun `a snapshot or a patch built outside the stream is found, and lookalikes are left alone`(
        @TempDir root: File,
    ) {
        plant(root, "presenter/stream/OpStream.kt", "fun ready(): Snapshot = Snapshot(cursor, sent)")
        plant(
            root,
            "platforms/intellij/webview/Planted.kt",
            "val patch = Patch(Cursor(epoch, seq), diff.ops)",
            "val again =",
            "    dev.ukitomato.closta.presenter.stream",
            "        .Snapshot(stream.cursor, tree)",
            "val make = ::Patch",
        )
        plant(
            root,
            "presenter/view/Lookalikes.kt",
            "val state = ConversationSnapshot(messages)",
            "fun takeSnapshot(): Snapshot = stream.ready()",
            "fun applyPatch(patch: Patch) = when (patch) { is Patch -> patch.ops }",
            "val kind = Snapshot::class",
        )
        val (inStream, outside) = treeMessageBuilds(root)
        assertEquals(listOf("presenter/stream/OpStream.kt:1: fun ready(): Snapshot = Snapshot(cursor, sent)"), inStream)
        assertEquals(
            listOf(
                "platforms/intellij/webview/Planted.kt:1: val patch = Patch(Cursor(epoch, seq), diff.ops)",
                "platforms/intellij/webview/Planted.kt:4: .Snapshot(stream.cursor, tree)",
                "platforms/intellij/webview/Planted.kt:5: val make = ::Patch",
            ),
            outside,
        )
    }

    @Test
    fun `an import or a full name the tree or the projection may not use is found`(
        @TempDir root: File,
    ) {
        plant(
            root,
            "presenter/tree/Planted.kt",
            "import java.util.Collections",
            "import com.google.gson.stream.JsonReader",
            "import dev.ukitomato.closta.presenter.diff.Op",
            "private val keys = dev.ukitomato.closta.presenter.view.Keys",
            "private val self = dev.ukitomato.closta.presenter.tree.JsonNull",
            "private val ops = dev.ukitomato.closta.presenter.diff.structuralDiff(a, b)",
        )
        plant(
            root,
            "presenter/view/Planted.kt",
            "import dev.ukitomato.closta.presenter.tree.JsonObject",
            "import dev.ukitomato.closta.core.models.ConversationState",
            "import dev.ukitomato.closta.presenter.stream.OpStream",
            "import dev.ukitomato.closta.core.services.SendMessage",
            "private val sent = dev.ukitomato.closta.presenter.stream.OpStream::class",
            "private val folded = dev.ukitomato.closta.core.models.fold(state, event)",
        )
        assertEquals(
            1 to listOf("Planted.kt: import dev.ukitomato.closta.presenter.diff.Op"),
            foreignImports(root, tree),
        )
        assertEquals(
            listOf(
                "presenter/tree/Planted.kt:3: import dev.ukitomato.closta.presenter.diff.Op",
                "presenter/tree/Planted.kt:4: private val keys = dev.ukitomato.closta.presenter.view.Keys",
                "presenter/tree/Planted.kt:6: private val ops = " +
                    "dev.ukitomato.closta.presenter.diff.structuralDiff(a, b)",
            ),
            foreignNames(root, tree),
            "an import names in full too",
        )
        assertEquals(
            1 to
                listOf(
                    "Planted.kt: import dev.ukitomato.closta.presenter.stream.OpStream",
                    "Planted.kt: import dev.ukitomato.closta.core.services.SendMessage",
                ),
            foreignImports(root, view),
        )
        assertEquals(
            listOf(
                "presenter/view/Planted.kt:3: import dev.ukitomato.closta.presenter.stream.OpStream",
                "presenter/view/Planted.kt:4: import dev.ukitomato.closta.core.services.SendMessage",
                "presenter/view/Planted.kt:5: private val sent = " +
                    "dev.ukitomato.closta.presenter.stream.OpStream::class",
            ),
            foreignNames(root, view),
        )
    }

    private companion object {
        const val MIN_SOURCES = 50
        const val MIN_IN_DIFFER = 6
        const val MIN_DIFFER_FILES = 3
        const val MIN_STREAM_FILES = 2
        const val MIN_TREE_FILES = 4
        const val MIN_VIEW_FILES = 15
        const val MIN_IN_STREAM = 3
        const val PLUGIN = "dev.ukitomato.closta"
        val allowedImports = listOf("dev.ukitomato.closta.presenter.tree.", "java.util.", "kotlin.")
        val streamImports =
            listOf(
                "dev.ukitomato.closta.presenter.tree.",
                "dev.ukitomato.closta.presenter.diff.",
                "java.util.",
                "kotlin.",
            )

        // The JSON values read the CLI's text with Gson; they import nothing of the plugin.
        val treeImports = listOf("com.google.gson.", "java.io.", "java.util.", "kotlin.")

        // The transcript keeps its growing collections in persistent ones.
        val viewImports =
            listOf(
                "dev.ukitomato.closta.presenter.tree.",
                "dev.ukitomato.closta.core.models.",
                "java.time.",
                "java.util.",
                "kotlin.",
                "kotlinx.collections.immutable.",
            )
    }
}
