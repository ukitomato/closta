import org.jetbrains.kotlin.gradle.dsl.JvmDefaultMode
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("org.jetbrains.kotlin.jvm")
    id("org.jetbrains.intellij.platform")
    id("org.jlleitschuh.gradle.ktlint")
    id("io.gitlab.arturbosch.detekt")
}

dependencies {
    intellijPlatform {
        intellijIdea("2026.2.4")
        // The same bundled modules as the plugin it extends, so the sandbox IDE has what Closta needs.
        bundledModule("intellij.platform.jewel.markdown.core")
        bundledModule("intellij.platform.jewel.markdown.extensions.gfmTables")
        bundledModule("intellij.platform.vcs.impl")
        bundledPlugin("org.jetbrains.plugins.terminal")
        bundledModule("intellij.terminal.frontend")
        localPlugin(project(":"))
    }
    // The synthetic sessions the gallery and the benchmark play (providers/claude/synthetic). Not transitive: the
    // fixtures would bring a second copy of Closta's own jar and libraries into this plugin, and Closta's class loader
    // already gives them (Gson included). JUnit's API, which other fixtures use, is left out the same way.
    implementation(testFixtures(project(":")) as ModuleDependency) { isTransitive = false }
}

// Build and test on JDK 25, which IntelliJ 2026.2 needs. sourceCompatibility stays at the toolchain's 25 because the
// platform plugin's verifyPluginProjectConfiguration warns when it is lower; the bytecode (Kotlin and Java) stays 21
// so it still loads in the older IDE runtimes in range.
java { targetCompatibility = JavaVersion.VERSION_21 }

kotlin {
    jvmToolchain(25)
    compilerOptions {
        jvmTarget = JvmTarget.JVM_21
        jvmDefault = JvmDefaultMode.NO_COMPATIBILITY
    }
}

intellijPlatform {
    // Only runIde loads this plugin (it needs prepareSandbox), so no headless IDE for a searchable-options index.
    buildSearchableOptions = false
    pluginConfiguration {
        id = "dev.ukitomato.closta.dev"
        name = "Closta Dev Tools"
        version = project.version.toString()
        ideaVersion {
            sinceBuild = "262"
            untilBuild = provider { null }
        }
    }
}

detekt {
    buildUponDefaultConfig = true
    config.setFrom(files("../config/detekt/detekt.yml"))
}

// Detekt's Kotlin does not know JVM 25 yet, so it analyses against the bytecode target.
tasks.withType<io.gitlab.arturbosch.detekt.Detekt>().configureEach { jvmTarget = "21" }

// Only runIde loads this plugin. It is never verified, signed or published.
tasks.verifyPlugin { enabled = false }
tasks.publishPlugin { enabled = false }
tasks.signPlugin { enabled = false }
tasks.buildPlugin { enabled = false }

// --- The gallery -----------------------------------------------------------------------------------
// `./gradlew :dev:runIde -Pclosta.gallery=<folder>` opens a made-up conversation with every kind of row and card in the
// sidebar and in an editor tab, paints them into PNGs in <folder>, and closes the IDE (devtools/Gallery.kt). Without the
// property runIde is as it always is. -Pclosta.gallery.project=<folder> is the project it opens (an empty folder).
// -Pclosta.gallery.theme=light|dark paints in the IDE's default light or dark theme, -Pclosta.gallery.scale=2 at twice
// the size, and -Pclosta.gallery.only=showcase paints only the README's picture (taken with all three).
val galleryOut = providers.gradleProperty("closta.gallery")
val galleryProject = providers.gradleProperty("closta.gallery.project")
val galleryTheme = providers.gradleProperty("closta.gallery.theme")
val galleryScale = providers.gradleProperty("closta.gallery.scale")
val galleryOnly = providers.gradleProperty("closta.gallery.only")

// `./gradlew gallery -Pclosta.gallery=<folder>` runs the same, opening build/gallery-project (made empty) unless
// -Pclosta.gallery.project names one, and fails when done.txt is missing, empty or says FAILED.
val gallery =
    tasks.register("gallery") {
        group = "verification"
        description = "Paints the gallery into -Pclosta.gallery=<folder> and fails when a scene fails."
        dependsOn(tasks.runIde)
        val folder = galleryOut.map { file(it).absoluteFile }
        doLast {
            val done = folder.get().resolve("done.txt")
            val text = if (done.isFile) done.readText() else ""
            check(text.isNotBlank()) { "gallery wrote no $done" }
            check("FAILED" !in text) { "gallery failed:\n" + text.lines().filter { "FAILED" in it }.joinToString("\n") }
        }
    }

// A relative -Pclosta.gallery resolves against this project's directory (jetbrains/dev) for Gradle, so the IDE is given
// the absolute path: it would otherwise resolve it against its own working directory.
fun galleryFolder(): File = file(galleryOut.get()).absoluteFile

val galleryDefaultProject = layout.buildDirectory.dir("gallery-project")

tasks.runIde {
    val viaGallery = provider { gradle.taskGraph.hasTask(gallery.get()) }
    doFirst {
        check(!viaGallery.get() || galleryOut.isPresent) { "gallery needs -Pclosta.gallery=<folder>" }
        if (viaGallery.get()) {
            galleryFolder().apply {
                mkdirs()
                resolve("done.txt").delete()
            }
            if (!galleryProject.isPresent) {
                galleryDefaultProject.get().asFile.apply {
                    deleteRecursively()
                    mkdirs()
                }
            }
        }
    }
    if (galleryOut.isPresent) {
        jvmArgumentProviders +=
            CommandLineArgumentProvider {
                listOf(
                    "-Dclosta.gallery=${galleryFolder().path}",
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
        argumentProviders +=
            CommandLineArgumentProvider {
                when {
                    galleryProject.isPresent -> listOf(file(galleryProject.get()).absolutePath)
                    viaGallery.get() -> listOf(galleryDefaultProject.get().asFile.path)
                    else -> emptyList()
                }
            }
    }
}
