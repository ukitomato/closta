import org.gradle.api.artifacts.component.ModuleComponentIdentifier
import org.jetbrains.changelog.Changelog
import org.jetbrains.changelog.markdownToHTML
import org.jetbrains.intellij.platform.gradle.tasks.VerifyPluginTask
import java.io.File

plugins {
    id("org.jetbrains.kotlin.jvm")
    id("org.jetbrains.intellij.platform")
    id("org.jlleitschuh.gradle.ktlint")
    id("io.gitlab.arturbosch.detekt")
    id("org.jetbrains.changelog")
    // FakeAgentSession and the abstract base of the AgentSession contract tests live in testFixtures for src/test.
    // An integrationTest source set is wired up by the first change that really needs a test that starts the IDE.
    `java-test-fixtures`
}

val pluginBasePackage = "dev.ukitomato.closta"

dependencies {
    testImplementation(platform("org.junit:junit-bom:5.14.4"))
    testImplementation("org.junit.jupiter:junit-jupiter")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")

    // The AgentSessionContract base lives in testFixtures and carries @Test methods that the
    // src/test subclasses inherit, so testFixtures needs the JUnit 5 API at compile time.
    // JUnit is already a declared project dependency (above); this is not a coroutines/IDE-borrowed one.
    testFixturesImplementation(platform("org.junit:junit-bom:5.14.4"))
    testFixturesImplementation("org.junit.jupiter:junit-jupiter-api")

    // Main scope, and deliberately declared rather than borrowed from the IDE distribution:
    // the production stream-json codec (providers/claude/protocol) parses NDJSON lines into
    // AgentEvent and serialises stdin control messages. Reaching into the platform's bundled Gson
    // would make providers/ depend on the internal layout of ideaIU (lib/util-8.jar) with nothing
    // to warn us when it moves.
    implementation("com.google.code.gson:gson:2.11.0")

    // Main scope, declared not borrowed: Bedrock MFA credentials are resolved with the AWS SDK's STS
    // GetSessionToken (providers/claude/auth), so no `aws` binary or ~/.aws is required. `sts` pulls in
    // auth/regions/sdk-core; `url-connection-client` is the lightweight HTTP client (no extra stack).
    // Version pinned to 2.30.0. This is not com.intellij, so the providers/ layer rule is not violated.
    // Declared directly (not left to sts's transitive graph) because providers/claude/auth imports from
    // auth (AwsBasicCredentials/StaticCredentialsProvider) and regions (Region) — a direct import wants a
    // direct dependency, so a future change to sts's transitive set cannot silently break compilation.
    // netty-nio-client is sts's default async HTTP client and drags a whole io.netty stack into the plugin's lib/.
    // The IDE ships its own netty; with a second copy on the plugin classpath the class loaders collide
    // (LinkageError: loader constraint violation) wherever plugin code meets the IDE's netty types.
    // STS goes through url-connection-client below, so nothing here needs the netty client.
    implementation("software.amazon.awssdk:sts:2.30.0") {
        exclude(group = "software.amazon.awssdk", module = "netty-nio-client")
    }
    implementation("software.amazon.awssdk:auth:2.30.0")
    implementation("software.amazon.awssdk:regions:2.30.0")
    implementation("software.amazon.awssdk:url-connection-client:2.30.0")

    // Main scope, packed into the plugin like the AWS SDK: the transcript fold keeps its growing collections in
    // persistent ones, so a line costs the same at any length of the conversation. Not com.intellij, so presenter
    // may use it.
    implementation("org.jetbrains.kotlinx:kotlinx-collections-immutable:0.5.2")

    // IntelliJ Platform Gradle Plugin Dependencies Extension.
    // Two suites, two tasks. `src/test` is the fast one: IntelliJ-free (layer rule 4) so
    // `./gradlew test` needs no IDE and stays in `check`. Tests that must start an IDE belong in
    // `src/integrationTest` with testFramework(TestFrameworkType.Platform), behind its own
    // `integrationTest` task that `check` does NOT depend on — a change that leaves platforms/
    // alone should not pay for an IDE launch. The first change that needs such a test wires it up; until then
    // the IDE side is checked with runIde and static scans.
    intellijPlatform {
        intellijIdea("2026.2.4")
        // commonmark (with GFM tables) through Jewel's Markdown modules, as the IDE bundles them: nothing is packed.
        bundledModule("intellij.platform.jewel.markdown.core")
        bundledModule("intellij.platform.jewel.markdown.extensions.gfmTables")
        // The changes of a turn are shown as VCS changes in the IDE's combined diff.
        bundledModule("intellij.platform.vcs.impl")
        // Signing in opens the IDE's terminal: `claude auth login` needs a terminal of its own.
        bundledPlugin("org.jetbrains.plugins.terminal")
        bundledModule("intellij.terminal.frontend")
    }
}

