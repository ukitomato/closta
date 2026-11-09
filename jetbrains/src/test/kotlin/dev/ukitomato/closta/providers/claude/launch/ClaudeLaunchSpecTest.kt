package dev.ukitomato.closta.providers.claude.launch

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

/** How argv is built, and that env never appears on argv. */
class ClaudeLaunchSpecTest {
    @Test
    fun `minimal spec builds the stream-json argv with an =-joined session id`() {
        val argv = ClaudeLaunchSpec(sessionId = "abc-123").toArgv()
        assertEquals(
            listOf(
                "claude",
                "-p",
                "--output-format",
                "stream-json",
                "--input-format",
                "stream-json",
                "--include-partial-messages",
                "--verbose",
                "--append-system-prompt",
                ClaudeLaunchSpec.TOOL_USE_PROMPT,
                "--session-id=abc-123",
            ),
            argv,
        )
        // `=` join (injection-safe), never a separate token.
        assertTrue(argv.contains("--session-id=abc-123"))
        assertFalse(argv.contains("--session-id"))
    }

    @Test
    fun `every launch asks for the file tools over Bash, whatever the mode it starts in`() {
        // The mode can be switched to auto live, so the prompt does not depend on the starting mode.
        for (mode in listOf(null, "default", "auto", "acceptEdits")) {
            val argv = ClaudeLaunchSpec(sessionId = "s", permissionMode = mode).toArgv()
            assertEquals(1, argv.count { it == "--append-system-prompt" })
            val prompt = argv[argv.indexOf("--append-system-prompt") + 1]
            assertEquals(ClaudeLaunchSpec.TOOL_USE_PROMPT, prompt)
        }
        listOf("Read", "Edit", "Write", "Grep", "Bash").forEach {
            assertTrue(ClaudeLaunchSpec.TOOL_USE_PROMPT.contains(it), "names $it")
        }
    }

    @Test
    fun `optional flags appear only when set`() {
        val bare = ClaudeLaunchSpec(sessionId = "s").toArgv()
        assertFalse(bare.any { it == "--permission-mode" || it == "--model" || it == "--permission-prompt-tool" })

        val full =
            ClaudeLaunchSpec(
                sessionId = "s",
                permissionMode = "default",
                model = "claude-opus-4-8",
                permissionPromptToolStdio = true,
            ).toArgv()
        assertEquals(listOf("--permission-mode", "default"), full.dropWhile { it != "--permission-mode" }.take(2))
        assertEquals(listOf("--model", "claude-opus-4-8"), full.dropWhile { it != "--model" }.take(2))
        assertEquals(
            listOf("--permission-prompt-tool", "stdio"),
            full.dropWhile { it != "--permission-prompt-tool" }.take(2),
        )
    }

    @Test
    fun `a resumed session is opened by --resume of its id and never names --session-id`() {
        val id = "336ed47b-2675-4317-b3f5-a3b48abb03a2"
        val argv = ClaudeLaunchSpec(sessionId = id, resume = id, effort = "high").toArgv()

        assertTrue(argv.contains("--resume=$id"), "the id is joined with =, as --session-id's is")
        assertFalse(argv.contains("--resume"))
        assertTrue(argv.none { it.startsWith("--session-id") }, "the CLI takes --session-id with --resume only to fork")
        assertEquals(1, argv.count { it.startsWith("--resume") })
        assertEquals(
            listOf("--effort", "high"),
            argv.dropWhile { it != "--effort" }.take(2),
            "the other flags are as before",
        )
        assertTrue(ClaudeLaunchSpec(sessionId = id, resume = id).toString().contains("resume=$id"))
        // A session that is not resumed names its id, as it always did.
        val fresh = ClaudeLaunchSpec(sessionId = id).toArgv()
        assertTrue(fresh.contains("--session-id=$id"))
        assertTrue(fresh.none { it.startsWith("--resume") })
    }

