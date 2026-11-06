package dev.ukitomato.closta.platforms.intellij.settings

import dev.ukitomato.closta.platforms.intellij.store.ProviderId
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ProviderValidationTest {
    private val good =
        BedrockFields(
            region = "us-east-1",
            mfaDeviceArn = "arn:aws:iam::123456789012:mfa/dev-user",
            sessionDurationSeconds = 43_200,
        )

    private fun bedrock(
        name: String = "Bedrock",
        fields: BedrockFields = good,
        id: ProviderId = ProviderId.generate(),
    ) = ProviderRecord(id, name, ProviderKind.BEDROCK, bedrock = fields)

    private fun fieldsWithProblems(
        records: List<ProviderRecord>,
        keyEdits: Map<ProviderId, KeyEdit> = emptyMap(),
    ): List<String> = ProviderValidation.validate(records, keyEdits).map { it.field }

    @Test
    fun `well formed providers have no problems`() {
        val records =
            listOf(
                ProviderRecord(ProviderId.generate(), "Work", ProviderKind.ANTHROPIC),
                bedrock(fields = good.copy(region = "ap-northeast-1", mfaDeviceArn = GOV_ARN)),
                bedrock(name = "GovCloud", fields = good.copy(region = "us-gov-west-1")),
            )
        assertEquals(emptyList<ValidationProblem>(), ProviderValidation.validate(records, emptyMap()))
    }

    @Test
    fun `a blank name and a name another provider has are problems`() {
        val unnamed = ProviderRecord(ProviderId.generate(), " ", ProviderKind.ANTHROPIC)
        assertEquals(listOf("Name"), fieldsWithProblems(listOf(unnamed)))
        val twins =
            listOf(
                ProviderRecord(ProviderId.generate(), "Work", ProviderKind.ANTHROPIC),
                ProviderRecord(ProviderId.generate(), "work ", ProviderKind.ANTHROPIC),
            )
        assertEquals(listOf("Name", "Name"), fieldsWithProblems(twins))
    }

    @Test
    fun `a region that is not a region code is a problem`() {
        listOf("", "US-EAST-1", "useast1", "us-east", "us east 1", "us-east-1a").forEach {
            val record = bedrock(fields = good.copy(region = it))
            assertEquals(listOf("AWS region"), fieldsWithProblems(listOf(record))) { it }
        }
    }

    @Test
    fun `an MFA device of the wrong shape is a problem`() {
        listOf(
            "",
            "arn:aws:iam::12345678901:mfa/dev",
            "arn:aws:iam::123456789012:user/dev",
            "arn:aws:sts::123456789012:mfa/dev",
            "arn:aws:iam::123456789012:mfa/",
            "GAHT1234",
            "G".repeat(257),
            "GAHT 12345678",
            "GAHT#12345678",
        ).forEach {
            val record = bedrock(fields = good.copy(mfaDeviceArn = it))
            assertEquals(listOf("MFA device"), fieldsWithProblems(listOf(record))) { it }
        }
    }

    @Test
    fun `a hardware device's serial number is an MFA device, from 9 to 256 characters`() {
        // STS GetSessionToken's SerialNumber takes a hardware serial number or a virtual device's ARN.
        listOf("GAHT12345678", "GAHT12345", "G".repeat(256), "  GAHT12345678  ", GOV_ARN).forEach {
            val record = bedrock(fields = good.copy(mfaDeviceArn = it))
            assertEquals(emptyList<String>(), fieldsWithProblems(listOf(record))) { it }
        }
    }

    @Test
    fun `the MFA device message names both forms`() {
        val record = bedrock(fields = good.copy(mfaDeviceArn = "GAHT"))
        val message = ProviderValidation.validate(listOf(record), emptyMap()).single().message
        assertTrue(message.contains("serial number")) { message }
        assertTrue(message.contains("GAHT12345678")) { message }
        assertTrue(message.contains("ARN")) { message }
    }

    @Test
    fun `the session duration must be within what STS allows`() {
        mapOf(899 to false, 900 to true, 129_600 to true, 129_601 to false, -1 to false).forEach { (seconds, ok) ->
            val fields = fieldsWithProblems(listOf(bedrock(fields = good.copy(sessionDurationSeconds = seconds))))
            assertEquals(if (ok) emptyList<String>() else listOf("Session duration"), fields) { "$seconds" }
        }
    }

    @Test
    fun `long-term keys must be both or neither, with an access key ID of the right shape`() {
        val record = bedrock()
        val cases =
            mapOf(
                KeyEdit(accessKeyId = "AKIAABCDEFGHIJKLMNOP") to listOf("Long-term keys"),
                KeyEdit(secretAccessKey = "s3cr3t") to listOf("Long-term keys"),
                KeyEdit(accessKeyId = "akiaabcdefghijklmnop", secretAccessKey = "s3cr3t") to listOf("Access key ID"),
                KeyEdit(accessKeyId = "AKIAABCDEFGHIJKLMNO", secretAccessKey = "s3cr3t") to listOf("Access key ID"),
                KeyEdit(accessKeyId = "AKIAABCDEFGHIJKLMNOP", secretAccessKey = "s3cr3t") to emptyList(),
                KeyEdit(accessKeyId = "ASIAABCDEFGHIJKLMNOP", secretAccessKey = "s3cr3t") to listOf("Access key ID"),
                KeyEdit(clear = true) to emptyList(),
                KeyEdit(accessKeyId = "half", clear = true) to emptyList(),
            )
        cases.forEach { (edit, expected) ->
            assertEquals(expected, fieldsWithProblems(listOf(record), mapOf(record.id to edit))) { edit.toString() }
        }
    }

    @Test
    fun `keys typed for a provider that is no longer Bedrock are not checked`() {
        val record = ProviderRecord(ProviderId.generate(), "Work", ProviderKind.ANTHROPIC)
        val edits = mapOf(record.id to KeyEdit(accessKeyId = "half"))
        assertEquals(emptyList<String>(), fieldsWithProblems(listOf(record), edits))
    }

    @Test
    fun `each problem names the provider and the field`() {
        val record = bedrock(name = "Tokyo", fields = good.copy(region = "tokyo"))
        val problem = ProviderValidation.validate(listOf(record), emptyMap()).single()
        assertEquals("Tokyo", problem.providerName)
        assertEquals("AWS region", problem.field)
        assertTrue(problem.describe().startsWith("Tokyo — AWS region: ")) { problem.describe() }
    }

    @Test
    fun `a typed session duration is a problem unless it is a whole number of seconds STS allows`() {
        listOf("", "abc", "3600s", "1.5", "899", "129601", "-1", "99999999999").forEach {
            assertTrue(ProviderValidation.sessionDurationProblem(it) != null) { "accepted '$it'" }
        }
        listOf("900", "3600", " 129600 ").forEach {
            assertEquals(null, ProviderValidation.sessionDurationProblem(it)) { "refused '$it'" }
        }
    }

    @Test
    fun `the problems of one provider leave out the others' but still see a name they share`() {
        val tokyo = bedrock(name = "Tokyo", fields = good.copy(region = "tokyo"))
        val twin = bedrock(name = "tokyo ", fields = good.copy(mfaDeviceArn = ""))
        val records = listOf(tokyo, twin)
        assertEquals(
            listOf("Name", "AWS region"),
            ProviderValidation.problemsOf(tokyo, records, emptyMap()).map { it.field },
        )
        assertEquals(
            ProviderValidation.validate(records, emptyMap()),
            records.flatMap { ProviderValidation.problemsOf(it, records, emptyMap()) },
        )
    }

    private companion object {
        const val GOV_ARN = "arn:aws-us-gov:iam::123456789012:mfa/a.b@c"
    }
}
