package dev.ukitomato.closta.platforms.intellij.auth

import com.google.gson.JsonObject
import com.google.gson.JsonParseException
import com.google.gson.JsonParser
import dev.ukitomato.closta.core.interfaces.Secret
import dev.ukitomato.closta.providers.claude.auth.SessionCredentials

/**
 * A provider's temporary credentials as one PasswordSafe entry (slot `BEDROCK_SESSION`): the three values and
 * the expiry together, so the values and the time they stop working can never be written apart.
 *
 * Besides the settings' `LongTermKeys`, this is the one place that calls [Secret.reveal]: to pack the credentials for
 * the store and to unpack them for the launch environment. Pure (no `com.intellij`), so the fast suite measures it.
 */
object BedrockSessionSecret {
    private const val ACCESS_KEY_ID = "accessKeyId"
    private const val SECRET_ACCESS_KEY = "secretAccessKey"
    private const val SESSION_TOKEN = "sessionToken"
    private const val EXPIRATION = "expirationEpochMillis"

    /** The credentials as one [Secret], ready for the store. */
    fun toSecret(credentials: SessionCredentials): Secret =
        Secret(
            JsonObject()
                .apply {
                    addProperty(ACCESS_KEY_ID, credentials.accessKeyId)
                    addProperty(SECRET_ACCESS_KEY, credentials.secretAccessKey)
                    addProperty(SESSION_TOKEN, credentials.sessionToken)
                    addProperty(EXPIRATION, credentials.expirationEpochMillis)
                }.toString(),
        )

    /** The credentials a [Secret] from [toSecret] holds, or null when it holds anything else — then there are none. */
    @Suppress("SwallowedException", "TooGenericExceptionCaught")
    fun fromSecret(secret: Secret): SessionCredentials? =
        try {
            val json = JsonParser.parseString(secret.reveal()).asJsonObject
            SessionCredentials(
                accessKeyId = json.text(ACCESS_KEY_ID),
                secretAccessKey = json.text(SECRET_ACCESS_KEY),
                sessionToken = json.text(SESSION_TOKEN),
                expirationEpochMillis =
                    json
                        .get(EXPIRATION)
                        .asJsonPrimitive
                        .also { require(it.isNumber) }
                        .asLong,
            )
        } catch (malformed: JsonParseException) {
            null
        } catch (malformed: RuntimeException) {
            // A missing or mistyped field, or an empty value: not credentials this object wrote.
            null
        }

    private fun JsonObject.text(name: String): String =
        get(name)
            .asJsonPrimitive
            .also { require(it.isString) }
            .asString
            .also { require(it.isNotEmpty()) }
}