    @Test
    fun `a fork opens the saved session under a new id with the three flags in order`() {
        val old = "336ed47b-2675-4317-b3f5-a3b48abb03a2"
        val new = "aaaaaaaa-2675-4317-b3f5-a3b48abb03a2"
        val argv = ClaudeLaunchSpec(sessionId = new, resume = old, forkSession = true, effort = "high").toArgv()

        val at = argv.indexOf("--resume=$old")
        assertEquals(listOf("--resume=$old", "--fork-session", "--session-id=$new"), argv.subList(at, at + 3))
        assertEquals(1, argv.count { it.startsWith("--resume") })
        assertEquals(1, argv.count { it == "--fork-session" })
        assertEquals(1, argv.count { it.startsWith("--session-id") })
        assertEquals(listOf("--effort", "high"), argv.dropWhile { it != "--effort" }.take(2))
        // Without the fork flag the argv is as before; the other flags are the same as a fork's.
        val plain = ClaudeLaunchSpec(sessionId = old, resume = old, effort = "high").toArgv()
        val forkOnly = { flag: String -> flag.startsWith("--resume") || flag == "--fork-session" }
        assertEquals(plain.filterNot(forkOnly), argv.filterNot { forkOnly(it) || it.startsWith("--session-id") })
        assertFalse(plain.contains("--fork-session"))
        val shown = ClaudeLaunchSpec(sessionId = new, resume = old, forkSession = true).toString()
        assertTrue(shown.contains("forkSession=true"))
    }

    @Test
    fun `a fork without a session to fork is a mistake of the caller`() {
        assertThrows<IllegalArgumentException> {
            ClaudeLaunchSpec(sessionId = "s", forkSession = true).toArgv()
        }
    }

    @Test
    fun `an effort is one --effort flag with its level, and none leaves the flag out`() {
        val high = ClaudeLaunchSpec(sessionId = "s", effort = "high").toArgv()
        assertEquals(listOf("--effort", "high"), high.dropWhile { it != "--effort" }.take(2))
        assertEquals(1, high.count { it == "--effort" })
        assertFalse(ClaudeLaunchSpec(sessionId = "s", effort = null).toArgv().contains("--effort"))
        assertTrue(ClaudeLaunchSpec(sessionId = "s", effort = "max").toString().contains("effort=max"))
    }

    @Test
    fun settingsFlagWhenSandboxOn() {
        val argv = ClaudeLaunchSpec("s", sandbox = true).toArgv()
        val at = argv.indexOf("--settings")
        assertEquals("""{"sandbox":{"enabled":true,"failIfUnavailable":true}}""", argv[at + 1])
    }

    @Test
    fun noSettingsFlagWhenSandboxOff() {
        assertFalse("--settings" in ClaudeLaunchSpec("s").toArgv())
    }

    @Test
    fun settingsFlagWithResume() {
        // 39's second CLI: `--resume=<id>` and the sandbox's `--settings` together, the settings after the others.
        val argv = ClaudeLaunchSpec("s", resume = "s", effort = "high", sandbox = true).toArgv()
        assertTrue("--resume=s" in argv)
        assertEquals(1, argv.count { it == "--settings" })
        assertEquals(argv.indexOf("--effort") + 2, argv.indexOf("--settings"), "--settings comes right after --effort")
        assertEquals(ClaudeLaunchSpec.SANDBOX_SETTINGS, argv[argv.indexOf("--settings") + 1])
    }

    @Test
    fun toStringNamesSandbox() {
        val shown = ClaudeLaunchSpec("s", sandbox = true, env = mapOf("ANTHROPIC_AUTH_TOKEN" to "sk-secret")).toString()
        assertTrue(shown.contains("sandbox=true"), shown)
        assertFalse(shown.contains("sk-secret"), shown)
    }

    @Test
    fun `env is never placed on argv`() {
        val argv =
            ClaudeLaunchSpec(
                sessionId = "s",
                env = mapOf("ANTHROPIC_AUTH_TOKEN" to "sk-secret-value", "HTTPS_PROXY" to "http://proxy"),
            ).toArgv()
        assertFalse(argv.any { it.contains("sk-secret-value") }) { "secret env value must not appear on argv" }
        assertFalse(argv.any { it.contains("ANTHROPIC_AUTH_TOKEN") }) { "env keys must not appear on argv" }
        assertFalse(argv.any { it.contains("HTTPS_PROXY") })
    }

    @Test
    fun `the child env switches file checkpointing on and the spec env wins over it`() {
        val name = "CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING"
        val plain = ClaudeLaunchSpec(sessionId = "s", env = mapOf("K" to "v")).childEnv()
        assertEquals("true", plain[name])
        assertEquals("v", plain["K"])
        assertFalse(plain.containsKey("CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING"), "the DISABLE name is never added")
        assertEquals("false", ClaudeLaunchSpec(sessionId = "s", env = mapOf(name to "false")).childEnv()[name])
        // The spec's own env and its toString are as before: the secret count is of the spec's env only.
        assertTrue(ClaudeLaunchSpec(sessionId = "s", env = mapOf("K" to "v")).toString().contains("env=<1 redacted>"))
    }
}
