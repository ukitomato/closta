package dev.ukitomato.closta.platforms.intellij.auth

import dev.ukitomato.closta.core.interfaces.Secret
import dev.ukitomato.closta.core.interfaces.SecretStoreUnavailableException
import dev.ukitomato.closta.platforms.intellij.settings.LongTermKeys
import dev.ukitomato.closta.platforms.intellij.store.ProviderId
import dev.ukitomato.closta.platforms.intellij.store.ProviderSecrets
import dev.ukitomato.closta.platforms.intellij.store.SecretSlot
import dev.ukitomato.closta.providers.claude.auth.SessionCredentials
import dev.ukitomato.closta.providers.claude.auth.SessionTokenException
import dev.ukitomato.closta.providers.claude.auth.StsFailureReason
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.cancel
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.util.concurrent.CountDownLatch
import kotlin.time.Duration.Companion.seconds

/**
 * The sign-in flow against fakes: the store is a map, STS answers from a script, the prompt types scripted codes, and
 * the clock stands still. Every secret is a marker, and the last test looks for them in everything the flow prints.
 */
class BedrockSignInFlowTest {
    private val background = CoroutineScope(SupervisorJob())
    private val store = MemorySecretStore()
    private val log = RecordingSignInLog()
    private val id = checkNotNull(ProviderId.parse("6f1c2a5e-4b7d-4e2a-9c3b-1d2e3f4a5b6c"))
    private val request = SignInRequest(id, "Bedrock dev", "GAHT12345678", "us-east-1", DURATION)
    private val sessionKey = ProviderSecrets.key(id, SecretSlot.BEDROCK_SESSION)
    private val keysKey = ProviderSecrets.key(id, SecretSlot.BEDROCK_LONG_TERM)

    /** The caller's check for a sign-in whose settings did not change. */
    private val same: suspend () -> Boolean = { true }

    @AfterEach
    fun stop() = background.cancel()

    private fun fresh(expiresAt: Long = NOW + HOUR) = SessionCredentials(TMP_KEY_ID, TMP_SECRET, TMP_TOKEN, expiresAt)

    private fun refusal(
        reason: StsFailureReason,
        code: String?,
    ): Result<SessionCredentials> = Result.failure(SessionTokenException("StsException", reason, code))

    private fun flow(resolver: ScriptedResolver) = BedrockSignInFlow(store, resolver, background, { NOW }, log)

    private fun succeeding() = ScriptedResolver { Result.success(fresh()) }

    private fun refusingWrongCode() =
        ScriptedResolver {
            if (it.tokenCode == WRONG_CODE) {
                refusal(StsFailureReason.MFA_CODE_REJECTED, "AccessDenied")
            } else {
                Result.success(fresh())
            }
        }

    private fun failing(
        operation: String,
        key: String,
        failure: () -> Exception,
    ): (String, String) -> Exception? = { op, k -> if (op == operation && k == key) failure() else null }

    private fun withKeys() = store.entries.put(keysKey, LongTermKeys(LONG_KEY_ID, LONG_SECRET).toSecret())

    private fun saved(credentials: SessionCredentials) =
        store.entries.put(sessionKey, BedrockSessionSecret.toSecret(credentials))

    @Test
    fun `saved credentials with fifteen minutes or more are used without asking`() =
        runBlocking {
            withKeys()
            saved(fresh(NOW + SessionReuse.MARGIN_MS + 1))
            val resolver = ScriptedResolver { Result.success(fresh()) }
            val prompt = ScriptedPrompt(listOf("123456"))

            val outcome = flow(resolver).signIn(request, prompt, same)

            assertTrue(outcome is SignInOutcome.SignedIn)
            assertEquals(TMP_TOKEN, (outcome as SignInOutcome.SignedIn).credentials.sessionToken)
            assertTrue(prompt.requests.isEmpty())
            assertTrue(resolver.requests.isEmpty())
        }

    @Test
    fun `saved credentials that are short, broken or unreadable make it ask`() =
        runBlocking {
            withKeys()
            val cases =
                listOf<() -> Unit>(
                    { saved(fresh(NOW + SessionReuse.MARGIN_MS)) },
                    { store.entries[sessionKey] = Secret("not credentials") },
                    {
                        saved(fresh())
                        store.failOn = failing("get", sessionKey) { IllegalStateException() }
                    },
                )
            cases.forEach { prepare ->
                store.entries.remove(sessionKey)
                store.failOn = { _, _ -> null }
                prepare()
                val prompt = ScriptedPrompt(listOf("123456"))
                val outcome = flow(ScriptedResolver { Result.success(fresh()) }).signIn(request, prompt, same)
                assertEquals(1, prompt.requests.size)
                assertTrue(outcome is SignInOutcome.SignedIn)
            }
        }

