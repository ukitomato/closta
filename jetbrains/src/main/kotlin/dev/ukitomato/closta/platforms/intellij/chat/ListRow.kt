package dev.ukitomato.closta.platforms.intellij.chat

import dev.ukitomato.closta.presenter.view.SessionGroup
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

// What a row of the sessions tree says besides the title, and what is confirmed, decided without the IDE. Free of
// `com.intellij`.

/** The grey part of a row: the project when it is another window's, the repository and branch, and the reason. */
fun secondLine(
    otherProject: String?,
    head: GitHead?,
    reason: String?,
): String = listOfNotNull(otherProject, head?.repository, head?.branch, reason).joinToString(" · ")

/** When a saved conversation was last written, as the lists show it. */
fun timeText(
    at: Instant,
    zone: ZoneId = ZoneId.systemDefault(),
): String = MARK_TIME.withZone(zone).format(at)

private val MARK_TIME: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")

/** Whether stopping or archiving a conversation of [group] is asked once more: only while its CLI works or waits. */
fun asksBeforeStopping(group: SessionGroup): Boolean = group == SessionGroup.WAITING || group == SessionGroup.RUNNING
