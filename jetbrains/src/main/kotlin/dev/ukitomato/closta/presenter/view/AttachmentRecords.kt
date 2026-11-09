package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AttachmentKind
import dev.ukitomato.closta.presenter.tree.JsonNumber
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonString

// What the thread keeps of the files a user sent with a message: the point of each, never its bytes.

/**
 * One file the user sent: its [name], what it is ([kind], [mediaType]), how many bytes it was ([size]) and the
 * [path] it was read from (null when it was pasted, or put back from a record). It is a part of the user's message in
 * the tree, ahead of the words; the tree does not carry the path. The name and the path are the user's own:
 * [toString] leaves them out.
 */
data class AttachmentRecord(
    val name: String,
    val kind: AttachmentKind,
    val mediaType: String,
    val size: Long,
    val path: String? = null,
) : PartRecord {
    override fun toString(): String = "AttachmentRecord($kind, $size bytes)"
}

/** Why the host did not send a message that came with attachments: a closed set of words, never a name. */
enum class AttachmentRefusal(
    val wire: String,
) {
    MISSING("missing"),
    TOO_LARGE("too-large"),
    TOO_MANY("too-many"),
    UNSUPPORTED("unsupported"),
    NOT_TEXT("not-text"),
}

/** The host did not send a message because of its attachments: a record that is over at once, like a refused resume. */
internal fun OperationRecords.refuseAttachment(input: PresenterInput.AttachmentRefused): OperationRecords =
    if (switches.any { it.id == input.requestId }) {
        this
    } else {
        withSwitch(
            SwitchRecord(
                input.requestId,
                seq + 1,
                SwitchKind.ATTACHMENT,
                input.reason.wire,
                SwitchOutcome.REJECTED,
            ),
        )
    }

/** The part of the tree for [record]: its name, kind, media type and size, and nothing of its content. */
internal fun attachmentNode(record: AttachmentRecord): JsonObject =
    JsonObject.of(
        "type" to JsonString("attachment"),
        "name" to JsonString(record.name),
        "kind" to JsonString(record.kind.name.lowercase()),
        "mediaType" to JsonString(record.mediaType),
        "size" to JsonNumber.of(record.size),
    )
