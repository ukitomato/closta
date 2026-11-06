package dev.ukitomato.closta.platforms.intellij.session

import dev.ukitomato.closta.platforms.intellij.auth.SignInOutcome
import dev.ukitomato.closta.platforms.intellij.settings.ProviderLaunch
import dev.ukitomato.closta.platforms.intellij.store.ProviderId
import dev.ukitomato.closta.providers.claude.auth.SessionCredentials
import dev.ukitomato.closta.providers.claude.launch.AnthropicLaunch
import dev.ukitomato.closta.providers.claude.launch.BedrockConfig
import dev.ukitomato.closta.providers.claude.launch.BedrockLaunch
import dev.ukitomato.closta.providers.claude.launch.ClaudeLaunchSpec
import dev.ukitomato.closta.providers.claude.launch.FilteringProcessSpawner
import dev.ukitomato.closta.providers.claude.launch.NativeProcessSpawner
import dev.ukitomato.closta.providers.claude.launch.ProcessExitException
import dev.ukitomato.closta.providers.claude.launch.WorkingDirectoryMissingException
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.io.IOException

/** How failures are sorted and worded, what the notice shows, and how a launch is planned and gated. */
class SessionStatusTest {
    private val everyFailure =
        listOf(
            SessionFailure.LaunchFailed("Cannot run program \"claude\": error=2, No such file or directory"),
            SessionFailure.CommandNotFound,
            SessionFailure.EndedAbnormally("exit code 3"),
            SessionFailure.VersionCheckFailed("exit code 2"),
            SessionFailure.PlanFailed(IllegalStateException::class.java.name),
            SessionFailure.ProjectNotTrusted,
            SessionFailure.BedrockSignInCancelled,
            SessionFailure.BedrockKeysMissing,
            SessionFailure.BedrockSecretsUnavailable("The keychain is locked"),
            SessionFailure.BedrockSettingsChanged,
        )

    @Test
    fun `every failure says what went wrong and what to do`() {
        everyFailure.forEach {
            assertTrue(it.cause.isNotBlank(), "cause of $it")
            assertTrue(it.remedy.isNotBlank(), "remedy of $it")
        }
    }

    @Test
    fun `127 is worded as a PATH problem, apart from a process that could not be started`() {
        val notFound = SessionFailure.CommandNotFound
        val cannotStart = SessionFailure.LaunchFailed("error=2")
        assertTrue(notFound.cause.contains("PATH"))
        assertTrue(notFound.cause.contains("127"))
        assertNotEquals(notFound.cause, cannotStart.cause)
        assertFalse(cannotStart.cause.contains("127"))
    }

    @Test
    fun `each remedy is a step that leads somewhere`() {
        // The process's error output is not kept, so idea.log has nothing more to say; a terminal does.
        val abnormal = SessionFailure.EndedAbnormally("exit code 3").remedy
        assertTrue(abnormal.contains("terminal"))
        assertFalse(abnormal.contains("idea.log"))
        // The IDE keeps the PATH it started with: a changed PATH needs a new IDE, not just a restarted session.
        listOf(SessionFailure.LaunchFailed("error=2"), SessionFailure.CommandNotFound).forEach {
            assertTrue(it.remedy.contains("restart the IDE"), "remedy of $it")
            assertTrue(it.remedy.contains("Restart Session"), "remedy of $it")
        }
        assertTrue(SessionFailure.ProjectNotTrusted.remedy.contains("Trust Project"))
        assertTrue(SessionFailure.BedrockSignInCancelled.remedy.contains("Restart Session"))
        assertTrue(SessionFailure.BedrockKeysMissing.remedy.contains("Settings | Tools | Closta"))
        assertTrue(SessionFailure.BedrockSecretsUnavailable(null).remedy.contains("Passwords"))
        assertTrue(SessionFailure.BedrockSettingsChanged.remedy.contains("Restart Session"))
    }

