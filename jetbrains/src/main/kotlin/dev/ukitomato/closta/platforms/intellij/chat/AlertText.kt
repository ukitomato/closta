package dev.ukitomato.closta.platforms.intellij.chat

import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.presenter.view.AlertKind
import dev.ukitomato.closta.presenter.view.FinishedAlert
import dev.ukitomato.closta.presenter.view.OpenOnlyAlert
import dev.ukitomato.closta.presenter.view.PermissionAlert
import dev.ukitomato.closta.presenter.view.SessionAlert

/**
 * The words of a notification; [answerable] says whether it carries Allow and Deny besides Open. [title] and [body] are
 * plain text (the OS notice's); a balloon draws HTML, so it shows [htmlTitle] and [htmlBody].
 */
data class AlertText(
    val title: String,
    val body: String,
    val answerable: Boolean,
) {
    val htmlTitle: String get() = escapeHtml(title)
    val htmlBody: String get() = escapeHtml(body)
}

/** [text] as HTML shows it as written: a command's `<`, `>` and `&`, a title's quotes. */
fun escapeHtml(text: String): String =
    buildString(text.length) {
        for (c in text) {
            when (c) {
                '&' -> append("&amp;")
                '<' -> append("&lt;")
                '>' -> append("&gt;")
                '"' -> append("&quot;")
                '\'' -> append("&#39;")
                else -> append(c)
            }
        }
    }

/** Whether the OS is told too while the IDE is behind another application: only what waits for an answer. */
fun wantsOsNotice(alert: SessionAlert): Boolean = alert !is FinishedAlert

/**
 * What a notification about the session [sessionTitle] says. Only the session's title and what a permission is for (the
 * start of a command, a file name) are in it: nothing else of the conversation. Free of `com.intellij`.
 */
fun alertText(
    sessionTitle: String,
    alert: SessionAlert,
): AlertText =
    when (alert) {
        is PermissionAlert ->
            AlertText(
                ClostaBundle.message("chat.alert.permission", sessionTitle, alert.toolName),
                alert.subject,
                alert.answerable,
            )
        is OpenOnlyAlert ->
            AlertText(
                when (alert.what) {
                    AlertKind.PLAN -> ClostaBundle.message("chat.alert.plan", sessionTitle)
                    AlertKind.QUESTION -> ClostaBundle.message("chat.alert.question", sessionTitle)
                    AlertKind.EDIT -> ClostaBundle.message("chat.alert.edit", sessionTitle)
                },
                "",
                answerable = false,
            )
        is FinishedAlert -> AlertText(ClostaBundle.message("chat.alert.finished", sessionTitle), "", answerable = false)
    }

/** What the one waiting notification of [sessionTitle] says: its oldest wait and how many wait behind it. */
fun alertText(
    sessionTitle: String,
    notice: WaitingNotice,
): AlertText {
    val text = alertText(sessionTitle, notice.alert)
    if (notice.more == 0) return text
    val more = ClostaBundle.message("chat.alert.more", notice.more)
    return text.copy(body = if (text.body.isEmpty()) more else "${text.body} · $more")
}