    @Test
    fun `no long-term keys means no prompt`() =
        runBlocking {
            val prompt = ScriptedPrompt(listOf("123456"))
            assertEquals(SignInOutcome.NoLongTermKeys, flow(succeeding()).signIn(request, prompt, same))
            store.entries[keysKey] = Secret("not keys")
            assertEquals(SignInOutcome.NoLongTermKeys, flow(succeeding()).signIn(request, prompt, same))
            assertTrue(prompt.requests.isEmpty())
        }

    @Test
    fun `a store that does not answer gives the store's reason without the class name, and nothing else`() =
        runBlocking {
            val prompt = ScriptedPrompt(listOf("123456"))
            store.failOn = { op, key ->
                if (op == "get" && key == keysKey) {
                    SecretStoreUnavailableException("The keychain is locked (com.example.KeychainLocked)")
                } else {
                    null
                }
            }
            assertEquals(
                SignInOutcome.StoreUnavailable("The keychain is locked"),
                flow(ScriptedResolver { Result.success(fresh()) }).signIn(request, prompt, same),
            )
            store.failOn = failing("get", keysKey) { IllegalStateException(LONG_SECRET) }
            assertEquals(
                SignInOutcome.StoreUnavailable(null),
                flow(ScriptedResolver { Result.success(fresh()) }).signIn(request, prompt, same),
            )
            assertTrue(prompt.requests.isEmpty())
        }

    @Test
    fun `closing the prompt is cancelling`() =
        runBlocking {
            withKeys()
            assertEquals(
                SignInOutcome.Cancelled,
                flow(ScriptedResolver { Result.success(fresh()) }).signIn(request, ScriptedPrompt(emptyList()), same),
            )
            assertNull(store.entries[sessionKey])
        }

    @Test
    fun `a refused code is not sent twice, and the next code signs in`() =
        runBlocking {
            withKeys()
            val resolver = refusingWrongCode()
            val prompt = ScriptedPrompt(listOf(WRONG_CODE, WRONG_CODE, "12345", RIGHT_CODE))

            val outcome = flow(resolver).signIn(request, prompt, same)

            assertTrue(outcome is SignInOutcome.SignedIn)
            assertEquals(listOf(WRONG_CODE, RIGHT_CODE), resolver.requests.map { it.tokenCode })
            assertTrue(prompt.results[0] is ExchangeResult.Refused)
            assertEquals(ExchangeResult.NotSent(MfaCodes.ALREADY_TRIED), prompt.results[1])
            assertEquals(ExchangeResult.NotSent(MfaCodes.NOT_SIX_DIGITS), prompt.results[2])
            assertTrue(prompt.results[3] is ExchangeResult.SignedIn)
        }

    @Test
    fun `a code that never reached AWS can be sent again`() =
        runBlocking {
            withKeys()
            var first = true
            val resolver =
                ScriptedResolver {
                    if (first) {
                        first = false
                        refusal(StsFailureReason.UNREACHABLE, null)
                    } else {
                        Result.success(fresh())
                    }
                }

            val outcome = flow(resolver).signIn(request, ScriptedPrompt(listOf(RIGHT_CODE, RIGHT_CODE)), same)

            assertTrue(outcome is SignInOutcome.SignedIn)
            assertEquals(2, resolver.requests.size)
        }

    @Test
    fun `STS gets the code, the device, the region, the duration and the keys, and the result is saved`() =
        runBlocking {
            withKeys()
            val resolver = ScriptedResolver { Result.success(fresh()) }

            flow(resolver).signIn(request, ScriptedPrompt(listOf(" $RIGHT_CODE ")), same)

            val sent = resolver.requests.single()
            assertEquals(RIGHT_CODE, sent.tokenCode)
            assertEquals("GAHT12345678", sent.deviceArn)
            assertEquals("us-east-1", sent.region)
            assertEquals(DURATION, sent.durationSeconds)
            assertEquals(LONG_KEY_ID, sent.longTermAccessKeyId)
            assertEquals(LONG_SECRET, sent.longTermSecretAccessKey)
            val back = BedrockSessionSecret.fromSecret(checkNotNull(store.entries[sessionKey]))
            assertEquals(TMP_TOKEN, back?.sessionToken)
            assertEquals(NOW + HOUR, back?.expirationEpochMillis)
        }

    @Test
    fun `credentials that cannot be saved still sign in`() =
        runBlocking {
            withKeys()
            store.failOn = failing("set", sessionKey) { IllegalStateException() }

            val outcome = flow(succeeding()).signIn(request, ScriptedPrompt(listOf(RIGHT_CODE)), same)

            assertTrue(outcome is SignInOutcome.SignedIn)
            assertTrue(log.lines.any { it.startsWith("WARN") && it.contains("could not save") })
        }