    @Test
    fun `the four Bedrock sign-in failures say different things, and the storage's reason shows`() {
        val bedrock =
            listOf(
                SessionFailure.BedrockSignInCancelled,
                SessionFailure.BedrockKeysMissing,
                SessionFailure.BedrockSecretsUnavailable(null),
                SessionFailure.BedrockSettingsChanged,
            )
        assertEquals(bedrock.size, bedrock.map { it.cause }.toSet().size)
        assertEquals(bedrock.size, bedrock.map { it.remedy }.toSet().size)
        val locked = SessionFailure.BedrockSecretsUnavailable("The keychain is locked")
        assertTrue(locked.cause.contains("(The keychain is locked)"))
        assertTrue(
            checkNotNull(SessionNotice.of(SessionStatus.Failed(locked))).toHtml(400).contains("keychain is locked"),
        )
        assertFalse(SessionFailure.BedrockSecretsUnavailable(null).cause.contains("("))
    }

    @Test
    fun `failures are sorted by where they came from`() {
        assertEquals(SessionFailure.CommandNotFound, SessionFailure.ended(ProcessExitException(127)))
        assertEquals(SessionFailure.EndedAbnormally("exit code 3"), SessionFailure.ended(ProcessExitException(3)))
        assertEquals(
            SessionFailure.EndedAbnormally(IOException::class.java.name),
            SessionFailure.ended(IOException("broken pipe")),
        )
        assertEquals(SessionFailure.LaunchFailed("error=2"), SessionFailure.launchFailed(IOException("error=2")))
        assertEquals(
            SessionFailure.LaunchFailed(SecurityException::class.java.name),
            SessionFailure.launchFailed(SecurityException("secret-bearing message")),
        )
        assertEquals(SessionFailure.CommandNotFound, SessionFailure.versionExit(127))
        assertEquals(SessionFailure.VersionCheckFailed("exit code 1"), SessionFailure.versionExit(1))
    }

    @Test
    fun `a working folder that is not there is told apart from a command that is not there`() {
        val missing = SessionFailure.launchFailed(WorkingDirectoryMissingException("/work/wt", IOException("error=2")))
        assertEquals(SessionFailure.WorkingDirectoryMissing("/work/wt"), missing)
        assertTrue(missing.cause.contains("/work/wt")) { missing.cause }
        assertFalse(missing.remedy.contains("Install")) { missing.remedy }
        assertTrue(missing.remedy.contains("New Conversation")) { missing.remedy }
        assertEquals(SessionFailure.LaunchFailed("error=2"), SessionFailure.launchFailed(IOException("error=2")))
        assertEquals(
            SessionFailure.LaunchFailed(SecurityException::class.java.name),
            SessionFailure.launchFailed(SecurityException("x")),
        )
    }

    @Test
    fun `the notice shows failures and a normal end, and nothing while starting, running or closed`() {
        assertNull(SessionNotice.of(SessionStatus.Starting))
        assertNull(SessionNotice.of(SessionStatus.Closed))
        val failed = SessionNotice.of(SessionStatus.Failed(SessionFailure.CommandNotFound))
        assertEquals(SessionFailure.CommandNotFound.cause, failed?.cause)
        assertTrue(
            SessionNotice
                .of(SessionStatus.Ended)
                ?.remedy
                .orEmpty()
                .contains("Restart Session"),
        )
    }

    @Test
    fun `the notice escapes what it is given and sits in a block of the given width`() {
        val html = SessionNotice("<script>a & b</script>", "x > y").toHtml(320)
        assertTrue(html.contains("<div width=\"320\">"))
        assertFalse(html.contains("<script>"))
        assertTrue(html.contains("&lt;script&gt;a &amp; b&lt;/script&gt;"))
        assertTrue(html.contains("x &gt; y"))
    }

    @Test
    fun `the process list destroys what it holds, and at once what arrives after it closed`() {
        val live = LiveProcesses()
        val early = FakeProcess()
        live.track(early, Process::destroy)
        live.destroyAll()
        assertTrue(early.destroyed)
        val late = FakeProcess()
        live.track(late, Process::destroy)
        assertTrue(late.destroyed)
    }

