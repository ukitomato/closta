package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.presenter.tree.JsonArray
import dev.ukitomato.closta.presenter.tree.JsonBool
import dev.ukitomato.closta.presenter.tree.JsonObject

/**
 * The answer to `list_permission_rules`: the rules the session runs with, the folders it may work in, the directory it
 * started in, and what keeps rules out. [withheld] says the CLI cut the answer. `toString` says only counts: the rules
 * and paths are the user's.
 */
data class PermissionRulesRecord(
    val rules: List<PermissionRule>,
    val directories: List<WorkspaceDirectory>,
    val originalCwd: String,
    val managedOnly: Boolean,
    val errors: List<SettingsError>,
    val withheld: Boolean,
) {
    override fun toString(): String =
        "PermissionRulesRecord(rules=${rules.size}, directories=${directories.size}, errors=${errors.size})"
}

/**
 * One rule: [behavior] is `allow`, `ask` or `deny`; [source] is the CLI's name of where it comes from; [rule] is the
 * stored string. The CLI's plain reading of it is [prefix], [emphasis], [suffix] (each may be absent).
 */
data class PermissionRule(
    val behavior: String,
    val source: String,
    val rule: String,
    val prefix: String?,
    val emphasis: String?,
    val suffix: String?,
    val editability: String,
    val notInEffect: Boolean,
) {
    override fun toString(): String = "PermissionRule(behavior=$behavior, source=$source)"
}

/** A folder the session may work in, and where the grant came from. */
data class WorkspaceDirectory(
    val path: String,
    val source: String,
) {
    override fun toString(): String = "WorkspaceDirectory(source=$source)"
}

/** A settings file the CLI could not read, and why; [file] is absent for an error of no file. */
data class SettingsError(
    val file: String?,
    val message: String,
) {
    override fun toString(): String = "SettingsError()"
}

private val BEHAVIORS = setOf("allow", "ask", "deny")

/** Reads the `response` of a `list_permission_rules` answer; null when it has no `state`. */
internal fun permissionRulesOf(body: JsonObject): PermissionRulesRecord? {
    val state = body.obj("state") ?: return null
    val rules =
        (state["rules"] as? JsonArray)?.items.orEmpty().mapNotNull { (it as? JsonObject)?.let(::ruleOf) }
    val directories =
        (state["workspaceDirectories"] as? JsonArray)?.items.orEmpty().mapNotNull { item ->
            val row = item as? JsonObject ?: return@mapNotNull null
            WorkspaceDirectory(row.string("path") ?: return@mapNotNull null, row.string("source").orEmpty())
        }
    val errors =
        (state["errors"] as? JsonArray)?.items.orEmpty().mapNotNull { item ->
            val row = item as? JsonObject ?: return@mapNotNull null
            SettingsError(
                row.string("file")?.takeIf { it.isNotEmpty() },
                row.string("message") ?: return@mapNotNull null,
            )
        }
    return PermissionRulesRecord(
        rules = rules,
        directories = directories,
        originalCwd = state.string("originalCwd").orEmpty(),
        managedOnly = (state["managedOnly"] as? JsonBool)?.value == true,
        errors = errors,
        withheld = (state["withheld"] as? JsonBool)?.value == true,
    )
}

private fun ruleOf(row: JsonObject): PermissionRule? {
    val behavior = row.string("behavior")?.takeIf { it in BEHAVIORS }
    val rule = row.string("rule")
    if (behavior == null || rule == null) return null
    val description = row.obj("description")
    return PermissionRule(
        behavior = behavior,
        source = row.string("source").orEmpty(),
        rule = rule,
        prefix = description?.string("prefix"),
        emphasis = description?.string("emphasis"),
        suffix = description?.string("suffix"),
        editability = row.string("editability").orEmpty(),
        notInEffect = (row["notInEffect"] as? JsonBool)?.value == true,
    )
}
