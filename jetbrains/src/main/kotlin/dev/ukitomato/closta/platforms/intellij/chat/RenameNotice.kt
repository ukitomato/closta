package dev.ukitomato.closta.platforms.intellij.chat

import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.platforms.intellij.ui.plainHtml
import dev.ukitomato.closta.presenter.view.visible

/** The CLI refused the name the user gave [entry]'s session: a balloon, with the CLI's sentence as its body. */
internal fun notifyRenameRefused(
    entry: ChatDirectory.Entry,
    sentence: String,
) {
    NotificationGroupManager
        .getInstance()
        .getNotificationGroup(NoticeGroups.RUNNING)
        .createNotification(
            ClostaBundle.message("chat.alert.renameRefused", plainHtml(visible(entry.title).text)),
            plainHtml(visible(sentence).text),
            NotificationType.WARNING,
        ).setDisplayId("closta.alert.renameRefused")
        .notify(entry.project)
}