    @Test
    fun `the launch follows the active provider and gives a Anthropic one its environment`() =
        runBlocking {
            val env = AnthropicLaunch.env("opus")
            val launch =
                NativeSessionLaunchPlanner(
                    activeLaunch = { ProviderLaunch.Env(env) },
                    signIn = { _, _ -> error("Anthropic does not sign in") },
                ).plan(SESSION_ID, WORKING_DIR)
            assertSame(NativeProcessSpawner, launch.spawner)
            assertEquals(SESSION_ID, launch.spec.sessionId)
            assertEquals(WORKING_DIR, launch.spec.cwd)
            assertEquals(env, launch.spec.env)
            assertFalse(launch.toString().contains("opus"))
        }

    @Test
    fun `an Amazon Bedrock provider signs in, then launches with the Bedrock env and the credentials`() =
        runBlocking {
            val bedrock = bedrockLaunch()
            var asked: ProviderLaunch.NeedsBedrockSignIn? = null
            val launch =
                NativeSessionLaunchPlanner(
                    activeLaunch = { bedrock },
                    signIn = { launch, _ ->
                        asked = launch
                        SignInOutcome.SignedIn(SessionCredentials(TMP_KEY_ID, TMP_SECRET, TMP_TOKEN, 1L))
                    },
                ).plan(SESSION_ID, WORKING_DIR)

            assertSame(bedrock, asked)
            val spawner = launch.spawner as FilteringProcessSpawner
            assertEquals(BedrockLaunch.INHERITED_KEYS_TO_DROP, spawner.dropped)
            assertEquals("1", launch.spec.env["CLAUDE_CODE_USE_BEDROCK"])
            assertEquals("eu-west-1", launch.spec.env["AWS_REGION"])
            assertEquals(TMP_KEY_ID, launch.spec.env["AWS_ACCESS_KEY_ID"])
            assertEquals(TMP_SECRET, launch.spec.env["AWS_SECRET_ACCESS_KEY"])
            assertEquals(TMP_TOKEN, launch.spec.env["AWS_SESSION_TOKEN"])
            assertEquals(SESSION_ID, launch.spec.sessionId)
            assertEquals(WORKING_DIR, launch.spec.cwd)
            listOf(TMP_KEY_ID, TMP_SECRET, TMP_TOKEN).forEach { assertFalse(launch.toString().contains(it)) }
        }

    @Test
    fun `a Bedrock sign-in that ends without credentials is a failure the user can act on`() {
        mapOf(
            SignInOutcome.Cancelled to SessionFailure.BedrockSignInCancelled,
            SignInOutcome.NoLongTermKeys to SessionFailure.BedrockKeysMissing,
            SignInOutcome.StoreUnavailable("The keychain is locked") to
                SessionFailure.BedrockSecretsUnavailable("The keychain is locked"),
        ).forEach { (outcome, failure) ->
            val refused =
                assertThrows<SessionStartException> {
                    runBlocking {
                        NativeSessionLaunchPlanner(
                            { bedrockLaunch() },
                        ) { _, _ -> outcome }.plan(SESSION_ID, WORKING_DIR)
                    }
                }
            assertEquals(failure, refused.failure)
        }
    }

    @Test
    fun `settings changed while signing in plan once more, with the active provider as it is now`() =
        runBlocking {
            val anthropic = ProviderLaunch.Env(AnthropicLaunch.env(null))
            var active: ProviderLaunch = bedrockLaunch()
            var asked = 0
            val launch =
                NativeSessionLaunchPlanner({ active }) { _, _ ->
                    asked++
                    active = anthropic
                    SignInOutcome.SettingsChanged
                }.plan(SESSION_ID, WORKING_DIR)

            assertEquals(1, asked)
            assertSame(NativeProcessSpawner, launch.spawner)
            assertEquals(anthropic.env, launch.spec.env)
        }

