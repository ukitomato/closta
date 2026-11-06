package dev.ukitomato.closta.platforms.intellij.settings

import dev.ukitomato.closta.core.interfaces.Secret
import dev.ukitomato.closta.core.interfaces.SecretStore
import dev.ukitomato.closta.platforms.intellij.store.ProviderId
import dev.ukitomato.closta.platforms.intellij.store.ProviderSecrets
import dev.ukitomato.closta.platforms.intellij.store.SecretSlot
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

class SecretApplicationTest {
    private val a = ProviderId.parse("0d6f2c1e-4b7a-4c55-9e1f-2a3b4c5d6e7f")!!
    private val b = ProviderId.parse("8a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d")!!
    private val c = ProviderId.parse("1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f")!!

    private fun key(
        id: ProviderId,
        slot: SecretSlot = SecretSlot.BEDROCK_LONG_TERM,
    ) = ProviderSecrets.key(id, slot)

    private fun record(id: ProviderId) = ProviderRecord(id, id.value.take(4), ProviderKind.BEDROCK)

    private fun plan(
        write: Map<ProviderId, LongTermKeys> = emptyMap(),
        clear: Set<ProviderId> = emptySet(),
        removed: List<ProviderId> = emptyList(),
        noLongerBedrock: List<ProviderId> = emptyList(),
    ) = ApplyPlan(emptyList(), null, write, clear, removed.map(::record), noLongerBedrock.map(::record))

    private fun FakeSecretStore.seed(vararg ids: ProviderId) =
        ids.forEach { id -> SecretSlot.entries.forEach { entries[key(id, it)] = Secret("old-${it.wire}") } }

    @Test
    fun `new keys are written as one secret under the long-term slot`() =
        runBlocking {
            val store = FakeSecretStore()
            val outcome = SecretApplication.apply(plan(write = mapOf(a to LongTermKeys(KEY_ID, "s3cr3t"))), store)
            assertTrue(outcome.failures.isEmpty())
            val back = LongTermKeys.fromSecret(store.entries.getValue(key(a)))!!
            assertEquals(KEY_ID, back.accessKeyId)
            assertEquals("s3cr3t", back.revealSecretAccessKey())
            assertEquals(setOf(key(a)), store.entries.keys)
        }

    @Test
    fun `clearing removes the long-term keys and the temporary credentials of that provider only`() =
        runBlocking {
            val store = FakeSecretStore().apply { seed(a, b) }
            SecretApplication.apply(plan(clear = setOf(a)), store)
            // The temporary credentials were issued for the keys being removed.
            assertEquals(setOf(key(b), key(b, SecretSlot.BEDROCK_SESSION)), store.entries.keys)
        }

    @Test
    fun `new keys replace the old ones only after the temporary credentials are forgotten`() =
        runBlocking {
            val store = FakeSecretStore().apply { seed(a, b) }
            val outcome = SecretApplication.apply(plan(write = mapOf(a to LongTermKeys(KEY_ID, "n3w"))), store)
            assertTrue(outcome.failures.isEmpty())
            assertFalse(store.entries.containsKey(key(a, SecretSlot.BEDROCK_SESSION)))
            assertEquals("n3w", LongTermKeys.fromSecret(store.entries.getValue(key(a)))?.revealSecretAccessKey())
            assertEquals("old-bedrock-session", store.entries.getValue(key(b, SecretSlot.BEDROCK_SESSION)).reveal())
        }

    @Test
    fun `keys stay as they were when the temporary credentials cannot be forgotten`() =
        runBlocking {
            val store =
                FakeSecretStore().apply {
                    seed(a, b)
                    failClear += key(a, SecretSlot.BEDROCK_SESSION)
                }
            val outcome =
                SecretApplication.apply(
                    plan(write = mapOf(a to LongTermKeys(KEY_ID, "n3w")), clear = setOf(b)),
                    store,
                )
            assertEquals("old-bedrock-long-term", store.entries.getValue(key(a)).reveal())
            assertEquals(listOf(SecretAction.STORE_KEYS), outcome.failures.map { it.action })
            assertEquals(a, outcome.failures.single().providerId)
            // The other provider's clearing still ran: one failure does not stop the rest.
            assertFalse(store.entries.containsKey(key(b)))

            val clearing =
                FakeSecretStore().apply {
                    seed(a)
                    failClear += key(a, SecretSlot.BEDROCK_SESSION)
                }
            val cleared = SecretApplication.apply(plan(clear = setOf(a)), clearing)
            assertTrue(clearing.entries.containsKey(key(a)))
            assertEquals(listOf(SecretAction.CLEAR_KEYS), cleared.failures.map { it.action })
        }

    @Test
    fun `a removed provider is forgotten in every slot and no other provider is touched`() =
        runBlocking {
            val store = FakeSecretStore().apply { seed(a, b) }
            val outcome = SecretApplication.apply(plan(removed = listOf(a)), store)
            assertTrue(outcome.failedForget.isEmpty())
            assertEquals(setOf(key(b), key(b, SecretSlot.BEDROCK_SESSION)), store.entries.keys)
        }

