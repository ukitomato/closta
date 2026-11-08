package dev.ukitomato.closta.platforms.intellij.chat

import com.intellij.icons.AllIcons
import com.intellij.notification.Notification
import com.intellij.notification.NotificationAction
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.EDT
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.util.text.StringUtil
import com.intellij.ui.SystemNotifications
import dev.ukitomato.closta.core.models.ApprovalDecision
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.platforms.intellij.session.SessionView
import dev.ukitomato.closta.platforms.intellij.sessions.showInSessions
import dev.ukitomato.closta.platforms.intellij.thread.CardAnswer
import dev.ukitomato.closta.platforms.intellij.thread.openEditDiff
import dev.ukitomato.closta.presenter.view.AlertKind
import dev.ukitomato.closta.presenter.view.FinishedAlert
import dev.ukitomato.closta.presenter.view.OpenOnlyAlert
import dev.ukitomato.closta.presenter.view.PermissionAlert
import dev.ukitomato.closta.presenter.view.SessionAlert
import dev.ukitomato.closta.presenter.view.allowPayload
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * The notifications about sessions the user does not see. What each session's changes raise is [AlertBook]'s: a
 * session in view says nothing (its cards are in the conversation), and what still waits when it goes out of view
 * ([hidden]) is raised then; one out of view raises a balloon in its project's window, and an IDE behind another
 * application also tells the OS of what waits (not of a finished turn). What waits stays until it is answered
 * ([NoticeGroups.WAITING], a sticky balloon); a finished turn is a balloon of its own group
 * ([NoticeGroups.FINISHED]), so it can be turned off alone. A notification goes when what it was about is over
 * (answered, or taken back by the CLI) or when it is used.
 * Its words are escaped: a command's `<` or `&` is shown as written.
 *
 * Only a permission can be answered from its notification (Allow, Deny), through the same [ChatSource.respond] as its
 * card, so the CLI is answered once whichever is pressed first. A plan, a question or an edit only opens the session.
 *
 * Owned by [ChatDirectory]; runs on the EDT.
 */
