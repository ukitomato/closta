package dev.ukitomato.closta.platforms.intellij.settings

import com.google.gson.JsonObject
import com.google.gson.JsonParseException
import com.google.gson.JsonParser
import dev.ukitomato.closta.core.interfaces.Secret

/**
 * An IAM user's long-term access key: the access key ID and the secret access key, kept together as one PasswordSafe
 * entry (slot `BEDROCK_LONG_TERM`) because one is meaningless without the other.
 *
 * Not a data class and printed only redacted. This is the one place in the settings that calls
 * [Secret.reveal]: to pack the pair into a [Secret] and to unpack it again for the caller that hands it to STS.
 */
class LongTermKeys(
    val accessKeyId: String,
    private val secretAccessKey: String,
) {
    init {
        require(accessKeyId.isNotBlank()) { "an access key ID must not be blank" }
        require(secretAccessKey.isNotEmpty()) { "a secret access key must not be empty" }
    }

    /** The secret access key itself. Call it only where the value is handed to STS. */
    fun revealSecretAccessKey(): String = secretAccessKey

    /** Whether [other] is the same pair: the same key ID and secret. The secret stays inside this type. */
    fun sameAs(other: LongTermKeys): Boolean =
        accessKeyId == other.accessKeyId && secretAccessKey == other.secretAccessKey

    /** The pair as one [Secret], ready for the store. */
    fun toSecret(): Secret =
        Secret(
            JsonObject()
                .apply {
                    addProperty(ACCESS_KEY_ID, accessKeyId)
                    addProperty(SECRET_ACCESS_KEY, secretAccessKey)
                }.toString(),
        )

    override fun toString(): String = "LongTermKeys(<redacted>)"

    companion object {
        private const val ACCESS_KEY_ID = "accessKeyId"
        private const val SECRET_ACCESS_KEY = "secretAccessKey"

        /** The pair a [Secret] from [toSecret] holds, or null when it holds anything else. */
        @Suppress("SwallowedException", "TooGenericExceptionCaught")
        fun fromSecret(secret: Secret): LongTermKeys? =
            try {
                val json = JsonParser.parseString(secret.reveal()).asJsonObject
                LongTermKeys(json.get(ACCESS_KEY_ID).asString, json.get(SECRET_ACCESS_KEY).asString)
            } catch (malformed: JsonParseException) {
                null
            } catch (malformed: RuntimeException) {
                // A missing or mistyped field, or a blank value: not a pair this class wrote.
                null
            }
    }
}

/**
 * What the user typed for a provider's long-term keys in this editing session: both fields blank leaves the stored
 * keys as they are, [clear] removes them. Printed redacted; the typed secret stays out of every string form.
 */
class KeyEdit(
    val accessKeyId: String = "",
    private val secretAccessKey: String = "",
    val clear: Boolean = false,
) {
    /** The secret access key as typed, to show again in its field when the provider is selected again. */
    fun typedSecretAccessKey(): String = secretAccessKey

    /** Whether anything was typed into either field. */
    val typed: Boolean get() = accessKeyId.isNotBlank() || secretAccessKey.isNotEmpty()

    /** Whether both fields hold something — what a replacement needs. */
    val complete: Boolean get() = accessKeyId.isNotBlank() && secretAccessKey.isNotBlank()

    /** Whether applying this edit changes anything. */
    val changes: Boolean get() = clear || typed

    /** The keys to store, when both fields hold something and the user is not clearing them. */
    fun replacement(): LongTermKeys? =
        if (!clear && complete) LongTermKeys(accessKeyId.trim(), secretAccessKey.trim()) else null

    override fun toString(): String = "KeyEdit(typed=$typed, clear=$clear)"
}