kotlin {
    jvmToolchain(21)
}

// --- Protocol fixtures on the test classpath ------------------------------------------------------
// The recorded stream-json captures live next to the provider they describe, under src/main/kotlin.
// Tests read them from the classpath rather than by relative path, because a relative path resolves
// against the working directory and that differs between Gradle and a run from the IDE.
//
// The directory itself is the source root, so `01-baseline-text.ndjson` lands at the root of the test
// classpath — manifest.json records each capture by base name, and any deeper nesting would stop the
// names from matching. Nothing is copied into src/test/resources: two copies of a capture would make
// manifest.json's sha256 ambiguous about which one it attests to.
//
// This is a *test* resource root only. processResources feeds the distribution from
// src/main/resources, so the captures stay out of the plugin jar.
val fixturesDir =
    layout.projectDirectory.dir(
        "src/main/kotlin/${pluginBasePackage.replace('.', '/')}/providers/claude/fixtures",
    )

sourceSets["test"].resources.srcDir(fixturesDir)

intellijPlatform {
    pluginConfiguration {
        id = pluginBasePackage
        name = "Closta"
        version = project.version.toString()
        // The Plugins page's Overview: the README between its two markers. The build stops when they are missing.
        description =
            providers.fileContents(rootProject.layout.projectDirectory.file("../README.md")).asText.map { readme ->
                val start = "<!-- Plugin description -->"
                val end = "<!-- Plugin description end -->"
                check(start in readme && end in readme) { "README.md has no $start … $end section" }
                markdownToHTML(readme.substringAfter(start).substringBefore(end).trim())
            }
        vendor {
            name = "ukitomato"
            email = "me@ukitomato.dev"
            url = "https://github.com/ukitomato/closta"
        }
        // The notes of this version, from CHANGELOG.md.
        changeNotes =
            provider {
                with(changelog) {
                    renderItem(
                        (getOrNull(project.version.toString()) ?: getUnreleased())
                            .withHeader(false)
                            .withEmptySections(false),
                        Changelog.OutputType.HTML,
                    )
                }
            }
        ideaVersion {
            sinceBuild = "262"
            untilBuild = provider { null }
        }
    }

    pluginVerification {
        ides {
            current()
        }
        // The combined diff of a turn's changes uses CombinedDiffVirtualFileImpl, which the platform marks internal
        // and offers no public way to build. Releases go to GitHub, not the Marketplace, so internal API usages are
        // reported but do not fail the build; compatibility problems do.
        failureLevel =
            listOf(
                VerifyPluginTask.FailureLevel.COMPATIBILITY_PROBLEMS,
                VerifyPluginTask.FailureLevel.INVALID_PLUGIN,
                VerifyPluginTask.FailureLevel.MISSING_DEPENDENCIES,
            )
    }
}

// The presenter's tests read the tree/op contract fixtures in src/test/protocol-fixtures. They stay until the
// presenter's tree and diff layers are retired by the native UI.
abstract class ProtocolFixtures : CommandLineArgumentProvider {
    @get:Internal
    abstract val dir: DirectoryProperty

    @get:InputFiles
    @get:PathSensitive(PathSensitivity.RELATIVE)
    @get:IgnoreEmptyDirectories
    val files: FileTree get() = dir.asFileTree

    override fun asArguments(): List<String> = listOf("-DprotocolFixtures.dir=${dir.get().asFile.absolutePath}")
}

