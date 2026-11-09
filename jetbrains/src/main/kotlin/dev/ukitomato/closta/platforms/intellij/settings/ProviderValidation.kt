package dev.ukitomato.closta.platforms.intellij.settings

import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.platforms.intellij.store.ProviderId

/** One thing wrong with what the user entered, named by provider and field so the settings screen can point at it. */
data class ValidationProblem(
    val providerName: String,
    val field: String,
    val message: String,
) {
    /** The line the settings screen shows. */
    fun describe(): String = text("line", providerName, field, message)
}

/**
 * Checks the shape of what the user entered before anything is saved. Only the shape: whether a key is valid, or a
 * model exists, needs AWS and comes out at sign-in or at the first request.
 */
object ProviderValidation {
    private const val MIN_SESSION_SECONDS = 900
    private const val MAX_SESSION_SECONDS = 129_600

    /** STS GetSessionToken's range for an IAM user. */
    val SESSION_SECONDS = MIN_SESSION_SECONDS..MAX_SESSION_SECONDS

    private val REGION = Regex("[a-z]{2}(-[a-z]+)+-\\d+")
    private val MFA_DEVICE_ARN = Regex("arn:aws(-[a-z]+)*:iam::\\d{12}:mfa/[\\w+=,.@/-]+")

    // STS GetSessionToken's SerialNumber: a hardware device's serial number (such as GAHT12345678) or a virtual
    // device's ARN, 9 to 256 of these characters (the STS API reference). A value that starts like an ARN is held to
    // the ARN's shape, so a mistyped account number stops here rather than at sign-in.
    private val MFA_SERIAL = Regex("[\\w+=/:,.@-]{9,256}")

    // An IAM user's long-term key: AKIA. ASIA keys are STS temporary credentials and need a session token.
    private val ACCESS_KEY_ID = Regex("AKIA[A-Z0-9]{16}")

    private val NAME: String get() = text("field.name")

    fun validate(
        records: List<ProviderRecord>,
        keyEdits: Map<ProviderId, KeyEdit>,
    ): List<ValidationProblem> = records.flatMap { problemsOf(it, records, keyEdits) }

    /** [record]'s problems among [records]: what the settings screen shows beside its fields as they are typed. */
    fun problemsOf(
        record: ProviderRecord,
        records: List<ProviderRecord>,
        keyEdits: Map<ProviderId, KeyEdit>,
    ): List<ValidationProblem> =
        buildList {
            val name = record.name.ifBlank { text("unnamed") }
            if (record.name.isBlank()) add(ValidationProblem(name, NAME, text("enterName")))
            val sameName = records.count { it.name.trim().equals(record.name.trim(), ignoreCase = true) }
            if (record.name.isNotBlank() && sameName > 1) {
                add(ValidationProblem(name, NAME, text("sameName")))
            }
            record.bedrock?.let { fields ->
                addAll(bedrockProblems(name, fields))
                keyEdits[record.id]?.let { addAll(keyProblems(name, it)) }
            }
        }

    /**
     * What is wrong with a session duration as typed — not a whole number, or outside [SESSION_SECONDS] — or null.
     * The spinner keeps its last good value while the text is wrong, so the text itself is checked.
     */
    fun sessionDurationProblem(typed: String): String? {
        val seconds = typed.trim().toIntOrNull()
        return if (seconds != null && seconds in SESSION_SECONDS) null else sessionDurationMessage()
    }

    private fun sessionDurationMessage(): String =
        text("sessionDuration", "${SESSION_SECONDS.first}", "${SESSION_SECONDS.last}")

    private fun bedrockProblems(
        name: String,
        fields: BedrockFields,
    ): List<ValidationProblem> =
        buildList {
            if (!REGION.matches(fields.region.trim())) {
                add(ValidationProblem(name, text("field.region"), text("region")))
            }
            if (!isMfaDevice(fields.mfaDeviceArn.trim())) {
                add(ValidationProblem(name, text("field.mfaDevice"), text("mfaDevice")))
            }
            if (fields.sessionDurationSeconds !in SESSION_SECONDS) {
                add(
                    ValidationProblem(
                        name,
                        text("field.sessionDuration"),
                        sessionDurationMessage(),
                    ),
                )
            }
        }

    private fun isMfaDevice(device: String): Boolean =
        MFA_SERIAL.matches(device) && (!device.startsWith("arn:") || MFA_DEVICE_ARN.matches(device))

    private fun keyProblems(
        name: String,
        edit: KeyEdit,
    ): List<ValidationProblem> =
        when {
            edit.clear || !edit.typed -> emptyList()
            !edit.complete -> listOf(ValidationProblem(name, text("field.longTermKeys"), text("longTermKeys")))
            !ACCESS_KEY_ID.matches(edit.accessKeyId.trim()) ->
                listOf(ValidationProblem(name, text("field.accessKeyId"), text("accessKeyId")))
            else -> emptyList()
        }
}

private fun text(
    key: String,
    vararg params: Any,
): String = ClostaBundle.message("settings.validation.$key", *params)
