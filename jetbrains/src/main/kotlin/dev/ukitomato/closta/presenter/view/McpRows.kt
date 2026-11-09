package dev.ukitomato.closta.presenter.view

/**
 * One MCP server as the MCP tab shows it. Every value is the CLI's; the server's `config` was never read, so it cannot
 * be here. [status] is the CLI's word for the state; the screen finds the words it shows for it.
 */
data class McpRow(
    val name: String,
    val status: String,
    val tools: Int,
    val error: String?,
    val canToggle: Boolean,
    val enabled: Boolean,
    val canReconnect: Boolean,
    val needsSignIn: Boolean,
    val busy: Boolean,
)

/** What the MCP tab shows: nothing listed yet, a list that could not be read, or the rows. */
sealed interface McpList {
    data object Waiting : McpList

    data object Unreadable : McpList

    /**
     * The servers in the CLI's order. [stale] says the last ask could not be read, so these are the list before it;
     * [notice] is the sentence of the last MCP switch when it was refused or failed.
     */
    data class Rows(
        val rows: List<McpRow>,
        val stale: Boolean = false,
        val notice: String? = null,
    ) : McpList
}

/** The MCP tab's list of [operations]. */
fun mcpList(operations: OperationRecords): McpList {
    val listed = operations.mcpServers ?: return if (operations.mcpUnreadable) McpList.Unreadable else McpList.Waiting
    val mcpSwitches = operations.switches.filter { it.kind.isMcp }
    val busy = mcpSwitches.filter { it.outcome == SwitchOutcome.PENDING }.map { it.value }.toSet()
    val last = mcpSwitches.lastOrNull()
    val notice =
        last?.takeIf { it.outcome == SwitchOutcome.REJECTED || it.outcome == SwitchOutcome.FAILED }?.detail
    return McpList.Rows(
        listed.map { rowOf(it, it.isBuiltIn(operations.builtInMcpServers), it.name in busy) },
        stale = operations.mcpUnreadable,
        notice = notice,
    )
}

private fun rowOf(
    server: McpServerRecord,
    builtIn: Boolean,
    busy: Boolean,
): McpRow {
    val free = !builtIn && !busy
    return McpRow(
        name = server.name,
        status = server.status,
        tools = server.tools.size,
        error = server.error,
        canToggle = free && server.status != MCP_UNKNOWN,
        enabled = server.status != "disabled",
        canReconnect = free && server.status != "needs-auth" && server.status != "disabled",
        needsSignIn = server.status == "needs-auth",
        busy = busy,
    )
}