tasks.test {
    useJUnitPlatform()

    // The IntelliJ Platform plugin puts the whole IDE on every Test task's classpath, this suite
    // included. One of those jars, lib/testFramework.jar, registers a JUnit 5 LauncherSessionListener
    // (com.intellij.testFramework.junit5.impl.JUnit5TestEnvironmentInitializer) that extends a JUnit 4
    // type. The platform launcher loads every registered listener while opening a session, so with no
    // JUnit 4 on the classpath the worker dies with NoClassDefFoundError: org/junit/rules/TestRule
    // before a single test runs — which is what happened the first time this source set had a test in
    // it. Adding JUnit 4 would fix the symptom and quietly make the IDE's test framework part of the
    // fast suite; dropping the jar keeps the suite what layer rule 4 says it is. Tests that want the
    // IDE belong in src/integrationTest, which gets it through testFramework(TestFrameworkType.*).
    classpath = classpath.filter { it.name != "testFramework.jar" }

    jvmArgumentProviders +=
        objects.newInstance<ProtocolFixtures>().apply {
            dir =
                layout.projectDirectory.dir(
                    "src/test/protocol-fixtures",
                )
        }

    // A run asked to rewrite the goldens must run even when nothing else changed.
    inputs.property("presenterGoldenUpdate", providers.environmentVariable("PRESENTER_GOLDEN_UPDATE").orElse(""))
    inputs.property("foldGoldenUpdate", providers.environmentVariable("FOLD_GOLDEN_UPDATE").orElse(""))
}

detekt {
    buildUponDefaultConfig = true
    config.setFrom(files("config/detekt/detekt.yml"))
}

// --- Layer rules --------------------------------------------------------------------------------
// The layering (core / presenter / providers / platforms) is worth nothing as prose, so the build
// enforces it. Rules and rationale: ../CONTRIBUTING.md.

abstract class CheckLayers : DefaultTask() {
    @get:InputFiles
    @get:PathSensitive(PathSensitivity.RELATIVE)
    abstract val mainSources: ConfigurableFileCollection

    @get:InputFiles
    @get:PathSensitive(PathSensitivity.RELATIVE)
    abstract val testSources: ConfigurableFileCollection

    // Test fixtures (FakeAgentSession + contract base) must stay IntelliJ-free like src/test (rule 4).
    @get:InputFiles
    @get:PathSensitive(PathSensitivity.RELATIVE)
    abstract val fixturesSources: ConfigurableFileCollection

    @get:Input
    abstract val basePackage: Property<String>

    @get:Internal
    abstract val mainRoot: DirectoryProperty

    @get:Internal
    abstract val testRoot: DirectoryProperty

    @get:Internal
    abstract val fixturesRoot: DirectoryProperty

    @get:OutputFile
    abstract val report: RegularFileProperty

    @TaskAction
    fun check() {
        val base = basePackage.get()
        val basePath = base.replace('.', '/')
        val intellijImport = Regex("""^\s*import\s+com\.intellij[.\s]""")
        val platformsImport = Regex("""^\s*import\s+${Regex.escape(base)}\.platforms[.\s]""")
        val interfacesImport = Regex("""^\s*import\s+${Regex.escape(base)}\.core\.interfaces[.\s]""")
        val suspendKeyword = Regex("""(^|[^\w.])suspend($|[^\w])""")

        val violations = mutableListOf<String>()

        forEachCodeLine(mainSources, mainRoot.get().asFile) { path, lineNo, code ->
            val inPackage = path.removePrefix("$basePath/")
            val layer = inPackage.substringBefore('/')
            val inward = layer in INWARD_LAYERS
            val inModels = inPackage.startsWith("core/models/")
            val where = "src/main/kotlin/$path:$lineNo"

            if (inward && intellijImport.containsMatchIn(code)) {
                violations += "$where  [rule 1] $layer/ imports com.intellij — IntelliJ belongs to platforms/ only"
            }
            if (inward && platformsImport.containsMatchIn(code)) {
                violations += "$where  [rule 2] $layer/ imports $base.platforms — dependencies point inward"
            }
            if (inModels && interfacesImport.containsMatchIn(code)) {
                violations += "$where  [rule 3] core/models/ imports core.interfaces — fold stays pure"
            }
            if (inModels && suspendKeyword.containsMatchIn(code)) {
                violations += "$where  [rule 3] core/models/ uses `suspend` — fold stays pure"
            }
        }

        forEachCodeLine(testSources, testRoot.get().asFile) { path, lineNo, code ->
            if (intellijImport.containsMatchIn(code)) {
                violations += "src/test/kotlin/$path:$lineNo  [rule 4] tests import com.intellij — " +
                    "the test suite must run without starting an IDE"
            }
        }

        // The same rule-4 prohibition applies to test fixtures — the fake stays IntelliJ-free so it
        // can be consumed from the fast src/test suite (and any later integrationTest) without an IDE.
        forEachCodeLine(fixturesSources, fixturesRoot.get().asFile) { path, lineNo, code ->
            if (intellijImport.containsMatchIn(code)) {
                violations += "src/testFixtures/kotlin/$path:$lineNo  [rule 4] test fixtures import com.intellij — " +
                    "test fixtures must stay IntelliJ-free"
            }
            if (platformsImport.containsMatchIn(code)) {
                violations +=
                    "src/testFixtures/kotlin/$path:$lineNo  [rule 2] test fixtures import $base.platforms — " +
                    "test fixtures must stay IntelliJ-free, so they cannot reach the platforms layer"
            }
        }

        val reportFile = report.get().asFile
        reportFile.parentFile.mkdirs()
        reportFile.writeText(
            if (violations.isEmpty()) "no layer violations\n" else violations.joinToString("\n", postfix = "\n"),
        )

        if (violations.isNotEmpty()) {
            throw GradleException(
                buildString {
                    appendLine("${violations.size} layer violation(s) — see ../CONTRIBUTING.md for the rules:")
                    violations.forEach { appendLine("  $it") }
                },
            )
        }
    }