class SessionAlerts(
    private val directory: ChatDirectory,
    private val scope: CoroutineScope,
    parent: Disposable,
) {
    private val book = AlertBook()
    private val waiting = HashMap<String, Notification>()
    private val finished = HashMap<String, MutableMap<String, Notification>>()

    private val failures =
        CoroutineExceptionHandler { _, failure ->
            thisLogger().warn("alerts: an answer failed (${failure.javaClass.name})")
        }

    init {
        directory.onViewChanged(parent, ::changed)
        scope.launch {
            directory.entries.collect { entries ->
                val open = entries.mapTo(HashSet()) { it.sessionId }
                withContext(Dispatchers.EDT) {
                    (book.sessionIds() + waiting.keys + finished.keys).filter { it !in open }.forEach(::forget)
                }
            }
        }
    }

    private fun changed(
        entry: ChatDirectory.Entry,
        view: SessionView,
    ) {
        val id = entry.sessionId
        apply(entry, book.changed(id, view.conversation to view.transcript, directory.isVisible(id)))
    }

    /** The session [sessionId] went out of view: what still waits in it and is not shown yet is shown now. */
    fun hidden(sessionId: String) {
        val entry = directory.entries.value.firstOrNull { it.sessionId == sessionId } ?: return
        apply(entry, book.hidden(sessionId))
    }

    private fun apply(
        entry: ChatDirectory.Entry,
        change: NoticeChange,
    ) {
        if (change.replace) {
            waiting.remove(entry.sessionId)?.expire()
            change.waiting?.let { notice -> raiseWaiting(entry, notice, change.fresh) }
        }
        change.finished?.let { raiseFinished(entry, it) }
    }

    private fun raiseWaiting(
        entry: ChatDirectory.Entry,
        notice: WaitingNotice,
        fresh: Boolean,
    ) {
        val alert = notice.alert
        val text = alertText(entry.title, notice)
        val notification =
            NotificationGroupManager
                .getInstance()
                .getNotificationGroup(NoticeGroups.WAITING)
                .createNotification(text.htmlTitle, text.htmlBody, NotificationType.INFORMATION)
                .setDisplayId("closta.alert.waiting")
                .setIcon(AllIcons.General.Information)
        if (alert is PermissionAlert && text.answerable) {
            notification.addAction(answer(ClostaBundle.message("chat.alert.allow"), entry, alert, allow = true))
            notification.addAction(answer(ClostaBundle.message("chat.alert.deny"), entry, alert, allow = false))
        }
        addOpenActions(notification, entry, alert)
        waiting[entry.sessionId] = notification
        notification.whenExpired { waiting.remove(entry.sessionId, notification) }
        notification.notify(entry.project)
        if (fresh && wantsOsNotice(alert) && !ApplicationManager.getApplication().isActive) {
            SystemNotifications.getInstance().notify(NoticeGroups.WAITING, text.title, text.body)
        }
    }

    private fun raiseFinished(
        entry: ChatDirectory.Entry,
        alert: FinishedAlert,
    ) {
        val text = alertText(entry.title, alert)
        val notification =
            NotificationGroupManager
                .getInstance()
                .getNotificationGroup(NoticeGroups.FINISHED)
                .createNotification(text.htmlTitle, text.htmlBody, NotificationType.INFORMATION)
                .setDisplayId("closta.alert.finished")
                .setIcon(AllIcons.Status.Success)
        addOpenActions(notification, entry, alert)
        val mine = finished.getOrPut(entry.sessionId) { HashMap() }
        mine.remove(alert.key)?.expire()
        mine[alert.key] = notification
        notification.whenExpired { mine.remove(alert.key, notification) }
        notification.notify(entry.project)
    }

    private fun addOpenActions(
        notification: Notification,
        entry: ChatDirectory.Entry,
        alert: SessionAlert,
    ) {
        if (alert is OpenOnlyAlert && alert.what == AlertKind.EDIT) {
            notification.addAction(
                NotificationAction.createSimple(ClostaBundle.message("thread.permission.openDiff")) {
                    entry.source.view.value.transcript.approvals[alert.requestId]
                        ?.let { openEditDiff(entry.project, it) }
                },
            )
        }
        notification.addAction(
            NotificationAction.createSimpleExpiring(OPEN_CONVERSATION) {
                bringAndShow(entry.project, entry.sessionId)
            },
        )
    }

    private fun answer(
        label: String,
        entry: ChatDirectory.Entry,
        alert: PermissionAlert,
        allow: Boolean,
    ) = NotificationAction.createSimpleExpiring(label) {
        val approval = entry.source.view.value.transcript.approvals[alert.requestId]
        if (approval != null) {
            val answer =
                if (allow) {
                    CardAnswer(alert.requestId, ApprovalDecision.Allow(alert.requestId), allowPayload(approval))
                } else {
                    CardAnswer(alert.requestId, ApprovalDecision.Deny(alert.requestId), "")
                }
            scope.launch(failures) { entry.source.respond(answer) }
        }
    }

    /**
     * The last screen of [entry]'s session closed while it runs: it goes on, and the Sessions window is where it is
     * watched. A balloon, no modal.
     */
    fun keepsRunning(entry: ChatDirectory.Entry) {
        NotificationGroupManager
            .getInstance()
            .getNotificationGroup(NoticeGroups.RUNNING)
            .createNotification(
                ClostaBundle.message("chat.alert.keepsRunning", StringUtil.escapeXmlEntities(entry.title)),
                ClostaBundle.message("chat.alert.keepsRunning.body"),
                NotificationType.INFORMATION,
            ).setDisplayId("closta.alert.keepsRunning")
            .addAction(
                NotificationAction.createSimpleExpiring(ClostaBundle.message("chat.alert.showInSessions")) {
                    showInSessions(entry.project, entry.sessionId)
                },
            ).notify(entry.project)
    }

    private fun forget(sessionId: String) {
        book.forget(sessionId)
        waiting.remove(sessionId)?.expire()
        finished
            .remove(sessionId)
            ?.values
            ?.toList()
            ?.forEach(Notification::expire)
    }

    private companion object {
        val OPEN_CONVERSATION: String get() = ClostaBundle.message("notify.openConversation")
    }
}
