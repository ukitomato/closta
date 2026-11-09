package dev.ukitomato.closta.platforms.intellij.settings

import com.google.gson.JsonArray
import com.google.gson.JsonElement
import com.google.gson.JsonObject
import com.google.gson.JsonParseException
import com.google.gson.JsonParser
import dev.ukitomato.closta.core.interfaces.SettingsStore
import dev.ukitomato.closta.platforms.intellij.store.ProviderId

/**
 * How the provider records and the active provider are kept in the settings: the list as one JSON array under
 * [RECORDS_KEY], the active id under [ACTIVE_KEY]. One key for the list lets a save replace it whole, so a removed
 * provider leaves nothing behind; the version in the key name lets a later format be told apart.
 *
 * The JSON is built by hand, field by field: a reflective serializer would start writing any field someone later adds
 * to a record, secret or not. A record that cannot be read is skipped and counted, never thrown — a bad settings file
 * must not break the settings screen or the IDE — and [save] writes it back as it was: a later version may be able to
 * read it, and dropping it would lose its id and with it the provider's PasswordSafe entries.
 */
object ProviderRecords {
    const val RECORDS_KEY = "providers.v1"
    const val ACTIVE_KEY = "providers.active"

    /**
     * What was read: the readable records, the active id if it names one of them, and how many were skipped.
     * [unreadable] are the skipped array elements kept as JSON text, so a save can write them back.
     */
    class Decoded(
        val records: List<ProviderRecord>,
        val active: ProviderId?,
        val skipped: Int,
        val unreadable: List<String> = emptyList(),
    )

    /**
     * What to store under each key; a null value means the key is cleared (no active provider: the default).
     * [unreadable] elements (from [Decoded.unreadable]) follow the records unchanged.
     */
    fun encode(
        records: List<ProviderRecord>,
        active: ProviderId?,
        unreadable: List<String> = emptyList(),
    ): Map<String, String?> =
        mapOf(
            RECORDS_KEY to
                JsonArray()
                    .apply {
                        records.forEach { add(encodeRecord(it)) }
                        unreadable.forEach { add(JsonParser.parseString(it)) }
                    }.toString(),
            ACTIVE_KEY to active?.value,
        )

    /** The providers saved in [store]. */
    fun load(store: SettingsStore): Decoded = decode(store::get)

    /** Saves [records] and [active] to [store], writing back the elements in it this version could not read. */
    fun save(
        store: SettingsStore,
        records: List<ProviderRecord>,
        active: ProviderId?,
    ) {
        encode(records, active, load(store).unreadable).forEach { (key, value) ->
            if (value != null) store.set(key, value) else store.clear(key)
        }
    }

    /** Reads the settings through [read] (the value stored under a key, or null). */
    fun decode(read: (String) -> String?): Decoded {
        val stored = read(RECORDS_KEY)
        val elements = parseArray(stored)
        val records = mutableListOf<ProviderRecord>()
        val unreadable = mutableListOf<String>()
        var skipped = if (elements == null && stored != null) 1 else 0
        elements?.forEach { element ->
            val record = decodeOrNull(element)
            when {
                // A second record with an id already read is dropped: two records cannot own one id's secrets.
                record != null && records.any { it.id == record.id } -> skipped++
                record != null -> records += record
                else -> {
                    skipped++
                    unreadable += element.toString()
                }
            }
        }
        val active = read(ACTIVE_KEY)?.let(ProviderId::parse)?.takeIf { id -> records.any { it.id == id } }
        return Decoded(records, active, skipped, unreadable)
    }

    private fun encodeRecord(record: ProviderRecord): JsonObject =
        JsonObject().apply {
            addProperty(ID, record.id.value)
            addProperty(NAME, record.name)
            addProperty(KIND, record.kind.wire)
            record.model?.let { addProperty(MODEL, it) }
            record.bedrock?.let { bedrock ->
                add(
                    BEDROCK,
                    JsonObject().apply {
                        addProperty(REGION, bedrock.region)
                        addProperty(MFA_DEVICE_ARN, bedrock.mfaDeviceArn)
                        addProperty(SESSION_SECONDS, bedrock.sessionDurationSeconds)
                        bedrock.sonnetModelId?.let { addProperty(SONNET_MODEL, it) }
                        bedrock.haikuModelId?.let { addProperty(HAIKU_MODEL, it) }
                    },
                )
            }
        }

    @Suppress("SwallowedException")
    private fun parseArray(text: String?): JsonArray? =
        try {
            text?.let { JsonParser.parseString(it) }?.takeIf { it.isJsonArray }?.asJsonArray
        } catch (malformed: JsonParseException) {
            null
        }

    // Any field of the wrong shape makes the record unreadable; it is skipped rather than half-read.
    @Suppress("SwallowedException", "TooGenericExceptionCaught")
    private fun decodeOrNull(element: JsonElement): ProviderRecord? =
        try {
            val json = element.asJsonObject
            val id = ProviderId.parse(json.get(ID).asString) ?: return null
            val kind = ProviderKind.fromWire(json.get(KIND).asString) ?: return null
            val name = json.get(NAME).asString
            val bedrock = if (kind == ProviderKind.BEDROCK) decodeBedrock(json.getAsJsonObject(BEDROCK)) else null
            ProviderRecord(id, name, kind, json.optionalString(MODEL), bedrock)
        } catch (malformed: RuntimeException) {
            null
        }

    private fun decodeBedrock(json: JsonObject): BedrockFields =
        BedrockFields(
            region = json.get(REGION).asString,
            mfaDeviceArn = json.get(MFA_DEVICE_ARN).asString,
            sessionDurationSeconds = json.get(SESSION_SECONDS).asInt,
            sonnetModelId = json.optionalString(SONNET_MODEL),
            haikuModelId = json.optionalString(HAIKU_MODEL),
        )

    private fun JsonObject.optionalString(key: String): String? = get(key)?.takeUnless { it.isJsonNull }?.asString

    private const val ID = "id"
    private const val NAME = "name"
    private const val KIND = "kind"
    private const val MODEL = "model"
    private const val BEDROCK = "bedrock"
    private const val REGION = "region"
    private const val MFA_DEVICE_ARN = "mfaDeviceArn"
    private const val SESSION_SECONDS = "sessionDurationSeconds"
    private const val SONNET_MODEL = "sonnetModelId"
    private const val HAIKU_MODEL = "haikuModelId"
}