    private fun forEachCodeLine(
        sources: ConfigurableFileCollection,
        root: File,
        visit: (path: String, lineNo: Int, code: String) -> Unit,
    ) {
        sources.files
            .filter { it.isFile && it.extension == "kt" }
            .sortedBy { it.invariantSeparatorsPath }
            .forEach { file ->
                val path = file.relativeTo(root).invariantSeparatorsPath
                file.readLines().forEachIndexed { index, line ->
                    val code = codeOf(line)
                    if (code.isNotBlank()) visit(path, index + 1, code)
                }
            }
    }

    /** Strips comments so that prose about a rule does not trip the rule itself. */
    private fun codeOf(line: String): String {
        val trimmed = line.trimStart()
        if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return ""
        val comment = line.indexOf("//")
        return if (comment >= 0) line.substring(0, comment) else line
    }

    private companion object {
        val INWARD_LAYERS = setOf("core", "presenter", "providers")
    }
}

val mainKotlinRoot = layout.projectDirectory.dir("src/main/kotlin")
val testKotlinRoot = layout.projectDirectory.dir("src/test/kotlin")
val testFixturesKotlinRoot = layout.projectDirectory.dir("src/testFixtures/kotlin")

val checkLayers by tasks.registering(CheckLayers::class) {
    group = "verification"
    description = "Fails the build when a source file breaks a layer rule."
    basePackage = pluginBasePackage
    mainRoot = mainKotlinRoot
    testRoot = testKotlinRoot
    fixturesRoot = testFixturesKotlinRoot
    mainSources.from(fileTree(mainKotlinRoot) { include("**/*.kt") })
    testSources.from(fileTree(testKotlinRoot) { include("**/*.kt") })
    fixturesSources.from(fileTree(testFixturesKotlinRoot) { include("**/*.kt") })
    report = layout.buildDirectory.file("reports/layers/layer-check.txt")
}

tasks.named("check") {
    dependsOn(checkLayers)
    // Catches sinceBuild / JVM target / plugin.xml mismatches without starting a sandbox IDE.
    dependsOn("verifyPluginProjectConfiguration")
}

// --- UI rules -----------------------------------------------------------------------------------
// What a UI audit found by hand, kept found by the build. It reads
// platforms/ and plugin.xml as text and compiles nothing. A line the rule is wrong about says so on that line or the
// line above: `// checkUi: allow <rule> — <reason>`. An allow without a reason, for a rule that does not exist, or
// that excuses nothing is itself a violation.

abstract class CheckUi : DefaultTask() {
    @get:InputFiles
    @get:PathSensitive(PathSensitivity.RELATIVE)
    abstract val platformSources: ConfigurableFileCollection

    @get:InputFile
    @get:PathSensitive(PathSensitivity.RELATIVE)
    abstract val pluginXml: RegularFileProperty

    /** The default bundle: an action's description may come from its `action.<id>.description` key. */
    @get:InputFile
    @get:PathSensitive(PathSensitivity.RELATIVE)
    abstract val bundle: RegularFileProperty

    @get:Internal
    abstract val mainRoot: DirectoryProperty

    @get:OutputFile
    abstract val report: RegularFileProperty

    private class Hit(
        val line: Int,
        val rule: String,
        val message: String,
    )

