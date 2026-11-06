package dev.ukitomato.closta.platforms.intellij.settings

import dev.ukitomato.closta.platforms.intellij.store.ProviderId
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

class ProviderRecordsTest {
    private val anthropicId = ProviderId.parse("0d6f2c1e-4b7a-4c55-9e1f-2a3b4c5d6e7f")!!
    private val bedrockId = ProviderId.parse("8a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d")!!

    private val anthropic = ProviderRecord(anthropicId, "Work", ProviderKind.ANTHROPIC, model = "opus")
    private val bedrock =
        ProviderRecord(
            bedrockId,
            "Bedrock Tokyo",
            ProviderKind.BEDROCK,
            bedrock =
                BedrockFields(
                    region = "ap-northeast-1",
                    mfaDeviceArn = "arn:aws:iam::123456789012:mfa/dev",
                    sessionDurationSeconds = 3_600,
                    sonnetModelId = "apac.anthropic.claude-sonnet",
                ),
        )

    private fun roundTrip(
        records: List<ProviderRecord>,
        active: ProviderId?,
    ): ProviderRecords.Decoded {
        val store = FakeSettingsStore()
        ProviderRecords.encode(records, active).forEach { (key, value) ->
            if (value != null) store.set(key, value) else store.clear(key)
        }
        return ProviderRecords.decode(store::get)
    }

    @Test
    fun `records and the active provider read back as they were written`() {
        val decoded = roundTrip(listOf(anthropic, bedrock), bedrockId)
        assertEquals(listOf(anthropic, bedrock), decoded.records)
        assertEquals(bedrockId, decoded.active)
        assertEquals(0, decoded.skipped)
    }

    @Test
    fun `optional fields read back absent when they were absent`() {
        val bare = ProviderRecord(anthropicId, "Plain", ProviderKind.ANTHROPIC)
        val bareBedrock = ProviderRecord(bedrockId, "B", ProviderKind.BEDROCK)
        val decoded = roundTrip(listOf(bare, bareBedrock), null)
        assertEquals(listOf(bare, bareBedrock), decoded.records)
        assertNull(decoded.records[0].model)
        assertNull(decoded.records[0].bedrock)
        assertNull(decoded.records[1].bedrock!!.sonnetModelId)
        assertNull(decoded.records[1].bedrock!!.haikuModelId)
        assertEquals(BedrockFields.DEFAULT_SESSION_SECONDS, decoded.records[1].bedrock!!.sessionDurationSeconds)
        assertNull(decoded.active)
    }

    @Test
    fun `no active provider clears the key so the default is used`() {
        assertEquals(null, ProviderRecords.encode(listOf(anthropic), null)[ProviderRecords.ACTIVE_KEY])
        assertEquals(
            setOf(ProviderRecords.RECORDS_KEY, ProviderRecords.ACTIVE_KEY),
            ProviderRecords.encode(emptyList(), null).keys,
        )
    }

    @Test
    fun `stored spellings are pinned because saved providers are read back by them`() {
        assertEquals("providers.v1", ProviderRecords.RECORDS_KEY)
        assertEquals("providers.active", ProviderRecords.ACTIVE_KEY)
        assertEquals(
            mapOf(ProviderKind.ANTHROPIC to "anthropic", ProviderKind.BEDROCK to "bedrock"),
            ProviderKind.entries.associateWith { it.wire },
        )
        assertEquals(
            """[{"id":"0d6f2c1e-4b7a-4c55-9e1f-2a3b4c5d6e7f","name":"Work",""" +
                """"kind":"anthropic","model":"opus"},""" +
                """{"id":"8a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d","name":"Bedrock Tokyo","kind":"bedrock",""" +
                """"bedrock":{"region":"ap-northeast-1","mfaDeviceArn":"arn:aws:iam::123456789012:mfa/dev",""" +
                """"sessionDurationSeconds":3600,"sonnetModelId":"apac.anthropic.claude-sonnet"}}]""",
            ProviderRecords.encode(listOf(anthropic, bedrock), bedrockId)[ProviderRecords.RECORDS_KEY],
        )
        assertEquals(bedrockId.value, ProviderRecords.encode(listOf(bedrock), bedrockId)[ProviderRecords.ACTIVE_KEY])
    }

