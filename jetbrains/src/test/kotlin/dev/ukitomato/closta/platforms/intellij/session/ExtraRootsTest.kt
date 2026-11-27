package dev.ukitomato.closta.platforms.intellij.session

import dev.ukitomato.closta.providers.claude.launch.NativeCliPaths
import dev.ukitomato.closta.providers.claude.launch.cliPathsFor
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

/** Which IDE content roots a session is given as extra working directories, and how a root becomes the CLI's path. */
class ExtraRootsTest {
    private val same: (String) -> String? = { it }

    private fun roots(
        cwd: String,
        roots: List<String>,
        projectBase: String? = null,
        worktree: Boolean = false,
        toCli: (String) -> String? = same,
    ) = extraRoots(cwd, roots, projectBase, worktree, toCli)

    @Test
    fun `the folder the session runs in and what is inside it are not added`() {
        assertEquals(
            listOf("/data/lib"),
            roots("/work/proj", listOf("/work/proj", "/work/proj/sub", "/work/proj/", "/data/lib")),
        )
    }

    @Test
    fun `a folder that only starts with the same letters is outside`() {
        assertEquals(listOf("/work/proj2"), roots("/work/proj", listOf("/work/proj2")))
    }

    @Test
    fun `in a worktree the project's own folder and what is inside it are not added either`() {
        assertEquals(
            listOf("/data/lib"),
            roots(
                "/work/proj-wt",
                listOf("/work/proj", "/work/proj/sub", "/work/proj-wt/x", "/data/lib"),
                projectBase = "/work/proj",
                worktree = true,
            ),
        )
    }

    @Test
    fun `outside the worktree, the project's folder is not dropped for being the project's`() {
        assertEquals(
            listOf("/work/proj"),
            roots("/work/other", listOf("/work/proj"), projectBase = "/work/proj", worktree = false),
        )
    }

    @Test
    fun `a folder listed twice is added once, in the IDE's order`() {
        assertEquals(listOf("/b", "/a"), roots("/work", listOf("/b", "/a", "/b", "/a/")))
    }

    @Test
    fun `a folder the CLI cannot reach is left out`() {
        val toCli: (String) -> String? = { if (it.startsWith("/other")) null else it }
        assertEquals(listOf("/data/a"), roots("/work", listOf("/other/x", "/data/a"), toCli = toCli))
    }

    @Test
    fun `the comparison is made on the CLI's paths`() {
        val toCli: (String) -> String? = { it.replace("\\", "/").replace("C:", "/mnt/c") }
        assertEquals(
            listOf("/mnt/d/x"),
            roots("C:\\work", listOf("C:\\work\\sub", "D:\\x".replace("D:", "/mnt/d")), toCli = toCli),
        )
    }

    private val wsl = cliPathsFor("""\\wsl.localhost\Ubuntu\home\u\proj""", ideOnWindows = true)

    @Test
    fun `in WSL a path of the same distribution becomes the Linux path`() {
        assertEquals("/home/u/lib", cliRootOf(wsl, """\\wsl.localhost\Ubuntu\home\u\lib"""))
        assertEquals("/home/u/lib", cliRootOf(wsl, "//wsl.localhost/Ubuntu/home/u/lib"))
    }

    @Test
    fun `in WSL a path of another distribution, or one that is not a WSL path, is not passed through`() {
        assertNull(cliRootOf(wsl, """\\wsl.localhost\Other\home\u\lib"""))
        assertNull(cliRootOf(wsl, "//wsl.localhost/Other/home/u/lib"))
        assertNull(cliRootOf(wsl, "//server/share/x"))
        assertNull(cliRootOf(wsl, "relative/dir"))
    }

    @Test
    fun `in WSL a Windows drive becomes its mnt path`() {
        assertEquals("/mnt/c/Users/u/lib", cliRootOf(wsl, """C:\Users\u\lib"""))
    }

    @Test
    fun `outside WSL the path is returned as it is`() {
        assertEquals("""C:\Users\u\lib""", cliRootOf(NativeCliPaths, """C:\Users\u\lib"""))
        assertEquals("/home/u/lib", cliRootOf(NativeCliPaths, "/home/u/lib"))
    }
}

/** The planner that adds the folders to a launch only while the setting is on. */
class ExtraRootsPlannerTest {
    private class Inner : SessionLaunchPlanner {
        override suspend fun plan(
            sessionId: String,
            workingDirectory: String?,
        ) = SessionLaunch(
            dev.ukitomato.closta.providers.claude.launch.NativeProcessSpawner,
            dev.ukitomato.closta.providers.claude.launch
                .ClaudeLaunchSpec(sessionId, cwd = workingDirectory),
        )
    }

    private val log = RecordingLog()

    private fun planner(
        on: Boolean,
        launched: MutableList<Pair<String, Set<String>>> = mutableListOf(),
        roots: () -> List<String> = { listOf("/data/a", "/work/proj/sub") },
    ) = ExtraRootsPlanner(
        inner = Inner(),
        enabled = { on },
        contentRoots = roots,
        projectBase = "/work/proj",
        paths = NativeCliPaths,
        launched = { id, _, set -> launched += id to set },
        log = log,
    )

    @Test
    fun `with the setting on the launch carries the folders outside its own and says which`() =
        kotlinx.coroutines.runBlocking {
            val said = mutableListOf<Pair<String, Set<String>>>()
            val launch = planner(true, said).plan("s1", "/work/proj")
            assertEquals(listOf("/data/a"), launch.spec.additionalDirectories)
            assertEquals(listOf("s1" to setOf("/data/a")), said)
        }

    @Test
    fun `with the setting off nothing is added, said or read`() =
        kotlinx.coroutines.runBlocking {
            val said = mutableListOf<Pair<String, Set<String>>>()
            val launch =
                planner(
                    false,
                    said,
                ) { error("the roots are not read while the setting is off") }.plan("s1", "/work/proj")
            assertEquals(emptyList<String>(), launch.spec.additionalDirectories)
            assertEquals(emptyList<Pair<String, Set<String>>>(), said)
        }

    @Test
    fun `a session in a worktree is not given the project's own folder`() =
        kotlinx.coroutines.runBlocking {
            val launch = planner(true) { listOf("/work/proj", "/data/a") }.plan("s1", "/work/wt")
            assertEquals(listOf("/data/a"), launch.spec.additionalDirectories)
        }

    @Test
    fun `the log says how many folders the CLI cannot reach, and no path`() =
        kotlinx.coroutines.runBlocking {
            val wsl = cliPathsFor("""\\wsl.localhost\Ubuntu\home\u\proj""", ideOnWindows = true)
            val roots =
                listOf(
                    """\\wsl.localhost\Other\secret-a""",
                    """\\wsl.localhost\Ubuntu\home\u\lib""",
                    "//server/secret-b",
                )
            ExtraRootsPlanner(Inner(), { true }, { roots }, null, wsl, { _, _, _ -> }, log).plan("s1", "/home/u/proj")
            assertEquals(1, log.lines.size)
            assertEquals(true, log.lines.single().contains("2 content roots"), log.lines.single())
            assertEquals(false, log.lines.any { it.contains("secret") })
        }
}