    @Test
    fun `settings that change again on the second sign-in are a failure`() {
        var asked = 0
        val refused =
            assertThrows<SessionStartException> {
                runBlocking {
                    NativeSessionLaunchPlanner({ bedrockLaunch() }) { _, _ ->
                        asked++
                        SignInOutcome.SettingsChanged
                    }.plan(SESSION_ID, WORKING_DIR)
                }
            }
        assertEquals(SessionFailure.BedrockSettingsChanged, refused.failure)
        assertEquals(2, asked)
    }

    @Test
    fun `the sign-in's check reads the active provider when it is asked, and ignores the display name`() =
        runBlocking {
            val asked = bedrockLaunch()
            var active: ProviderLaunch = asked
            var check: (suspend () -> Boolean)? = null
            NativeSessionLaunchPlanner({ active }) { _, stillCurrent ->
                check = stillCurrent
                SignInOutcome.SignedIn(SessionCredentials(TMP_KEY_ID, TMP_SECRET, TMP_TOKEN, 1L))
            }.plan(SESSION_ID, WORKING_DIR)
            val current = checkNotNull(check)

            assertTrue(current())
            active = bedrockLaunch(asked.providerId, name = "Renamed")
            assertTrue(current())
            listOf(
                bedrockLaunch(asked.providerId, config = BedrockConfig(region = "us-east-1")),
                bedrockLaunch(asked.providerId, config = BedrockConfig(region = "eu-west-1", model = "opus")),
                bedrockLaunch(asked.providerId, device = "arn:aws:iam::123456789012:mfa/other"),
                bedrockLaunch(asked.providerId, duration = 3_600),
                bedrockLaunch(),
                ProviderLaunch.Env(AnthropicLaunch.env(null)),
            ).forEach {
                active = it
                assertFalse(current()) { "the same as before: $it" }
            }
        }

    @Test
    fun `an untrusted project is stopped before the Bedrock sign-in asks`() {
        var asked = 0
        val planner =
            NativeSessionLaunchPlanner({ bedrockLaunch() }) { _, _ ->
                asked++
                SignInOutcome.Cancelled
            }
        val refused =
            assertThrows<SessionStartException> {
                runBlocking { TrustGatedPlanner({ false }, planner).plan(SESSION_ID, WORKING_DIR) }
            }
        assertEquals(SessionFailure.ProjectNotTrusted, refused.failure)
        assertEquals(0, asked)
    }

    private fun bedrockLaunch(
        id: ProviderId = ProviderId.generate(),
        name: String = "Bedrock dev",
        config: BedrockConfig = BedrockConfig(region = "eu-west-1"),
        device: String = "GAHT12345678",
        duration: Int = 43_200,
    ) = ProviderLaunch.NeedsBedrockSignIn(
        id,
        config,
        providerName = name,
        mfaDevice = device,
        sessionDurationSeconds = duration,
    )

    @Test
    fun `an untrusted project gets no launch, and a trusted one the planner's`() {
        var planned = 0
        val inner =
            object : SessionLaunchPlanner {
                override suspend fun plan(
                    sessionId: String,
                    workingDirectory: String?,
                ): SessionLaunch {
                    planned++
                    return SessionLaunch(NativeProcessSpawner, ClaudeLaunchSpec(sessionId = sessionId))
                }
            }
        val refused =
            assertThrows<SessionStartException> {
                runBlocking { TrustGatedPlanner({ false }, inner).plan(SESSION_ID, WORKING_DIR) }
            }
        assertEquals(SessionFailure.ProjectNotTrusted, refused.failure)
        assertEquals(0, planned)
        val launch = runBlocking { TrustGatedPlanner({ true }, inner).plan(SESSION_ID, WORKING_DIR) }
        assertEquals(SESSION_ID, launch.spec.sessionId)
        assertEquals(1, planned)
    }

    private companion object {
        const val SESSION_ID = "0f8fad5b-d9cb-469f-a165-70867728950e"
        const val WORKING_DIR = "/work/project"
        const val TMP_KEY_ID = "ASIA-status-marker-id"
        const val TMP_SECRET = "status-marker-secret"
        const val TMP_TOKEN = "status-marker-token"
    }
}
