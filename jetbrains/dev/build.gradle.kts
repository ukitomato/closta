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

kotlin {
    jvmToolchain(21)
}

intellijPlatform {
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

// Only runIde loads this plugin. It is never verified, signed or published.
tasks.verifyPlugin { enabled = false }
tasks.publishPlugin { enabled = false }
tasks.signPlugin { enabled = false }

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

tasks.runIde {
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
