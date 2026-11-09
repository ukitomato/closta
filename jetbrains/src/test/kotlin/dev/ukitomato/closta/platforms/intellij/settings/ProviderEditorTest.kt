package dev.ukitomato.closta.platforms.intellij.settings

import dev.ukitomato.closta.platforms.intellij.store.ProviderId
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

class ProviderEditorTest {
    private val fields =
        BedrockFields(
            region = "us-east-1",
            mfaDeviceArn = "arn:aws:iam::123456789012:mfa/dev",
            sessionDurationSeconds = 3_600,
        )
    private val workId = ProviderId.parse("0d6f2c1e-4b7a-4c55-9e1f-2a3b4c5d6e7f")!!
    private val tokyoId = ProviderId.parse("8a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d")!!
    private val work = ProviderRecord(workId, "Work", ProviderKind.ANTHROPIC)
    private val tokyo = ProviderRecord(tokyoId, "Tokyo", ProviderKind.BEDROCK, bedrock = fields)
    private val keys = KeyEdit("AKIAABCDEFGHIJKLMNOP", "s3cr3t")

    @Test
    fun `nothing changed plans nothing`() {
        val editor = ProviderEditor(listOf(work, tokyo), tokyo.id)
        assertFalse(editor.isModified())
        val plan = editor.plan()
        assertEquals(listOf(work, tokyo), plan.records)
        assertEquals(tokyo.id, plan.active)
        assertTrue(plan.keysToWrite.isEmpty())
        assertTrue(plan.keysToClear.isEmpty())
        assertTrue(plan.providersToForget.isEmpty())
    }

    @Test
    fun `an added provider gets a fresh id and a name no other provider has`() {
        val editor = ProviderEditor(emptyList(), null)
        val first = editor.add(ProviderKind.ANTHROPIC)
        val second = editor.add(ProviderKind.ANTHROPIC)
        val bedrock = editor.add(ProviderKind.BEDROCK)
        assertEquals(
            listOf("Anthropic", "Anthropic 2", "Amazon Bedrock"),
            editor.records.map { it.name },
        )
        assertEquals(3, setOf(first.id, second.id, bedrock.id).size)
        assertNull(first.bedrock)
        assertEquals(BedrockFields(), bedrock.bedrock)
        assertTrue(editor.isModified())
    }

    @Test
    fun `renaming keeps the id`() {
        val editor = ProviderEditor(listOf(tokyo), tokyo.id)
        editor.update(tokyo.copy(name = "Tokyo (renamed)"))
        val plan = editor.plan()
        assertEquals(listOf(tokyo.id), plan.records.map { it.id })
        assertEquals("Tokyo (renamed)", plan.records.single().name)
        assertEquals(tokyo.id, plan.active)
        assertTrue(plan.providersToForget.isEmpty())
        assertTrue(plan.keysToClear.isEmpty())
    }

    @Test
    fun `removing a saved provider forgets it, and removing the active one falls back to the default`() {
        val editor = ProviderEditor(listOf(work, tokyo), tokyo.id)
        editor.remove(tokyo.id)
        assertNull(editor.active)
        val plan = editor.plan()
        assertEquals(listOf(work), plan.records)
        assertNull(plan.active)
        assertEquals(setOf(tokyo.id), plan.providersToForget)
        assertEquals(listOf(tokyo), plan.removed)
    }

    @Test
    fun `removing a provider that was never saved forgets nothing`() {
        val editor = ProviderEditor(listOf(work), null)
        val added = editor.add(ProviderKind.BEDROCK)
        editor.editKeys(added.id, keys)
        editor.remove(added.id)
        val plan = editor.plan()
        assertTrue(plan.providersToForget.isEmpty())
        assertTrue(plan.keysToWrite.isEmpty())
        assertFalse(editor.isModified())
    }

    @Test
    fun `typed keys are written and a clear request clears them`() {
        val editor = ProviderEditor(listOf(tokyo), null)
        editor.editKeys(tokyo.id, keys)
        assertTrue(editor.isModified())
        assertEquals(setOf(tokyo.id), editor.plan().keysToWrite.keys)
        assertEquals(
            "AKIAABCDEFGHIJKLMNOP",
            editor
                .plan()
                .keysToWrite
                .getValue(tokyo.id)
                .accessKeyId,
        )

        editor.editKeys(tokyo.id, KeyEdit(clear = true))
        assertTrue(editor.plan().keysToWrite.isEmpty())
        assertEquals(setOf(tokyo.id), editor.plan().keysToClear)

        editor.editKeys(tokyo.id, KeyEdit())
        assertFalse(editor.isModified())
    }

    @Test
    fun `a saved Bedrock provider switched to Anthropic has all its secrets forgotten and keeps its record`() {
        val editor = ProviderEditor(listOf(tokyo), null)
        editor.editKeys(tokyo.id, keys)
        editor.update(tokyo.copy(kind = ProviderKind.ANTHROPIC, bedrock = null))
        val plan = editor.plan()
        assertTrue(plan.keysToWrite.isEmpty())
        assertTrue(plan.keysToClear.isEmpty())
        assertEquals(setOf(tokyo.id), plan.providersToForget)
        assertTrue(plan.removed.isEmpty())
        assertEquals(ProviderKind.ANTHROPIC, plan.recordsToSave(SecretOutcome(emptySet(), emptyList())).single().kind)
        // Not forgotten: it stays the saved Bedrock provider, so changing the kind again retries.
        assertEquals(listOf(tokyo), plan.recordsToSave(SecretOutcome(setOf(tokyo.id), emptyList())))
    }