    @TaskAction
    fun check() {
        val violations = mutableListOf<String>()
        val root = mainRoot.get().asFile
        platformSources.files
            .filter { it.isFile && it.extension == "kt" }
            .sortedBy { it.invariantSeparatorsPath }
            .forEach { file ->
                val where = "src/main/kotlin/" + file.relativeTo(root).invariantSeparatorsPath
                val raw = file.readLines()
                val code = codeLines(raw)
                val hits =
                    clickableLabel(code) + rawSizeColour(file.name, code) + unnamedComponent(code) +
                        accessibleField(code)
                violations += allowed(where, raw, code, hits)
            }
        violations += pluginXmlHits()

        val reportFile = report.get().asFile
        reportFile.parentFile.mkdirs()
        reportFile.writeText(
            if (violations.isEmpty()) "no UI violations\n" else violations.joinToString("\n", postfix = "\n"),
        )
        if (violations.isNotEmpty()) {
            throw GradleException(
                buildString {
                    appendLine("${violations.size} UI violation(s) — file:line — rule — the fix:")
                    violations.forEach { appendLine("  $it") }
                },
            )
        }
    }

    /** `fun mouseClicked`: a click handler is how a label or a panel becomes a button the keyboard cannot reach. */
    private fun clickableLabel(code: List<String>): List<Hit> =
        code.mapIndexedNotNull { index, line ->
            if (!MOUSE_CLICKED.containsMatchIn(line)) return@mapIndexedNotNull null
            Hit(
                index + 1,
                CLICKABLE_LABEL,
                "a mouse click makes a component a button — use ActionButton, InplaceButton, ActionLink or PopupHandler",
            )
        }

    private fun rawSizeColour(
        fileName: String,
        code: List<String>,
    ): List<Hit> =
        code.flatMapIndexed { index, line ->
            val found = mutableListOf<String>()
            if (RAW_COLOR.containsMatchIn(line) || COLOR_CONSTANT.containsMatchIn(line)) found += "a fixed colour"
            if (fileName != "ThreadStyle.kt" && JB_COLOR_PAIR.containsMatchIn(line)) found += "a fixed colour pair"
            if (RAW_FONT.containsMatchIn(line)) found += "a font built by hand"
            if (RAW_INSETS.containsMatchIn(line) || RAW_EMPTY_BORDER.containsMatchIn(line)) {
                found += "insets that are not scaled"
            }
            val pixels =
                DIMENSION.findAll(line).any { it.groupValues.drop(1).any(::nonZeroLiteral) } ||
                    EMPTY_BORDER_FACTORY.findAll(line).any { m -> m.groupValues[1].split(',').any(::nonZeroLiteral) }
            if (pixels) found += "pixels that are not scaled"
            found.map {
                Hit(
                    index + 1,
                    RAW_SIZE_COLOUR,
                    "$it — use JBColor.namedColor or a theme key, JBUI.scale, JBUI.size, JBUI.insets or JBUI.Borders",
                )
            }
        }

    /** A component of its own that a screen reader can name only when the file names it somewhere. */
    private fun unnamedComponent(code: List<String>): List<Hit> {
        if (code.any { ACCESSIBLE.containsMatchIn(it) }) return emptyList()
        return code.mapIndexedNotNull { index, line ->
            if (!COMPONENT_SUPERTYPE.containsMatchIn(line) || ANONYMOUS_OBJECT.containsMatchIn(line)) {
                return@mapIndexedNotNull null
            }
            Hit(
                index + 1,
                UNNAMED_COMPONENT,
                "a component of its own with no accessible name in its file — set getAccessibleContext().accessibleName",
            )
        }
    }

    /**
     * Inside a component, a bare `accessibleContext` is JComponent's protected field, not the getter: it stays null
     * until getAccessibleContext() is called, so setting its name throws.
     */
    private fun accessibleField(code: List<String>): List<Hit> =
        code.mapIndexedNotNull { index, line ->
            if (!BARE_ACCESSIBLE.containsMatchIn(line)) return@mapIndexedNotNull null
            Hit(
                index + 1,
                ACCESSIBLE_FIELD,
                "the accessibleContext field is null until it is asked for — call getAccessibleContext()",
            )
        }

