package dev.ukitomato.closta.presenter.view

/** The new IDE errors Claude was told about for a tool call: how many, and the first of them as `12:5 message`. */
data class ReportedErrors(
    val count: Int,
    val lines: List<String>,
)

/** Marks the call [key] as one whose new IDE errors were passed on; remembers it when the call has no line yet. */
internal fun Transcript.markReported(
    key: String,
    reported: ReportedErrors,
): Transcript {
    val at = routing.tools[key] ?: return copy(reports = reports.plusEntry(key, reported))
    return updatePart(at, key) { part ->
        if (part is ToolCallRecord && part.reportedErrors != reported) part.copy(reportedErrors = reported) else part
    }
}

/** Marks the call [key] as refused for [denial]; remembers it when the call has no line yet. */
internal fun Transcript.markDenied(
    key: String,
    denial: Denial,
): Transcript {
    val at = routing.tools[key] ?: return copy(denials = denials.plusEntry(key, denial))
    return updatePart(at, key) { part ->
        if (part is ToolCallRecord && part.denied != denial) part.copy(denied = denial) else part
    }
}
