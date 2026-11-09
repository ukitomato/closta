package dev.ukitomato.closta.platforms.intellij.settings

import dev.ukitomato.closta.platforms.intellij.store.ProviderId

/**
 * What Apply has to do, worked out before anything is written: the records and active provider to save, the long-term
 * keys to write or clear, and the providers whose secrets to forget — the removed ones, and [noLongerBedrock], the
 * saved Bedrock providers now of another kind. [removed] keeps the removed records so that one whose secrets could not
 * be forgotten can be saved again ([recordsToSave]) — without its id its PasswordSafe entries are lost for good.
 */
class ApplyPlan(
    val records: List<ProviderRecord>,
    val active: ProviderId?,
    val keysToWrite: Map<ProviderId, LongTermKeys>,
    val keysToClear: Set<ProviderId>,
    val removed: List<ProviderRecord>,
    val noLongerBedrock: List<ProviderRecord> = emptyList(),
) {
    /** The ids whose secrets are forgotten, every slot. */
    val providersToForget: Set<ProviderId>
        get() = (removed + noLongerBedrock).mapTo(mutableSetOf()) { it.id }

    /**
     * The records to save once the secrets were applied. A provider whose secrets were not forgotten keeps a record
     * that lets the user try again: a removed one stays in the list, one no longer on Bedrock stays a Bedrock one.
     */
    fun recordsToSave(outcome: SecretOutcome): List<ProviderRecord> {
        val keptAsBedrock = noLongerBedrock.filter { it.id in outcome.failedForget }.associateBy { it.id }
        return records.map { keptAsBedrock[it.id] ?: it } + removed.filter { it.id in outcome.failedForget }
    }

    override fun toString(): String =
        "ApplyPlan(records=${records.size}, active=$active, keysToWrite=${keysToWrite.size}, " +
            "keysToClear=${keysToClear.size}, removed=${removed.size}, noLongerBedrock=${noLongerBedrock.size})"
}

/**
 * The provider list while the settings screen is open: what was saved, what the user changed, and — on Apply — the
 * [ApplyPlan] that takes the saved state to the edited one. Renaming changes the name only; the id stays, because the
 * provider's secrets are keyed by it. Pure, so the fast suite measures it.
 */
@Suppress("TooManyFunctions") // one function per thing the settings screen asks of the edits
class ProviderEditor(
    private val savedRecords: List<ProviderRecord>,
    private val savedActive: ProviderId?,
) {
    private val drafts = savedRecords.toMutableList()
    private val keyEdits = mutableMapOf<ProviderId, KeyEdit>()
    private val removedRecords = mutableListOf<ProviderRecord>()

    /** The provider new sessions use; null is the default Anthropic. Only a provider here can be chosen. */
    var active: ProviderId? = savedActive
        set(value) {
            require(value == null || drafts.any { it.id == value }) { "no provider $value in this editor" }
            field = value
        }

    /** The providers as edited, in order. */
    val records: List<ProviderRecord> get() = drafts.toList()

    /** Adds a provider of [kind] with a fresh id and a name no other provider has, and returns it. */
    fun add(kind: ProviderKind): ProviderRecord {
        val record = ProviderRecord(ProviderId.generate(), uniqueName(kind.displayName, drafts), kind)
        drafts += record
        return record
    }

    /** Replaces the provider with the same id. The id itself never changes here. */
    fun update(record: ProviderRecord) {
        val index = drafts.indexOfFirst { it.id == record.id }
        require(index >= 0) { "no provider ${record.id} in this editor" }
        drafts[index] = record
    }

    /**
     * Removes a provider. A saved one is forgotten on Apply — as it was saved, so a provider whose secrets cannot be
     * forgotten is kept unedited; the active one falls back to the default.
     */
    fun remove(id: ProviderId) {
        val record = drafts.firstOrNull { it.id == id } ?: return
        drafts -= record
        keyEdits -= id
        savedRecords.firstOrNull { it.id == id }?.let { removedRecords += it }
        if (active == id) active = null
    }

    /** Records what the user typed for [id]'s long-term keys. */
    fun editKeys(
        id: ProviderId,
        edit: KeyEdit,
    ) {
        if (edit.changes) keyEdits[id] = edit else keyEdits -= id
    }

    /** What the user typed for [id]'s long-term keys so far. */
    fun keyEdit(id: ProviderId): KeyEdit = keyEdits[id] ?: KeyEdit()

    /** Whether [id] was saved when this editor started — a provider added since has no stored keys. */
    fun isSaved(id: ProviderId): Boolean = savedRecords.any { it.id == id }

    /** Whether Apply would forget [id]'s secrets because a saved Bedrock provider is now of another kind. */
    fun forgetsSecretsOnApply(id: ProviderId): Boolean =
        savedRecords.any { it.id == id && it.kind == ProviderKind.BEDROCK } &&
            drafts.any { it.id == id && it.kind != ProviderKind.BEDROCK }

    /** The problems Apply would refuse. */
    fun problems(): List<ValidationProblem> = ProviderValidation.validate(drafts, keyEdits)

    /** The problems Apply would refuse for [id] alone; none for a provider that is not here. */
    fun problemsOf(id: ProviderId): List<ValidationProblem> =
        drafts.firstOrNull { it.id == id }?.let { ProviderValidation.problemsOf(it, drafts, keyEdits) }.orEmpty()

    /** Whether Apply would change anything. */
    fun isModified(): Boolean = drafts != savedRecords || active != savedActive || keyEdits.values.any { it.changes }

    /** The plan Apply carries out. Call only when [problems] is empty. */
    fun plan(): ApplyPlan {
        check(problems().isEmpty()) { "the edited providers have problems; fix them before applying" }
        val bedrockIds = drafts.filter { it.kind == ProviderKind.BEDROCK }.mapTo(mutableSetOf()) { it.id }
        val write =
            keyEdits
                .filterKeys { it in bedrockIds }
                .mapNotNull { (id, edit) -> edit.replacement()?.let { id to it } }
                .toMap()
        // A saved provider that is no longer a Bedrock one has its Bedrock secrets forgotten, every slot: they would
        // only linger, and its status is no longer shown.
        val noLongerBedrock =
            savedRecords.filter {
                it.kind == ProviderKind.BEDROCK &&
                    it.id !in bedrockIds &&
                    drafts.any { d -> d.id == it.id }
            }
        val clear =
            keyEdits.filterValues { it.clear }.keys - write.keys - noLongerBedrock.mapTo(mutableSetOf()) { it.id }
        return ApplyPlan(drafts.toList(), active, write, clear, removedRecords.toList(), noLongerBedrock)
    }
}

/** [base], or [base] with the first number that makes it a name none of [records] has. */
private fun uniqueName(
    base: String,
    records: List<ProviderRecord>,
): String {
    val taken = records.mapTo(mutableSetOf()) { it.name.trim().lowercase() }
    return generateSequence(1) { it + 1 }
        .map { if (it == 1) base else "$base $it" }
        .first { it.lowercase() !in taken }
}