    /** Turns the hits a line's allow excuses into nothing, and a bad or unused allow into a violation. */
    private fun allowed(
        where: String,
        raw: List<String>,
        code: List<String>,
        hits: List<Hit>,
    ): List<String> {
        val violations = mutableListOf<String>()
        // line number (1-based) -> the rule its allow names; an allow on a comment-only line covers the next line.
        val allows = mutableMapOf<Int, Pair<Int, String>>()
        raw.forEachIndexed { index, line ->
            val match = ALLOW.find(line) ?: return@forEachIndexed
            val rule = match.groupValues[1]
            val reason = match.groupValues[2].trim()
            val at = index + 1
            when {
                rule !in RULES ->
                    violations += "$where:$at — allow — names no rule of checkUi (${RULES.joinToString()})"
                reason.isEmpty() ->
                    violations += "$where:$at — allow — an allow needs its reason: `// checkUi: allow $rule — <why>`"
                else -> allows[if (code[index].isBlank()) at + 1 else at] = at to rule
            }
        }
        val used = mutableSetOf<Int>()
        hits.forEach { hit ->
            val allow = allows[hit.line]
            if (allow != null && allow.second == hit.rule) {
                used += allow.first
            } else {
                violations += "$where:${hit.line} — ${hit.rule} — ${hit.message}"
            }
        }
        allows.values.filter { it.first !in used }.forEach { (at, rule) ->
            violations += "$where:$at — allow — excuses no $rule on its line: remove it"
        }
        return violations.sortedBy { it.substringAfter("$where:").substringBefore(' ').toInt() }
    }

    private fun pluginXmlHits(): List<String> {
        val file = pluginXml.get().asFile
        val text = XML_COMMENT.replace(file.readText()) { m -> m.value.replace(Regex("[^\n]"), " ") }
        val keys =
            bundle
                .get()
                .asFile
                .readLines()
                .map { it.substringBefore('=').trim() }
                .toSet()
        val where = "src/main/resources/META-INF/plugin.xml"

        fun lineOf(offset: Int) = text.substring(0, offset).count { it == '\n' } + 1
        val violations = mutableListOf<String>()
        ACTION_TAG.findAll(text).forEach { tag ->
            val id = ID_ATTR.find(tag.value)?.groupValues?.get(1)
            if (!DESCRIPTION_ATTR.containsMatchIn(tag.value) && "action.$id.description" !in keys) {
                violations += "$where:${lineOf(tag.range.first)} — $PLUGIN_XML — the action ${id ?: ""} has no " +
                    "description — add description=\"…\" (Find Action and the status bar show it)"
            }
        }
        NOTIFICATION_GROUP_TAG.findAll(text).forEach { tag ->
            if (!DISPLAY_TYPE_ATTR.containsMatchIn(tag.value)) {
                violations += "$where:${lineOf(tag.range.first)} — $PLUGIN_XML — a notification group has no " +
                    "displayType — add displayType=\"BALLOON\", \"STICKY_BALLOON\" or \"NONE\""
            }
        }
        return violations
    }

    private fun nonZeroLiteral(argument: String) = NON_ZERO_INT.matches(argument.trim())

    /**
     * The code of each line, with comments and the insides of strings and characters blanked, so that prose and text
     * about a rule do not trip it. Block comments and raw strings carry over from line to line.
     */
    private fun codeLines(lines: List<String>): List<String> {
        var inBlock = false
        var inRaw = false
        return lines.map { line ->
            val out = StringBuilder()
            var i = 0
            var inString = false
            while (i < line.length) {
                val c = line[i]
                when {
                    inBlock ->
                        if (line.startsWith("*/", i)) {
                            inBlock = false
                            i++
                        }
                    inRaw ->
                        if (line.startsWith("\"\"\"", i)) {
                            inRaw = false
                            out.append("\"\"\"")
                            i += 2
                        }
                    inString ->
                        when (c) {
                            '\\' -> i++
                            '"' -> {
                                inString = false
                                out.append(c)
                            }
                        }
                    line.startsWith("//", i) -> break
                    line.startsWith("/*", i) -> {
                        inBlock = true
                        i++
                    }
                    line.startsWith("\"\"\"", i) -> {
                        inRaw = true
                        out.append("\"\"\"")
                        i += 2
                    }
                    c == '"' -> {
                        inString = true
                        out.append(c)
                    }
                    c == '\'' -> {
                        val end = line.indexOf('\'', i + if (line.getOrNull(i + 1) == '\\') 3 else 2)
                        out.append("''")
                        if (end > i) i = end
                    }
                    else -> out.append(c)
                }
                i++
            }
            // A KDoc's or a comment's leading `*` (a block comment's middle lines) is prose too.
            if (out.trimStart().startsWith("*")) "" else out.toString()
        }
    }

