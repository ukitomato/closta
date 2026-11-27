package dev.ukitomato.closta.platforms.intellij.thread

import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.presenter.view.Denial

/**
 * Why the CLI refused a call without asking, for a tooltip: its own words first when it gave some, then the kind of
 * decision in ours (`mode`, `rule`, `classifier`; any other kind as the CLI named it). A refusal that says nothing is
 * just "Denied". The text is shown as plain text, never as HTML.
 */
fun deniedText(denial: Denial?): String {
    val kind =
        when (val type = denial?.reasonType?.takeIf { it.isNotBlank() }) {
            null -> null
            "mode" -> ClostaBundle.message("thread.tool.denied.mode")
            "rule" -> ClostaBundle.message("thread.tool.denied.rule")
            "classifier" -> ClostaBundle.message("thread.tool.denied.classifier")
            else -> ClostaBundle.message("thread.tool.denied.other", type)
        }
    val reason = denial?.reason?.takeIf { it.isNotBlank() }
    return listOfNotNull(reason, kind).joinToString(" — ").ifEmpty { ClostaBundle.message("thread.tool.denied") }
}
