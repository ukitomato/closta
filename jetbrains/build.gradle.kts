import org.gradle.api.artifacts.component.ModuleComponentIdentifier
import org.jetbrains.changelog.Changelog
import org.jetbrains.changelog.markdownToHTML
import org.jetbrains.intellij.platform.gradle.tasks.VerifyPluginTask
import org.jetbrains.kotlin.gradle.dsl.JvmDefaultMode
import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import java.io.File
import java.util.zip.ZipFile

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
    // The synthetic sessions (providers/claude/synthetic) live in testFixtures for src/test and the dev tools plugin,
    // and build stream-json with the same Gson the provider parses it with.
    testFixturesImplementation("com.google.code.gson:gson:2.11.0")
    testFixturesImplementation("org.jetbrains.kotlinx:kotlinx-collections-immutable:0.5.2")

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
    // Likewise sts's default Apache client, with its httpclient, httpcore, commons-codec and commons-logging, is unused.
    implementation("software.amazon.awssdk:sts:2.30.0") {
        exclude(group = "software.amazon.awssdk", module = "netty-nio-client")
        exclude(group = "software.amazon.awssdk", module = "apache-client")
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

// Build and test on JDK 25, which IntelliJ 2026.2 needs. Every IDE in range (262+) runs on JBR 25, so 21 is a
// conservative bytecode target, not a runtime floor. sourceCompatibility stays at the toolchain's 25 because the
// platform plugin's verifyPluginProjectConfiguration warns when it is lower. If a .java source is ever added,
// sourceCompatibility must be aligned with the target: javac rejects `-source 25 -target 21`.
java { targetCompatibility = JavaVersion.VERSION_21 }

kotlin {
    jvmToolchain(25)
    compilerOptions {
        jvmTarget = JvmTarget.JVM_21
        // A class that implements a Java interface gets no bridge for the interface's default methods. With the bridge
        // the class overrides and calls isApplicable / getEditorTabTooltipText, which the Verifier reports as
        // deprecated even though the source never names them.
        jvmDefault = JvmDefaultMode.NO_COMPATIBILITY
    }
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

// The IntelliJ Platform plugin puts the patched plugin.xml into every source set's resources. The fixtures jar ships
// inside the dev tools plugin, where a second plugin.xml would make the IDE read the wrong descriptor.
tasks.named<Jar>("testFixturesJar") { exclude("META-INF/plugin.xml") }

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
            // Open on purpose: a cap would hide the plugin from every newer IDE. verifyPlugin checks the current
            // build only, so newer IDEs are not verified here.
            untilBuild = provider { null }
        }
    }

    pluginVerification {
        // Only the current IDE. recommended() pulled in every released build since 262 (2026.3 and on), each
        // extracted at about 4.5 GB into the Gradle cache, which kept filling the WSL disk.
        ides {
            current()
        }
        // Internal, override-only, non-extendable and scheduled-for-removal API usages fail the build alongside compatibility problems.
        // Experimental APIs (the combined diff among them) are reported but allowed.
        failureLevel =
            listOf(
                VerifyPluginTask.FailureLevel.COMPATIBILITY_PROBLEMS,
                VerifyPluginTask.FailureLevel.INVALID_PLUGIN,
                VerifyPluginTask.FailureLevel.MISSING_DEPENDENCIES,
                VerifyPluginTask.FailureLevel.INTERNAL_API_USAGES,
                VerifyPluginTask.FailureLevel.OVERRIDE_ONLY_API_USAGES,
                VerifyPluginTask.FailureLevel.NON_EXTENDABLE_API_USAGES,
                VerifyPluginTask.FailureLevel.SCHEDULED_FOR_REMOVAL_API_USAGES,
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

fun Test.configureClostaTests() {
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

tasks.test {
    useJUnitPlatform { excludeTags("perf") }
    configureClostaTests()
}

// Wall-clock budgets: they measure time, so they run apart from check and do not gate the build.
val perfTest by tasks.registering(Test::class) {
    description = "Runs the timing budget tests (tagged perf), judged by the median of five runs."
    group = "verification"
    // Callables, so only the compile tasks become dependencies and not the test task itself.
    testClassesDirs = files({ tasks.test.get().testClassesDirs })
    classpath = files({ tasks.test.get().classpath })
    useJUnitPlatform { includeTags("perf") }
    configureClostaTests()
    outputs.upToDateWhen { false }
    outputs.cacheIf { false }
    testLogging.showStandardStreams = true
}

detekt {
    buildUponDefaultConfig = true
    config.setFrom(files("config/detekt/detekt.yml"))
}

// Detekt's Kotlin does not know JVM 25 yet, so it analyses against the bytecode target.
tasks.withType<io.gitlab.arturbosch.detekt.Detekt>().configureEach { jvmTarget = "21" }

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
// The plugin must not ship what the IDE already has (netty, slf4j: a second copy makes the class loaders collide
// with LinkageError) nor what it does not use (the Apache HTTP client stack, annotation-only jars). The
// dependencies above exclude them; this check fails the build when a module dependency brings any of them back.
// It reads module coordinates, so a jar added as a file or a fat jar that shades them would not show here.

abstract class CheckBundledLibraries : DefaultTask() {
    @get:Input
    abstract val modules: ListProperty<String>

    @get:Input
    abstract val forbiddenGroups: SetProperty<String>

    @get:Input
    abstract val forbiddenModules: SetProperty<String>

    @get:OutputFile
    abstract val report: RegularFileProperty

    @TaskAction
    fun check() {
        val all = modules.get()
        val forbidden =
            all.filter { module ->
                val group = module.substringBefore(':')
                forbiddenGroups.get().any { group == it || group.startsWith("$it.") } ||
                    module.substringBeforeLast(':') in forbiddenModules.get()
            }
        val reportFile = report.get().asFile
        reportFile.parentFile.mkdirs()
        reportFile.writeText(all.joinToString("\n", postfix = "\n"))
        if (forbidden.isNotEmpty()) {
            throw GradleException(
                buildString {
                    appendLine("The plugin would bundle libraries the IDE already ships or that nothing uses:")
                    forbidden.forEach { appendLine("  $it") }
                    appendLine("Find what brings them in, then exclude it the way sts excludes netty-nio-client:")
                    (forbiddenGroups.get() + forbiddenModules.get()).forEach {
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
    description =
        "Fails the build when the plugin would bundle what the IDE ships (netty, slf4j) " +
        "or what it does not use (Apache HTTP client, annotation-only jars)."
    modules =
        configurations.runtimeClasspath
            .flatMap { it.incoming.artifacts.resolvedArtifacts }
            .map { artifacts ->
                artifacts
                    .mapNotNull { it.id.componentIdentifier as? ModuleComponentIdentifier }
                    .map { "${it.group}:${it.module}:${it.version}" }
                    .sorted()
            }
    forbiddenGroups =
        setOf(
            "io.netty",
            "org.apache.httpcomponents",
            "commons-logging",
            "commons-codec",
            "org.slf4j",
            "com.google.errorprone",
        )
    forbiddenModules = setOf("software.amazon.awssdk:apache-client")
    report = layout.buildDirectory.file("reports/bundled-libraries.txt")
}

// slf4j-api is used by the AWS SDK's utils, but the IDE ships org.slf4j and the plugin's class loader reads it from
// the parent. error_prone_annotations is only Gson's annotations and is not needed at run time. This affects the
// distribution only, not the test classpath.
configurations.runtimeClasspath {
    exclude(group = "org.slf4j", module = "slf4j-api")
    exclude(group = "com.google.errorprone", module = "error_prone_annotations")
}

tasks.named("check") {
    dependsOn(checkBundledLibraries)
}

// --- Licences and notices ------------------------------------------------------------------------
// The jar carries LICENSE, NOTICE and a list of every bundled third-party module with its licence text, because the
// Apache-2.0 and MIT terms require the notices to travel with the binary. The list is generated from runtimeClasspath
// so a new dependency fails the build until it is added to the table and to NOTICE.

abstract class ThirdPartyNotices : DefaultTask() {
    @get:Input
    abstract val modules: ListProperty<String>

    // On runtimeClasspath but not in the zip: the plugin drops what the IDE provides.
    @get:Input
    abstract val notBundled: SetProperty<String>

    // key (group or group:module) -> "display name|SPDX|copyright holder"
    @get:Input
    abstract val licenseTable: MapProperty<String, String>

    @get:InputFiles
    @get:PathSensitive(PathSensitivity.NAME_ONLY)
    abstract val jars: ConfigurableFileCollection

    // SPDX id -> licence text file
    @get:Input
    abstract val licenseTextNames: MapProperty<String, String>

    @get:InputFiles
    @get:PathSensitive(PathSensitivity.NAME_ONLY)
    abstract val licenseTexts: ConfigurableFileCollection

    @get:InputFile
    @get:PathSensitive(PathSensitivity.NONE)
    abstract val noticeFile: RegularFileProperty

    @get:OutputDirectory
    abstract val outputDir: DirectoryProperty

    private class Entry(
        val name: String,
        val spdx: String,
        val holder: String,
    )

    private fun entry(key: String): Entry? =
        licenseTable.get()[key]?.split('|', limit = 3)?.let { Entry(it[0], it[1], it.getOrElse(2) { "" }) }

    @TaskAction
    fun generate() {
        val coordinates = modules.get().filter { it.substringBeforeLast(':') !in notBundled.get() }.sorted()
        val entries =
            coordinates.associateWith { c ->
                val (group, module) = c.split(':')
                entry("$group:$module") ?: entry(group)
            }
        val missing = entries.filterValues { it == null }.keys
        if (missing.isNotEmpty()) {
            throw GradleException(
                buildString {
                    appendLine("The plugin would bundle modules without a licence entry:")
                    missing.forEach { appendLine("  $it") }
                    appendLine(
                        "Add its group (or group:module) to the licence table in build.gradle.kts and a bullet to NOTICE.",
                    )
                },
            )
        }
        val tableNames = coordinates.map { entries.getValue(it)!!.name }.toSortedSet()
        val noticeNames =
            noticeFile
                .get()
                .asFile
                .readLines()
                .filter { it.startsWith("  - ") && " (" in it }
                .map { it.removePrefix("  - ").substringBefore(" (") }
                .toSortedSet()
        if (tableNames != noticeNames) {
            throw GradleException(
                buildString {
                    appendLine("The third-party list in NOTICE does not match the licence table in build.gradle.kts:")
                    (tableNames - noticeNames).forEach { appendLine("  missing from NOTICE: $it") }
                    (noticeNames - tableNames).forEach { appendLine("  not bundled or not in the table: $it") }
                    appendLine("Add or remove the bullet \"  - <name> (<group>) - <SPDX> - <holder>\" in NOTICE.")
                },
            )
        }

        val out = StringBuilder()
        out.appendLine("Third-party notices")
        out.appendLine()
        out.appendLine("These libraries are bundled unmodified in the lib/ folder of the Closta plugin zip.")
        out.appendLine()
        coordinates.forEach { c ->
            val e = entries.getValue(c)!!
            out.append("$c \u2014 ${e.name} \u2014 ${e.spdx}")
            if (e.holder.isNotEmpty()) out.append(" \u2014 ${e.holder}")
            out.appendLine()
        }

        val seen = HashSet<String>()
        val byGroup = sortedMapOf<String, MutableList<String>>()
        coordinates.forEach { c ->
            val (group, module, version) = c.split(':')
            val jar =
                jars.files.firstOrNull { it.name == "$module-$version.jar" }
                    ?: throw GradleException("No jar file found for $c among the runtime classpath files")
            ZipFile(jar).use { zip ->
                listOf("META-INF/NOTICE", "META-INF/NOTICE.txt").forEach { name ->
                    val text =
                        zip
                            .getEntry(
                                name,
                            )?.let {
                                zip
                                    .getInputStream(it)
                                    .readBytes()
                                    .toString(Charsets.UTF_8)
                                    .trim()
                            }
                    if (!text.isNullOrEmpty() && seen.add(text)) byGroup.getOrPut(group) { mutableListOf() }.add(text)
                }
            }
        }
        byGroup.forEach { (group, texts) ->
            out.appendLine()
            out.appendLine("Notices shipped in the $group jars")
            out.appendLine("-".repeat(72))
            texts.forEach {
                out.appendLine(it)
                out.appendLine()
            }
        }

        val used = coordinates.map { entries.getValue(it)!!.spdx }.toSortedSet()
        used.forEach { spdx ->
            val fileName =
                licenseTextNames.get()[spdx] ?: throw GradleException("No licence text is configured for $spdx")
            val file = licenseTexts.files.first { it.name == fileName }
            out.appendLine()
            out.appendLine("=".repeat(72))
            out.appendLine("License text: $spdx")
            out.appendLine("=".repeat(72))
            out.appendLine(file.readText().trim())
        }

        val target = outputDir.get().file("META-INF/THIRD-PARTY-NOTICES.txt").asFile
        target.parentFile.mkdirs()
        target.writeText(out.toString())
    }
}

val thirdPartyNotices by tasks.registering(ThirdPartyNotices::class) {
    description = "Generates META-INF/THIRD-PARTY-NOTICES.txt from the bundled modules."
    val artifacts = configurations.runtimeClasspath.flatMap { it.incoming.artifacts.resolvedArtifacts }
    modules =
        artifacts.map { all ->
            all
                .mapNotNull { it.id.componentIdentifier as? ModuleComponentIdentifier }
                .map { "${it.group}:${it.module}:${it.version}" }
        }
    notBundled = setOf("org.jetbrains.kotlin:kotlin-stdlib", "org.jetbrains:annotations")
    jars.from(configurations.runtimeClasspath)
    licenseTable =
        mapOf(
            "com.google.code.gson:gson" to "Gson|Apache-2.0|Copyright Google LLC",
            "org.jetbrains.kotlinx:kotlinx-collections-immutable-jvm" to
                "kotlinx.collections.immutable|Apache-2.0|Copyright JetBrains s.r.o.",
            "software.amazon.awssdk" to "AWS SDK for Java 2.0|Apache-2.0|Copyright Amazon.com, Inc. or its affiliates",
            "software.amazon.eventstream" to "AWS Event Stream|Apache-2.0|Copyright Amazon.com, Inc. or its affiliates",
            "org.reactivestreams" to "Reactive Streams|MIT-0|",
        )
    licenseTextNames = mapOf("Apache-2.0" to "LICENSE", "MIT-0" to "MIT-0.txt")
    licenseTexts.from(rootProject.file("../LICENSE"), layout.projectDirectory.file("config/licenses/MIT-0.txt"))
    noticeFile = rootProject.layout.projectDirectory.file("../NOTICE")
    outputDir = layout.buildDirectory.dir("generated/notices")
}

tasks.named("check") { dependsOn(thirdPartyNotices) }

tasks.jar {
    into("META-INF") {
        from(rootProject.file("../LICENSE"))
        from(rootProject.file("../NOTICE"))
    }
    from(thirdPartyNotices)
}

// The sandbox IDE is started from :dev (`./gradlew :dev:runIde`), which loads this plugin together with the dev tools.
// `./gradlew runIde` from jetbrains/ matches both projects' tasks and runs only :dev:runIde; `:runIde` alone says so.
tasks.runIde {
    if (":runIde" in gradle.startParameter.taskNames) {
        doFirst {
            throw GradleException("This project does not start the IDE: run :dev:runIde, or runIde from jetbrains/")
        }
    } else {
        enabled = false
    }
}

// --- Changelog ----------------------------------------------------------------------------------------
// CHANGELOG.md at the repository root gives the plugin's change notes and the GitHub release's text.
changelog {
    path = rootProject.file("../CHANGELOG.md").path
    groups = listOf("Added", "Changed", "Deprecated", "Removed", "Fixed", "Security")
    repositoryUrl = "https://github.com/ukitomato/closta"
}
