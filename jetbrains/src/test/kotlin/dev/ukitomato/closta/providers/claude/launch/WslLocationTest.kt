package dev.ukitomato.closta.providers.claude.launch

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** The rules that tell a WSL project from another and turn its paths. */
class WslLocationTest {
    private fun parse(path: String?) = WslLocation.parse(path, ideOnWindows = true)

    @Test
    fun `a UNC path on a WSL host is split into the distribution and the Linux path`() {
        assertEquals(WslLocation("Ubuntu", "/home/u/p"), parse("\\\\wsl.localhost\\Ubuntu\\home\\u\\p"))
        assertEquals(WslLocation("Ubuntu", "/home/u/p"), parse("//wsl.localhost/Ubuntu/home/u/p"))
        assertEquals(WslLocation("Ubuntu-26.04", "/home/u/p"), parse("\\\\wsl$\\Ubuntu-26.04\\home\\u\\p"))
        assertEquals(WslLocation("Ubuntu", "/"), parse("\\\\WSL.LOCALHOST\\Ubuntu\\"))
        assertEquals(WslLocation("Ubuntu", "/"), parse("\\\\wsl.localhost\\Ubuntu"))
    }

    @Test
    fun `anything else is not a WSL project`() {
        assertNull(parse("C:\\work\\p"))
        assertNull(parse("/home/u/p"))
        assertNull(parse("\\\\server\\share\\p"))
        assertNull(parse("\\\\wsl.localhost\\"))
        assertNull(parse("\\\\wsl.localhost"))
        assertNull(parse(null))
        assertNull(WslLocation.parse("\\\\wsl.localhost\\Ubuntu\\home\\u\\p", ideOnWindows = false))
    }

    @Test
    fun `the UNC path of a Linux path`() {
        val location = WslLocation("Ubuntu", "/home/u/p")
        assertEquals("\\\\wsl.localhost\\Ubuntu\\home\\u\\.claude", location.toUnc("/home/u/.claude"))
        assertEquals("\\\\wsl.localhost\\Ubuntu\\", location.toUnc("/"))
    }

    @Test
    fun `the working folder is the location's own path, or the Linux part of a UNC path in the same distribution`() {
        val location = WslLocation("Ubuntu", "/home/u/p")
        assertEquals("/home/u/p", location.linuxDirectoryOf(null))
        assertEquals("/home/u/p/wt", location.linuxDirectoryOf("\\\\wsl.localhost\\Ubuntu\\home\\u\\p\\wt"))
        assertEquals("/srv", location.linuxDirectoryOf("//WSL$/UBUNTU/srv"))
    }

    @Test
    fun `a working folder in another distribution or outside WSL cannot be started`() {
        val location = WslLocation("Ubuntu", "/home/u/p")
        assertThrows(WslUnavailableException::class.java) { location.linuxDirectoryOf("\\\\wsl.localhost\\Debian\\x") }
        assertThrows(WslUnavailableException::class.java) { location.linuxDirectoryOf("C:\\work") }
    }

    private fun answer(
        home: String,
        config: String = "",
    ) = "CLAUDE_AGENT_HOME=$home\nCLAUDE_AGENT_CONFIG=$config\n"

    @Test
    fun `the record place is the configured directory or HOME slash dot claude, as a UNC path`() {
        val location = WslLocation("Ubuntu", "/home/u/p")
        assertEquals("\\\\wsl.localhost\\Ubuntu\\home\\u\\.claude", location.recordHome(answer("/home/u")))
        assertEquals("\\\\wsl.localhost\\Ubuntu\\opt\\cc", location.recordHome(answer("/home/u", "/opt/cc")))
        assertEquals(
            "\\\\wsl.localhost\\Ubuntu\\opt\\cc",
            location.recordHome(answer("/home/u", "/opt/cc").replace("\n", "\r\n")),
        )
    }

    @Test
    fun `lines the profile prints before or after the answer are skipped`() {
        val location = WslLocation("Ubuntu", "/home/u/p")
        val home = "\\\\wsl.localhost\\Ubuntu\\home\\u\\.claude"
        assertEquals(home, location.recordHome("Welcome to Ubuntu\nnvm: using node 20\n" + answer("/home/u")))
        assertEquals(home, location.recordHome(answer("/home/u") + "logout banner\n/opt/other\n"))
        assertEquals(home, location.recordHome("noise\n" + answer("/home/u") + "tail\n"))
    }

    @Test
    fun `no record place without the mark lines, or when HOME is unusable`() {
        val location = WslLocation("Ubuntu", "/home/u/p")
        assertNull(location.recordHome("/home/u\n\n"))
        assertNull(location.recordHome("Welcome\n/home/u\n/opt/cc\n"))
        assertNull(location.recordHome(""))
        assertNull(location.recordHome(answer("")))
        assertNull(location.recordHome(answer("home/u")))
        assertNull(location.recordHome(answer("/home/u").substringAfter('\n')))
        assertNull(location.recordHome(answer("", "relative")))
    }

    @Test
    fun `the probe asks for both values behind their marks`() {
        val script = WslLocation.PROBE_ARGV.last()
        assertTrue(script.contains(WslLocation.HOME_MARK) && script.contains(WslLocation.CONFIG_MARK)) { script }
    }
}