    @Test
    fun `a provider that could not be forgotten is reported and the rest are still processed`() =
        runBlocking {
            val store = FakeSecretStore().apply { seed(a, b, c) }
            store.failClear += key(a)
            store.failSet += key(c)
            val outcome =
                SecretApplication.apply(
                    plan(write = mapOf(c to LongTermKeys(KEY_ID, "new")), removed = listOf(a, b)),
                    store,
                )
            assertEquals(setOf(a), outcome.failedForget)
            // a's other slot was still tried and cleared, and b was forgotten after a failed.
            assertFalse(key(a, SecretSlot.BEDROCK_SESSION) in store.entries)
            assertFalse(key(b) in store.entries || key(b, SecretSlot.BEDROCK_SESSION) in store.entries)
            assertEquals(
                listOf(
                    SecretFailure(c, SecretAction.STORE_KEYS, UNAVAILABLE, "set refused for ${key(c)}"),
                    SecretFailure(a, SecretAction.FORGET, UNAVAILABLE, "clear refused for ${key(a)}"),
                ),
                outcome.failures,
            )
        }

    @Test
    fun `a provider no longer on Bedrock has every slot forgotten`() =
        runBlocking {
            val store = FakeSecretStore().apply { seed(a, b) }
            val outcome = SecretApplication.apply(plan(noLongerBedrock = listOf(a)), store)
            assertTrue(outcome.failures.isEmpty())
            assertEquals(setOf(key(b), key(b, SecretSlot.BEDROCK_SESSION)), store.entries.keys)
        }

    @Test
    fun `an unavailable store's reason is passed on, and no other failure's message is`() =
        runBlocking {
            val store = FakeSecretStore()
            store.failSet += key(a)
            val outcome = SecretApplication.apply(plan(write = mapOf(a to LongTermKeys(KEY_ID, "s3cr3t"))), store)
            val failure = outcome.failures.single()
            assertEquals("SecretStoreUnavailableException", failure.errorType)
            assertEquals("set refused for ${key(a)}", failure.reason)
            assertFalse("s3cr3t" in failure.toString()) { failure.toString() }

            val broken =
                object : SecretStore {
                    override suspend fun get(key: String): Secret? = null

                    override suspend fun set(
                        key: String,
                        value: Secret,
                    ): Unit = error("MARKER-not-ours")

                    override suspend fun clear(key: String) = Unit
                }
            val other =
                SecretApplication.apply(plan(write = mapOf(a to LongTermKeys(KEY_ID, "x"))), broken).failures.single()
            assertEquals("IllegalStateException", other.errorType)
            assertNull(other.reason)
            assertFalse("MARKER" in other.toString()) { other.toString() }
        }

    @Test
    fun `a class name in the middle of a reason is the store's words and stays`() {
        val reason = "could not read (java.lang.IllegalStateException) from the keychain"
        assertEquals(reason, SecretApplication.userReason(reason))
    }

    @Test
    fun `a reason loses the class name the store appends`() {
        assertEquals(
            "could not write the secret store",
            SecretApplication.userReason("could not write the secret store (java.lang.IllegalStateException)"),
        )
        assertEquals(
            "the OS keychain could not be unlocked",
            SecretApplication.userReason("the OS keychain could not be unlocked"),
        )
    }

    @Test
    fun `the report says whose, what, why and what to do next, without values or class names`() {
        val plan =
            ApplyPlan(
                records = listOf(record(a), ProviderRecord(b, "Work", ProviderKind.ANTHROPIC)),
                active = null,
                keysToWrite = emptyMap(),
                keysToClear = emptySet(),
                removed = listOf(record(c)),
                noLongerBedrock = listOf(record(b)),
            )
        val outcome =
            SecretOutcome(
                setOf(b, c),
                listOf(
                    SecretFailure(a, SecretAction.STORE_KEYS, UNAVAILABLE, "could not write the secret store"),
                    SecretFailure(a, SecretAction.CLEAR_KEYS, "IllegalStateException"),
                    SecretFailure(b, SecretAction.FORGET, UNAVAILABLE, "the OS keychain could not be unlocked"),
                    SecretFailure(c, SecretAction.FORGET, UNAVAILABLE),
                ),
            )
        val lines = SecretApplication.failureReport(plan, outcome)
        val nameA = record(a).name
        val nameC = record(c).name
        assertEquals(
            listOf(
                "Could not store the long-term keys of $nameA: could not write the secret store. " +
                    "Enter the keys again and click Apply.",
                "Could not remove the stored keys of $nameA. Select Remove the stored keys again and click Apply.",
                "Could not forget the secrets of Work: the OS keychain could not be unlocked. " +
                    "It stays an Amazon Bedrock provider; change its kind again and click Apply.",
                "Could not forget the secrets of $nameC. It stays in the list; remove it again and click Apply.",
            ),
            lines.dropLast(1),
        )
        assertTrue(lines.last().contains("Passwords"))
        assertFalse(lines.any { "Exception" in it }) { lines.toString() }
    }

    @Test
    fun `cancellation is not swallowed as a failure`() {
        val cancelling =
            object : SecretStore {
                override suspend fun get(key: String): Secret? = null

                override suspend fun set(
                    key: String,
                    value: Secret,
                ): Unit = throw CancellationException("cancelled")

                override suspend fun clear(key: String) = Unit
            }
        assertThrows<CancellationException> {
            runBlocking { SecretApplication.apply(plan(write = mapOf(a to LongTermKeys(KEY_ID, "x"))), cancelling) }
        }
    }

    private companion object {
        const val KEY_ID = "AKIAABCDEFGHIJKLMNOP"
        const val UNAVAILABLE = "SecretStoreUnavailableException"
    }
}