    @Test
    fun `two launches at once ask once`() =
        runBlocking {
            withKeys()
            val release = CompletableDeferred<Unit>()
            val flow = flow(ScriptedResolver { Result.success(fresh()) })
            val held = ScriptedPrompt(listOf(RIGHT_CODE)) { release.await() }
            val second = ScriptedPrompt(listOf(RIGHT_CODE))

            withTimeout(WAIT) {
                val one = async { flow.signIn(request, held, same) }
                held.shown.await()
                val two = async { flow.signIn(request, second, same) }
                release.complete(Unit)
                assertTrue(one.await() is SignInOutcome.SignedIn)
                assertTrue(two.await() is SignInOutcome.SignedIn)
            }
            assertTrue(second.requests.isEmpty())
        }

    @Test
    fun `when the first gives up, the one that waited asks itself`() =
        runBlocking {
            withKeys()
            val release = CompletableDeferred<Unit>()
            val flow = flow(ScriptedResolver { Result.success(fresh()) })
            val held = ScriptedPrompt(emptyList()) { release.await() }
            val second = ScriptedPrompt(listOf(RIGHT_CODE))

            withTimeout(WAIT) {
                val one = async { flow.signIn(request, held, same) }
                held.shown.await()
                val two = async { flow.signIn(request, second, same) }
                release.complete(Unit)
                assertEquals(SignInOutcome.Cancelled, one.await())
                assertTrue(two.await() is SignInOutcome.SignedIn)
            }
            assertEquals(1, second.requests.size)
        }

    @Test
    fun `a launch whose settings changed while it waited for another sign-in asks nothing`() =
        runBlocking {
            withKeys()
            val release = CompletableDeferred<Unit>()
            val flow = flow(ScriptedResolver { Result.success(fresh()) })
            val held = ScriptedPrompt(emptyList()) { release.await() }
            val second = ScriptedPrompt(listOf(RIGHT_CODE))

            withTimeout(WAIT) {
                val one = async { flow.signIn(request, held, same) }
                held.shown.await()
                val two = async { flow.signIn(request, second) { false } }
                release.complete(Unit)
                assertEquals(SignInOutcome.Cancelled, one.await())
                assertSame(SignInOutcome.SettingsChanged, two.await())
            }
            assertTrue(second.requests.isEmpty())
            assertTrue(log.lines.any { it.contains("waiting for another sign-in") })
        }

    @Test
    fun `cancelling while STS is busy returns at once and drops the late answer`() =
        runBlocking {
            withKeys()
            val resolver = ScriptedResolver { Result.success(fresh()) }.apply { gate = CountDownLatch(1) }
            val job = launch { flow(resolver).signIn(request, ScriptedPrompt(listOf(RIGHT_CODE)), same) }

            withTimeout(WAIT) {
                resolver.entered.await()
                // STS is still blocked in its thread; cancelling must not wait for it.
                job.cancelAndJoin()
            }
            assertTrue(job.isCancelled)
            resolver.gate?.countDown()
            withTimeout(WAIT) { resolver.returned.await() }
            assertNull(store.entries[sessionKey])
        }

    @Test
    fun `keys replaced while the prompt waits make it show nothing and send nothing`() =
        runBlocking {
            withKeys()
            val resolver = succeeding()
            // As SecretApplication does while the settings dialog is open: forget the session, then write new keys.
            val prompt =
                ScriptedPrompt(listOf(RIGHT_CODE)) {
                    store.entries.remove(sessionKey)
                    store.entries[keysKey] = LongTermKeys(OTHER_KEY_ID, OTHER_SECRET).toSecret()
                }

            val outcome = flow(resolver).signIn(request, prompt, same)

            assertSame(SignInOutcome.SettingsChanged, outcome)
            assertTrue(prompt.notShown)
            assertTrue(resolver.requests.isEmpty())
            assertNull(store.entries[sessionKey])
            assertTrue(log.lines.any { it.contains(id.value) && it.contains("nothing was shown") })
        }

    @Test
    fun `keys that change after the prompt showed are not saved`() =
        runBlocking {
            withKeys()
            val resolver =
                ScriptedResolver {
                    store.entries[keysKey] = LongTermKeys(OTHER_KEY_ID, OTHER_SECRET).toSecret()
                    Result.success(fresh())
                }

            val outcome = flow(resolver).signIn(request, ScriptedPrompt(listOf(RIGHT_CODE)), same)

            assertSame(SignInOutcome.SettingsChanged, outcome)
            assertEquals(LONG_KEY_ID, resolver.requests.single().longTermAccessKeyId)
            assertNull(store.entries[sessionKey])
            assertTrue(log.lines.any { it.contains(id.value) && it.contains("nothing was saved") })
        }

