package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.presenter.tree.JsonArray
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonRead
import dev.ukitomato.closta.presenter.tree.JsonString
import dev.ukitomato.closta.presenter.tree.JsonValue

// What the Plugins tab shows, kept next to the operations: the plugins the CLI loaded (`system/init`, then the answer
// to a reload), the load errors it reported, and how the last reload ended.

/** One plugin as the CLI lists it: its manifest's `version`, and `source` (else `path`) for where it comes from. */
data class PluginRow(
    val name: String,
    val version: String?,
    val source: String?,
)

/** One plugin that did not load, or loaded without one of its parts: `plugin` is `name@marketplace` or a tag. */
data class PluginError(
    val plugin: String,
    val type: String,
    val message: String,
)

/**
 * The plugins of a session. [failedOnReload] is how many plugins the last reload could not load (its answer carries a
 * count and no errors); null when none, and before a reload.
 */
data class PluginsRecord(
    val plugins: List<PluginRow>,
    val errors: List<PluginError>,
    val failedOnReload: Int? = null,
)

/** Why the last reload did not happen; null in [OperationRecords] before one, after one that did, after a launch. */
sealed interface ReloadFailure {
    /** The session had work going and the CLI was asked to refuse then. */
    data object Busy : ReloadFailure

    /** The CLI's own sentence. */
    data class Refused(
        val sentence: String,
    ) : ReloadFailure
}

/** What the Plugins tab shows: [plugins] is null until the CLI has listed them. */
data class PluginsView(
    val plugins: PluginsRecord?,
    val reloading: Boolean,
    val failure: ReloadFailure?,
)

/** The Plugins tab's view of [operations]. */
fun pluginsView(operations: OperationRecords): PluginsView =
    PluginsView(operations.plugins, operations.reloadWaiting.isNotEmpty(), operations.reloadFailure)

/** The most plugins and errors kept of one answer. */
const val MAX_PLUGINS = 200

/** The `error_code` of a reload the CLI refused because the session was busy. */
const val RELOAD_PLUGINS_BUSY = "reload_plugins_busy"

/** The capability a CLI lists in `system/init` when it honors `refuse_if_busy`. */
const val REFUSE_IF_BUSY_CAPABILITY = "reload_plugins_refuse_if_busy_v1"

/** The marketplace the CLI's own plugins are listed under (`name@builtin`), and the `path` of such a plugin. */
private const val BUILTIN = "builtin"

/** Whether the CLI ships the plugin itself: it has no folder to open and is not installed from a marketplace. */
val PluginRow.builtIn: Boolean get() = source == BUILTIN || source?.endsWith("@$BUILTIN") == true

/**
 * `system/init` names the plugins, the errors that kept some from loading, and the capabilities of the CLI; each init
 * replaces the plugins the transcript had, and one whose list does not read leaves them.
 */
internal fun foldPluginsOfInit(
    transcript: Transcript,
    event: AgentEvent.SystemInit,
): Transcript {
    val operations = transcript.operations
    val listed = pluginsOf(JsonRead.parse(event.plugins.text))
    val errors = event.pluginErrors?.let { pluginErrorsOf(JsonRead.parse(it.text)) }.orEmpty()
    val advertised = (JsonRead.parse(event.capabilities.text) as? JsonArray)?.items.orEmpty()
    return transcript.withOperations(
        operations.copy(
            plugins = listed?.let { PluginsRecord(it, errors) } ?: operations.plugins,
            refuseIfBusy = advertised.any { (it as? JsonString)?.value == REFUSE_IF_BUSY_CAPABILITY },
        ),
    )
}

/** The rows of a `plugins` array: a row with no name is left out. `source` stands, else the plugin's `path`. */
private fun pluginsOf(value: JsonValue?): List<PluginRow>? =
    (value as? JsonArray)
        ?.items
        ?.mapNotNull { item ->
            val fields = item as? JsonObject
            val name = fields?.string("name")?.takeIf { it.isNotEmpty() } ?: return@mapNotNull null
            PluginRow(
                name = name,
                version = fields.string("version")?.takeIf { it.isNotEmpty() },
                source = (fields.string("source") ?: fields.string("path"))?.takeIf { it.isNotEmpty() },
            )
        }?.take(MAX_PLUGINS)

/** The entries of `plugin_errors`; one without a `plugin` is left out, a missing `message` or `type` reads as empty. */
private fun pluginErrorsOf(value: JsonValue?): List<PluginError> =
    (value as? JsonArray)
        ?.items
        .orEmpty()
        .mapNotNull { item ->
            val fields = item as? JsonObject
            val plugin = fields?.string("plugin")?.takeIf { it.isNotEmpty() } ?: return@mapNotNull null
            PluginError(plugin, fields.string("type").orEmpty(), plainSentenceOf(fields.string("message")))
        }.take(MAX_PLUGINS)

/**
 * The answer to a reload: a success that reads replaces the plugins (with no errors: the answer carries a count, not
 * the errors) and the MCP servers, and clears the last refusal; a refusal is kept, [ReloadFailure.Busy] when the CLI
 * says the session was busy, and leaves the plugins. The commands of the answer are read with every success's.
 */
internal fun OperationRecords.reloadAnswered(
    id: String,
    event: AgentEvent.ControlResponse,
): OperationRecords {
    val settled = copy(reloadWaiting = reloadWaiting - id)
    val whole = JsonRead.parse(event.response.text) as? JsonObject
    return if (event.subtype ==
        "success"
    ) {
        settled.reloaded(whole?.obj("response"))
    } else {
        settled.reloadRefused(whole, event)
    }
}

private fun OperationRecords.reloadRefused(
    whole: JsonObject?,
    event: AgentEvent.ControlResponse,
): OperationRecords {
    val busy = whole?.string("error_code") == RELOAD_PLUGINS_BUSY
    return copy(reloadFailure = if (busy) ReloadFailure.Busy else ReloadFailure.Refused(plainSentenceOf(event.error)))
}

private fun OperationRecords.reloaded(body: JsonObject?): OperationRecords {
    val listed = pluginsOf(body?.array("plugins")) ?: return this
    val servers = mcpServersOf(body)
    val failed = body?.count("error_count")?.takeIf { it > 0 }?.toInt()
    return copy(
        plugins = PluginsRecord(listed, emptyList(), failed),
        reloadFailure = null,
        mcpServers = servers ?: mcpServers,
        mcpUnreadable = if (servers == null) mcpUnreadable else false,
    )
}
