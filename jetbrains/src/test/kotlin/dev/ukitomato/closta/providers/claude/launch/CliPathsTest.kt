package dev.ukitomato.closta.providers.claude.launch

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Test

/** The mouth between the CLI's paths and the IDE's, by string rules only (no real file system). */
class CliPathsTest {
    private val slash = cliPathsFor("//wsl.localhost/Ubuntu/home/u/proj", ideOnWindows = true)
    private val back = cliPathsFor("""\\wsl${'$'}\Ubuntu\home\u\proj""", ideOnWindows = true)

    @Test
    fun `a Linux path gets the project's own head`() {
        assertEquals("//wsl.localhost/Ubuntu/home/u/proj/a.kt", slash.toIde("/home/u/proj/a.kt"))
        assertEquals("//wsl.localhost/Ubuntu/etc/hosts", slash.toIde("/etc/hosts"))
        assertEquals("""\\wsl${'$'}\Ubuntu\home\u\proj\a.kt""", back.toIde("/home/u/proj/a.kt"))
        assertEquals("relative/a.kt", slash.toIde("relative/a.kt"))
    }

    @Test
    fun `the root of the distribution gives the same head, with or without a trailing separator`() {
        listOf("//wsl.localhost/Ubuntu", "//wsl.localhost/Ubuntu/").forEach {
            assertEquals("//wsl.localhost/Ubuntu/x", cliPathsFor(it, true).toIde("/x"), it)
        }
    }

    @Test
    fun `a UNC path of the same distribution becomes the Linux path whatever the host, separators or case`() {
        assertEquals("/home/u/x", slash.toCli("//wsl.localhost/Ubuntu/home/u/x"))
        assertEquals("/home/u/x", slash.toCli("""\\wsl${'$'}\ubuntu\home\u\x"""))
        assertEquals("/home/u/x", back.toCli("//WSL.LOCALHOST/UBUNTU/home/u/x"))
    }

    @Test
    fun `another distribution, a relative path and a Linux path stay as they are`() {
        assertEquals("//wsl.localhost/Debian/x", slash.toCli("//wsl.localhost/Debian/x"))
        assertEquals("src/a.kt", slash.toCli("src/a.kt"))
        assertEquals("/home/u/x", slash.toCli("/home/u/x"))
        assertEquals("//server/share/x", slash.toCli("//server/share/x"))
    }

    @Test
    fun `a drive path and its mnt form go both ways and close`() {
        assertEquals("/mnt/c/Users/u/a.txt", slash.toCli("""C:\Users\u\a.txt"""))
        assertEquals("/mnt/c/Users/u/a.txt", slash.toCli("C:/Users/u/a.txt"))
        assertEquals("""C:\Users\u\a.txt""", slash.toIde("/mnt/c/Users/u/a.txt"))
        assertEquals("""C:\""", slash.toIde("/mnt/c"))
        assertEquals("""C:\Users\u\a.txt""", slash.toIde(slash.toCli("""C:\Users\u\a.txt""")))
        assertEquals("//wsl.localhost/Ubuntu/mnt/cc/x", slash.toIde("/mnt/cc/x"))
    }

    @Test
    fun `a path that is not a WSL one is not changed in either direction`() {
        listOf(
            cliPathsFor("/work/proj", ideOnWindows = true),
            cliPathsFor("//wsl.localhost/Ubuntu/home/u/proj", ideOnWindows = false),
            cliPathsFor(null, ideOnWindows = true),
            cliPathsFor("//server/share/proj", ideOnWindows = true),
        ).forEach { paths ->
            assertSame(NativeCliPaths, paths)
            listOf(
                "/home/u/a.kt",
                """C:\x\a.txt""",
                "//wsl.localhost/Ubuntu/x",
                "file:///home/u/a.kt",
                "a.kt",
            ).forEach {
                assertEquals(it, paths.toIde(it))
                assertEquals(it, paths.toCli(it))
                assertEquals(it, paths.toIdeArgument(it))
            }
        }
    }

    @Test
    fun `a diagnostics argument is the IDE's path when it is file triple slash or a Linux path`() {
        assertEquals("//wsl.localhost/Ubuntu/home/u/a.kt", slash.toIdeArgument("file:///home/u/a.kt"))
        assertEquals("//wsl.localhost/Ubuntu/home/u/a b.kt", slash.toIdeArgument("file:///home/u/a%20b.kt"))
        assertEquals("//wsl.localhost/Ubuntu/home/u/a.kt", slash.toIdeArgument("/home/u/a.kt"))
        assertEquals("""C:\Users\u\a.kt""", slash.toIdeArgument("/mnt/c/Users/u/a.kt"))
        assertEquals("""C:/Users/u/a.kt""", slash.toIdeArgument("file:///C:/Users/u/a.kt"))
    }

    @Test
    fun `an argument that is not a plain file triple slash URI is left to the IDE's own checks`() {
        listOf(
            "file://host/home/u/a.kt",
            "file:///home/u/a.kt?x=1",
            "file:///home/u/a.kt#L3",
            "file:foo",
            "file:/home/u/a.kt",
            "file:///bad%zz",
            "src/a.kt",
        ).forEach { assertEquals(it, slash.toIdeArgument(it), it) }
    }

    @Test
    fun `the uri the CLI is told is file triple slash for a Linux path, and the IDE's own form otherwise`() {
        assertEquals("file:///home/u/a.kt", slash.toCliUri("//wsl.localhost/Ubuntu/home/u/a.kt"))
        assertEquals("file:///home/u/a%20b.kt", slash.toCliUri("""\\wsl${'$'}\Ubuntu\home\u\a b.kt"""))
        assertEquals("file:///work/a.kt", NativeCliPaths.toCliUri("/work/a.kt"))
        // Not in this distribution: nothing to translate to; the same form as without a mouth.
        assertEquals(NativeCliPaths.toCliUri("/etc/x"), slash.toCliUri("/etc/x"))
    }
}