    @Test
    fun `a new secret for the same key ID, or keys removed, is a change too`() =
        runBlocking {
            listOf<() -> Unit>(
                { store.entries[keysKey] = LongTermKeys(LONG_KEY_ID, OTHER_SECRET).toSecret() },
                { store.entries.remove(keysKey) },
            ).forEach { change ->
                withKeys()
                val resolver = succeeding()
                val prompt = ScriptedPrompt(listOf(RIGHT_CODE)) { change() }
                assertSame(SignInOutcome.SettingsChanged, flow(resolver).signIn(request, prompt, same))
                assertTrue(prompt.notShown)
                assertTrue(resolver.requests.isEmpty())
                assertNull(store.entries[sessionKey])
            }
        }

    @Test
    fun `a caller that sees other settings, or cannot tell, gets nothing saved`() =
        runBlocking {
            // From the start, the prompt is not even asked.
            listOf<suspend () -> Boolean>({ false }, { throw IllegalStateException() }).forEach { check ->
                withKeys()
                val resolver = succeeding()
                val prompt = ScriptedPrompt(listOf(RIGHT_CODE))
                assertSame(SignInOutcome.SettingsChanged, flow(resolver).signIn(request, prompt, check))
                assertTrue(prompt.requests.isEmpty())
                assertTrue(resolver.requests.isEmpty())
                assertNull(store.entries[sessionKey])
            }
            // Changed while the prompt waited: it shows nothing and sends nothing.
            withKeys()
            var checks = 0
            val resolver = succeeding()
            val prompt = ScriptedPrompt(listOf(RIGHT_CODE))
            assertSame(SignInOutcome.SettingsChanged, flow(resolver).signIn(request, prompt) { ++checks == 1 })
            assertTrue(prompt.notShown)
            assertTrue(resolver.requests.isEmpty())
            assertNull(store.entries[sessionKey])
            assertTrue(log.lines.any { it.startsWith("WARN") && it.contains("IllegalStateException") })
        }

    @Test
    fun `unchanged settings and keys are saved and used as before`() =
        runBlocking {
            withKeys()
            var asked = 0
            val outcome =
                flow(succeeding()).signIn(request, ScriptedPrompt(listOf(RIGHT_CODE))) {
                    asked++
                    true
                }
            assertTrue(outcome is SignInOutcome.SignedIn)
            // Right after the lock, just before the prompt shows, and before saving.
            assertEquals(3, asked)
            val kept = BedrockSessionSecret.fromSecret(checkNotNull(store.entries[sessionKey]))
            assertEquals(TMP_TOKEN, kept?.sessionToken)
        }

    @Test
    fun `no secret reaches the log, the outcomes or the request`() =
        runBlocking {
            withKeys()
            val resolver = refusingWrongCode()
            val prompt = ScriptedPrompt(listOf(WRONG_CODE, RIGHT_CODE))
            val outcome = flow(resolver).signIn(request, prompt, same)

            val printed = log.lines + outcome.toString() + request.toString() + prompt.results.map { it.toString() }
            val secrets = listOf(LONG_KEY_ID, LONG_SECRET, TMP_KEY_ID, TMP_SECRET, TMP_TOKEN, WRONG_CODE, RIGHT_CODE)
            secrets.forEach { secret ->
                printed.forEach { assertFalse(it.contains(secret)) { "'$secret' leaked: $it" } }
            }
            assertTrue(log.lines.any { it.contains(id.value) && it.contains("MFA_CODE_REJECTED") })
            assertSame(SignInOutcome.SignedIn::class, outcome::class)
        }

    private companion object {
        const val NOW = 1_900_000_000_000L
        const val HOUR = 3_600_000L
        const val DURATION = 43_200
        const val LONG_KEY_ID = "AKIAFLOWMARKER000001"
        const val LONG_SECRET = "flow-marker-long-term-secret"
        const val OTHER_KEY_ID = "AKIAFLOWMARKER000002"
        const val OTHER_SECRET = "flow-marker-other-long-term-secret"
        const val TMP_KEY_ID = "ASIA-flow-marker-id"
        const val TMP_SECRET = "flow-marker-tmp-secret"
        const val TMP_TOKEN = "flow-marker-tmp-token"
        const val WRONG_CODE = "914273"
        const val RIGHT_CODE = "582046"
        val WAIT = 10.seconds
    }
}
