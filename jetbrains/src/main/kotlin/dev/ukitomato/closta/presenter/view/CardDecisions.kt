package dev.ukitomato.closta.presenter.view

/** What pressing one of a permission card's buttons decides. */
enum class PermissionChoice { ALLOW, ALLOW_KEEP, DENY }

/**
 * What the button at [index] decides, in the card's order: Allow, then Always Allow when the CLI offered something to
 * keep ([hasSuggestions]), then Deny. An index past the last button denies.
 */
fun permissionChoice(
    index: Int,
    hasSuggestions: Boolean,
): PermissionChoice =
    when {
        index == 0 -> PermissionChoice.ALLOW
        index == 1 && hasSuggestions -> PermissionChoice.ALLOW_KEEP
        else -> PermissionChoice.DENY
    }

/** The suggestion kinds that save a permission rule, so a destination applies to them. */
val RULE_KINDS = setOf("addRules", "replaceRules", "removeRules")

/**
 * The [suggestions] an allow keeps: each as the CLI offered it. When the user chose a [destination] only the rule
 * suggestions move there; a mode switch or a directory grant stays where it was offered.
 */
fun keptSuggestions(
    suggestions: List<SuggestionRecord>,
    destination: String?,
): List<SuggestionRecord> {
    val where = destination ?: return suggestions
    return suggestions.map { if (it.kind !in RULE_KINDS || it.destination == where) it else withDestination(it, where) }
}

/** One question as the user answered it: the labels [chosen], and the [other] line when Other is chosen. */
data class QuestionPick(
    val question: String,
    val chosen: List<String>,
    val other: String?,
)

/** The answers by question: the chosen labels and the Other line (trimmed, when not blank) joined with ", ". */
fun questionAnswers(picks: List<QuestionPick>): Map<String, String> = picks.associate { it.question to answerOf(it) }

/** Whether every question in [picks] has an answer, so the answer may go. */
fun questionsComplete(picks: List<QuestionPick>): Boolean = picks.all { answerOf(it).isNotEmpty() }

private fun answerOf(pick: QuestionPick): String =
    (pick.chosen + listOfNotNull(pick.other?.trim()?.takeIf { it.isNotEmpty() })).joinToString(", ")