    @Test
    fun `a settings value that is not JSON is skipped, not thrown`() {
        val decoded = ProviderRecords.decode(mapOf(ProviderRecords.RECORDS_KEY to "{not json")::get)
        assertEquals(emptyList<ProviderRecord>(), decoded.records)
        assertEquals(1, decoded.skipped)
    }

    @Test
    fun `unreadable records are skipped and counted while the rest are read`() {
        val good = """{"id":"${anthropicId.value}","name":"Work","kind":"anthropic"}"""
        val bad =
            listOf(
                """{"id":"Work","name":"Work","kind":"anthropic"}""",
                """{"id":"1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e","name":"X","kind":"codex"}""",
                """{"id":"2b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e","kind":"anthropic"}""",
                """{"id":"3b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e","name":"B","kind":"bedrock"}""",
                """{"id":"4b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e","name":"B","kind":"bedrock",""" +
                    """"bedrock":{"mfaDeviceArn":"a","sessionDurationSeconds":900}}""",
                """{"id":"5b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e","name":"B","kind":"bedrock",""" +
                    """"bedrock":{"region":"r","mfaDeviceArn":"a","sessionDurationSeconds":"long"}}""",
                """"just a string"""",
                """{"id":"${anthropicId.value}","name":"Duplicate","kind":"anthropic"}""",
            )
        val stored = mapOf(ProviderRecords.RECORDS_KEY to "[$good,${bad.joinToString(",")}]")
        val decoded = ProviderRecords.decode(stored::get)
        assertEquals(listOf(ProviderRecord(anthropicId, "Work", ProviderKind.ANTHROPIC)), decoded.records)
        assertEquals(bad.size, decoded.skipped)
    }

    @Test
    fun `a save writes back the records this version could not read`() {
        val store = FakeSettingsStore()
        val unknown = """{"id":"1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e","name":"Later","kind":"codex"}"""
        val good = """{"id":"${anthropicId.value}","name":"Work","kind":"anthropic"}"""
        val duplicate = """{"id":"${anthropicId.value}","name":"Twin","kind":"anthropic"}"""
        store.set(ProviderRecords.RECORDS_KEY, "[$good,$unknown,$duplicate]")
        val before = ProviderRecords.load(store)
        assertEquals(2, before.skipped)
        assertEquals(listOf(unknown), before.unreadable.map { it.replace(" ", "") })

        ProviderRecords.save(store, listOf(bedrock), bedrockId)
        val after = ProviderRecords.load(store)
        assertEquals(listOf(bedrock), after.records)
        assertEquals(bedrockId, after.active)
        assertEquals(1, after.skipped)
        assertEquals(before.unreadable, after.unreadable)
    }

    @Test
    fun `an active id that names no readable record falls back to the default`() {
        val records = ProviderRecords.encode(listOf(anthropic), null)[ProviderRecords.RECORDS_KEY]!!
        listOf(bedrockId.value, "Work").forEach { active ->
            val stored = mapOf(ProviderRecords.RECORDS_KEY to records, ProviderRecords.ACTIVE_KEY to active)
            assertNull(ProviderRecords.decode(stored::get).active) { active }
        }
    }

    @Test
    fun `nothing saved reads as no providers and the default`() {
        val decoded = ProviderRecords.decode { null }
        assertEquals(emptyList<ProviderRecord>(), decoded.records)
        assertNull(decoded.active)
        assertEquals(0, decoded.skipped)
    }

    @Test
    fun `a record whose kind and Bedrock settings disagree is refused`() {
        assertThrows<IllegalArgumentException> {
            ProviderRecord(anthropicId, "Work", ProviderKind.ANTHROPIC, bedrock = BedrockFields())
        }
        assertThrows<IllegalArgumentException> {
            ProviderRecord(bedrockId, "Tokyo", ProviderKind.BEDROCK, bedrock = null)
        }
        assertThrows<IllegalArgumentException> { bedrock.copy(kind = ProviderKind.ANTHROPIC) }
    }

    @Test
    fun `the stored records carry no secret field`() {
        val text =
            ProviderRecords
                .encode(listOf(anthropic, bedrock), bedrockId)
                .values
                .joinToString()
                .lowercase()
        assertFalse("secret" in text) { text }
        assertFalse("accesskey" in text) { text }
    }
}
