package dev.ukitomato.closta.presenter.view

/** The words an export says in English: what the golden files hold. */
val ENGLISH_EXPORT_WORDS =
    ExportWords(
        you = "You",
        claude = "Claude",
        attachment = "Attachment",
        subagent = "Subagent",
        denied = "denied",
        withdrawn = "withdrawn",
        cleared = "The conversation was cleared here.",
        compacted = "The conversation was compacted here.",
        olderLeftOut = "Older messages of this conversation are not included.",
        model = "Model",
        exportedAt = "Exported",
    )

val EXPORT_HEADER = ExportHeader("Export test", "claude-test", "2026-11-28 10:00")