    private companion object {
        const val CLICKABLE_LABEL = "clickable-label"
        const val RAW_SIZE_COLOUR = "raw-size-colour"
        const val UNNAMED_COMPONENT = "unnamed-component"
        const val PLUGIN_XML = "plugin-xml"
        const val ACCESSIBLE_FIELD = "accessible-field"
        val RULES = listOf(CLICKABLE_LABEL, RAW_SIZE_COLOUR, UNNAMED_COMPONENT, PLUGIN_XML, ACCESSIBLE_FIELD)

        val ALLOW = Regex("""//\s*checkUi:\s*allow\s+(\S+)\s*(?:(?:—|--|-)(.*))?$""")
        val MOUSE_CLICKED = Regex("""\bfun\s+mouseClicked\s*\(""")
        val RAW_COLOR = Regex("""(?<![\w])Color\(""")
        val COLOR_CONSTANT = Regex("""(?<![\w])Color\.[A-Z][A-Z_]*\b""")
        val JB_COLOR_PAIR = Regex("""(?<![\w])JBColor\(""")
        val RAW_FONT = Regex("""(?<![\w])Font\(""")
        val RAW_INSETS = Regex("""(?<![\w])Insets\(""")
        val RAW_EMPTY_BORDER = Regex("""(?<![\w])EmptyBorder\(""")
        val DIMENSION = Regex("""(?<![\w])Dimension\(\s*([^(),]*?)\s*,\s*([^(),]*?)\s*\)""")
        val EMPTY_BORDER_FACTORY = Regex("""BorderFactory\.createEmptyBorder\(([^()]*)\)""")
        val NON_ZERO_INT = Regex("""[1-9][0-9]*""")
        val ACCESSIBLE = Regex("""\b(accessibleContext|getAccessibleContext|accessibleName)\b""")
        val COMPONENT_SUPERTYPE = Regex("""(^|[)\w>]\s*):\s*(JComponent|JPanel|JBPanel|JBLabel|JLabel|JButton)\s*\(""")
        val ANONYMOUS_OBJECT = Regex("""\bobject\s*:""")
        val BARE_ACCESSIBLE = Regex("""(?<![\w.])accessibleContext\b|\bthis\.accessibleContext\b""")

        val XML_COMMENT = Regex("""<!--.*?-->""", RegexOption.DOT_MATCHES_ALL)
        val ACTION_TAG = Regex("""<action\b[^>]*>""")
        val NOTIFICATION_GROUP_TAG = Regex("""<notificationGroup\b[^>]*>""")
        val ID_ATTR = Regex("""\bid\s*=\s*"([^"]*)"""")
        val DESCRIPTION_ATTR = Regex("""\bdescription\s*=\s*"\s*[^"\s]""")
        val DISPLAY_TYPE_ATTR = Regex("""\bdisplayType\s*=""")
    }
}

val checkUi by tasks.registering(CheckUi::class) {
    group = "verification"
    description = "Fails the build when platforms/ or plugin.xml breaks a UI rule of the audit."
    mainRoot = mainKotlinRoot
    platformSources.from(
        fileTree(mainKotlinRoot) { include("${pluginBasePackage.replace('.', '/')}/platforms/**/*.kt") },
    )
    pluginXml = layout.projectDirectory.file("src/main/resources/META-INF/plugin.xml")
    bundle = layout.projectDirectory.file("src/main/resources/messages/ClostaBundle.properties")
    report = layout.buildDirectory.file("reports/ui/ui-check.txt")
}

tasks.named("check") { dependsOn(checkUi) }

// --- Bundled libraries ---------------------------------------------------------------------------
// The plugin must not ship its own netty. The IDE has one; with a second copy on the plugin classpath the class
// loaders collide with LinkageError. sts brings netty in through netty-nio-client, excluded in the dependencies
// above; this check fails the build when a module dependency brings any io.netty* group back. It reads module
// coordinates, so a jar added as a file or a fat jar that shades netty would not show here.

abstract class CheckBundledLibraries : DefaultTask() {
    @get:Input
    abstract val modules: ListProperty<String>

    @get:Input
    abstract val forbiddenGroups: SetProperty<String>

