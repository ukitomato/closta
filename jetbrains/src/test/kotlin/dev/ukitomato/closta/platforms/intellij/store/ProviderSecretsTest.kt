package dev.ukitomato.closta.platforms.intellij.store

import dev.ukitomato.closta.core.interfaces.Secret
import dev.ukitomato.closta.core.interfaces.SecretStore
import dev.ukitomato.closta.core.interfaces.SecretStoreUnavailableException
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

class ProviderSecretsTest {
    private class InMemorySecretStore : SecretStore {
        val entries = mutableMapOf<String, Secret>()
        val failures = mutableMapOf<String, String>()

        override suspend fun get(key: String): Secret? = entries[key]

        override suspend fun set(
            key: String,
            value: Secret,
        ) {
            entries[key] = value
        }

        override suspend fun clear(key: String) {
            failures[key]?.let { throw SecretStoreUnavailableException(it) }
            entries.remove(key)
        }
    }

    private val a = ProviderId.parse("0d6f2c1e-4b7a-4c55-9e1f-2a3b4c5d6e7f")!!
    private val b = ProviderId.parse("8a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d")!!

    @Test
    fun `a display name is not accepted as an id`() {
        assertNull(ProviderId.parse("My Bedrock"))
        assertNull(ProviderId.parse("bedrock"))
        assertNull(ProviderId.parse(""))
        assertNull(ProviderId.parse("0D6F2C1E-4B7A-4C55-9E1F-2A3B4C5D6E7F"))
        assertNull(ProviderId.parse(" 0d6f2c1e-4b7a-4c55-9e1f-2a3b4c5d6e7f"))
        assertNull(ProviderId.parse("0d6f2c1e4b7a4c559e1f2a3b4c5d6e7f"))
    }

    @Test
    fun `a generated id reads back as the same id`() {
        val id = ProviderId.generate()
        assertEquals(id, ProviderId.parse(id.value))
    }

    @Test
    fun `the same id and slot always give the same key`() {
        val again = ProviderId.parse(a.value)!!
        assertEquals(
            ProviderSecrets.key(a, SecretSlot.BEDROCK_LONG_TERM),
            ProviderSecrets.key(again, SecretSlot.BEDROCK_LONG_TERM),
        )
    }

    @Test
    fun `different slots and different ids give different keys`() {
        val keys =
            listOf(a, b).flatMap { id -> SecretSlot.entries.map { ProviderSecrets.key(id, it) } }
        assertEquals(keys.size, keys.toSet().size) { "keys collide: $keys" }
    }

    @Test
    fun `slot spellings are pinned because they are part of every stored key`() {
        assertEquals(
            mapOf(SecretSlot.BEDROCK_LONG_TERM to "bedrock-long-term", SecretSlot.BEDROCK_SESSION to "bedrock-session"),
            SecretSlot.entries.associateWith { it.wire },
        )
        assertEquals(
            "provider/0d6f2c1e-4b7a-4c55-9e1f-2a3b4c5d6e7f/bedrock-long-term",
            ProviderSecrets.key(a, SecretSlot.BEDROCK_LONG_TERM),
        )
    }

    @Test
    fun `the namespace is not the old PoC's`() {
        assertEquals("Closta", ProviderSecrets.NAMESPACE)
        assertNotEquals("ClaudeCode.Bedrock", ProviderSecrets.NAMESPACE)
    }

    @Test
    fun `forgetting a provider clears every slot of it and nothing of another`() =
        runBlocking {
            val store = InMemorySecretStore()
            listOf(a, b).forEach { id ->
                SecretSlot.entries.forEach { store.set(ProviderSecrets.key(id, it), Secret("${id.value}-${it.wire}")) }
            }

            ProviderSecrets.forget(store, a)

            SecretSlot.entries.forEach {
                assertNull(store.get(ProviderSecrets.key(a, it))) { "${it.wire} of the forgotten provider survived" }
                assertNotNull(store.get(ProviderSecrets.key(b, it))) { "${it.wire} of the other provider was cleared" }
            }
            assertEquals(SecretSlot.entries.size, store.entries.size)
        }

    @Test
    fun `forgetting keeps clearing the other slots when one fails, then reports the failure`() =
        runBlocking {
            val store = InMemorySecretStore()
            SecretSlot.entries.forEach { store.set(ProviderSecrets.key(a, it), Secret("${a.value}-${it.wire}")) }
            val failing = ProviderSecrets.key(a, SecretSlot.entries.first())
            store.failures[failing] = "the OS keychain could not be unlocked"

            val failure =
                assertThrows<SecretStoreUnavailableException> { runBlocking { ProviderSecrets.forget(store, a) } }

            assertEquals("the OS keychain could not be unlocked", failure.message)
            SecretSlot.entries.drop(1).forEach {
                assertNull(store.get(ProviderSecrets.key(a, it))) { "${it.wire} was skipped after an earlier failure" }
            }
            assertNotNull(store.get(failing))
        }

    @Test
    fun `forgetting reports the first failure when several slots fail`() =
        runBlocking {
            val store = InMemorySecretStore()
            SecretSlot.entries.forEachIndexed { i, slot -> store.failures[ProviderSecrets.key(a, slot)] = "failure $i" }

            val failure =
                assertThrows<SecretStoreUnavailableException> { runBlocking { ProviderSecrets.forget(store, a) } }

            assertEquals("failure 0", failure.message)
        }
}