    @Test
    fun `only a saved Bedrock provider now of another kind forgets its secrets on Apply`() {
        val editor = ProviderEditor(listOf(work, tokyo), null)
        val added = editor.add(ProviderKind.BEDROCK)
        assertFalse(editor.forgetsSecretsOnApply(tokyo.id))
        editor.update(tokyo.copy(kind = ProviderKind.ANTHROPIC, bedrock = null))
        assertTrue(editor.forgetsSecretsOnApply(tokyo.id))
        editor.update(tokyo)
        assertFalse(editor.forgetsSecretsOnApply(tokyo.id))
        assertFalse(editor.forgetsSecretsOnApply(work.id))
        editor.update(added.copy(kind = ProviderKind.ANTHROPIC, bedrock = null))
        assertFalse(editor.forgetsSecretsOnApply(added.id))
    }

    @Test
    fun `the records to save keep a removed provider only when its secrets could not be forgotten`() {
        val editor = ProviderEditor(listOf(work, tokyo), tokyo.id)
        editor.remove(tokyo.id)
        val plan = editor.plan()
        assertEquals(listOf(work), plan.recordsToSave(SecretOutcome(emptySet(), emptyList())))
        assertEquals(listOf(work, tokyo), plan.recordsToSave(SecretOutcome(setOf(tokyo.id), emptyList())))
        assertNull(plan.active)
    }

    @Test
    fun `a removed provider whose secrets stay is kept as it was saved, not as it was edited`() {
        // Apply did not save the edits, so the kept record is the saved one.
        val editor = ProviderEditor(listOf(work, tokyo), null)
        editor.update(tokyo.copy(name = "Edited", bedrock = fields.copy(region = "eu-west-1")))
        editor.remove(tokyo.id)
        val plan = editor.plan()
        assertEquals(listOf(tokyo), plan.removed)
        assertEquals(listOf(work, tokyo), plan.recordsToSave(SecretOutcome(setOf(tokyo.id), emptyList())))
    }

    @Test
    fun `a provider switched away from Bedrock is forgotten, not also cleared`() {
        // Its secrets go with every slot (forget); clearing its keys as well would act on it twice.
        val editor = ProviderEditor(listOf(tokyo), null)
        editor.editKeys(tokyo.id, KeyEdit(clear = true))
        editor.update(tokyo.copy(kind = ProviderKind.ANTHROPIC, bedrock = null))
        val plan = editor.plan()
        assertFalse(tokyo.id in plan.keysToClear)
        assertTrue(tokyo.id in plan.providersToForget)
    }

    @Test
    fun `keys typed and not applied are still there when the provider is selected again`() {
        val editor = ProviderEditor(listOf(work, tokyo), null)
        editor.editKeys(tokyo.id, KeyEdit("", "only-the-secret"))
        assertEquals("only-the-secret", editor.keyEdit(tokyo.id).typedSecretAccessKey())
        assertEquals("", editor.keyEdit(work.id).typedSecretAccessKey())
    }

    @Test
    fun `only the providers saved when the editor started count as saved`() {
        val editor = ProviderEditor(listOf(work), null)
        val added = editor.add(ProviderKind.BEDROCK)
        assertTrue(editor.isSaved(work.id))
        assertFalse(editor.isSaved(added.id))
        editor.remove(work.id)
        assertTrue(editor.isSaved(work.id))
    }

    @Test
    fun `choosing the active provider is planned, and only a known provider can be chosen`() {
        val editor = ProviderEditor(listOf(work, tokyo), null)
        editor.active = work.id
        assertEquals(work.id, editor.plan().active)
        editor.active = null
        assertFalse(editor.isModified())
        assertThrows<IllegalArgumentException> { editor.active = ProviderId.generate() }
    }

    @Test
    fun `a plan is refused while there are problems`() {
        val editor = ProviderEditor(listOf(tokyo), null)
        editor.update(tokyo.copy(bedrock = fields.copy(region = "")))
        assertEquals(listOf("AWS region"), editor.problems().map { it.field })
        assertThrows<IllegalStateException> { editor.plan() }
    }

    @Test
    fun `the plan prints no key`() {
        val editor = ProviderEditor(listOf(tokyo), null)
        editor.editKeys(tokyo.id, keys)
        val text = editor.plan().toString()
        assertFalse("s3cr3t" in text) { text }
        assertFalse("AKIAABCDEFGHIJKLMNOP" in text) { text }
    }

    @Test
    fun `one provider's problems are the ones Apply would refuse for it, with the keys typed for it`() {
        val editor = ProviderEditor(listOf(work, tokyo), null)
        editor.update(tokyo.copy(bedrock = fields.copy(region = "tokyo")))
        editor.editKeys(tokyo.id, KeyEdit(accessKeyId = "AKIAABCDEFGHIJKLMNOP"))
        assertEquals(listOf("AWS region", "Long-term keys"), editor.problemsOf(tokyo.id).map { it.field })
        assertEquals(emptyList<ValidationProblem>(), editor.problemsOf(work.id))
        assertEquals(emptyList<ValidationProblem>(), editor.problemsOf(ProviderId.generate()))
    }
}