    @get:OutputFile
    abstract val report: RegularFileProperty

    @TaskAction
    fun check() {
        val all = modules.get()
        val forbidden =
            all.filter { module ->
                val group = module.substringBefore(':')
                forbiddenGroups.get().any { group == it || group.startsWith("$it.") }
            }
        val reportFile = report.get().asFile
        reportFile.parentFile.mkdirs()
        reportFile.writeText(all.joinToString("\n", postfix = "\n"))
        if (forbidden.isNotEmpty()) {
            throw GradleException(
                buildString {
                    appendLine("The plugin would bundle libraries the IDE already ships, which clash at run time:")
                    forbidden.forEach { appendLine("  $it") }
                    appendLine("Find what brings them in, then exclude it the way sts excludes netty-nio-client:")
                    forbiddenGroups.get().forEach {
                        appendLine("  ./gradlew dependencyInsight --configuration runtimeClasspath --dependency $it")
                    }
                    appendLine("Every bundled module is listed in ${reportFile.path}.")
                },
            )
        }
    }
}

val checkBundledLibraries by tasks.registering(CheckBundledLibraries::class) {
    group = "verification"
    description = "Fails the build when the plugin's runtime classpath would bundle io.netty."
    modules =
        configurations.runtimeClasspath
            .flatMap { it.incoming.artifacts.resolvedArtifacts }
            .map { artifacts ->
                artifacts
                    .mapNotNull { it.id.componentIdentifier as? ModuleComponentIdentifier }
                    .map { "${it.group}:${it.module}:${it.version}" }
                    .sorted()
            }
    forbiddenGroups = setOf("io.netty")
    report = layout.buildDirectory.file("reports/bundled-libraries.txt")
}

tasks.named("check") {
    dependsOn(checkBundledLibraries)
}

// --- The gallery -----------------------------------------------------------------------------------
// `./gradlew runIde -Pclosta.gallery=<folder>` opens a made-up conversation with every kind of row and card in the
// sidebar and in an editor tab, paints them into PNGs in <folder>, and closes the IDE (bench/Gallery.kt). Without the
// property runIde is as it always is. -Pclosta.gallery.project=<folder> is the project it opens (an empty folder).
// -Pclosta.gallery.theme=light|dark paints in the IDE's default light or dark theme, -Pclosta.gallery.scale=2 at twice
// the size, and -Pclosta.gallery.only=showcase paints only the README's picture (taken with all three).
val galleryOut = providers.gradleProperty("closta.gallery")
val galleryProject = providers.gradleProperty("closta.gallery.project")
val galleryTheme = providers.gradleProperty("closta.gallery.theme")
val galleryScale = providers.gradleProperty("closta.gallery.scale")
val galleryOnly = providers.gradleProperty("closta.gallery.only")

tasks.named<org.jetbrains.intellij.platform.gradle.tasks.RunIdeTask>("runIde") {
    if (galleryOut.isPresent) {
        jvmArgumentProviders +=
            CommandLineArgumentProvider {
                listOf(
                    "-Dclosta.gallery=${galleryOut.get()}",
                    "-Didea.trust.all.projects=true",
                    "-Dide.show.tips.on.startup.default.value=false",
                    "-Djb.consents.confirmation.enabled=false",
                    "-Djb.privacy.policy.text=<!--999.999-->",
                    "-Didea.initially.ask.config=never",
                ) +
                    listOfNotNull(
                        galleryTheme.orNull?.let { "-Dclosta.gallery.theme=$it" },
                        galleryScale.orNull?.let { "-Dclosta.gallery.scale=$it" },
                        galleryOnly.orNull?.let { "-Dclosta.gallery.only=$it" },
                        // Laid out at the scale it is painted at: text measured at 1x and painted at 2x overflows.
                        galleryScale.orNull?.let { "-Dsun.java2d.uiScale=$it" },
                    )
            }
        if (galleryProject.isPresent) argumentProviders += CommandLineArgumentProvider { listOf(galleryProject.get()) }
    }
}

// --- Changelog ----------------------------------------------------------------------------------------
// CHANGELOG.md at the repository root gives the plugin's change notes and the GitHub release's text.
changelog {
    path = rootProject.file("../CHANGELOG.md").path
    groups = listOf("Added", "Changed", "Deprecated", "Removed", "Fixed", "Security")
    repositoryUrl = "https://github.com/ukitomato/closta"
}
