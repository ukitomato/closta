package dev.ukitomato.closta.core.models

/** What an [Attachment] is to the agent: an image, a document (a PDF), or text sent as a sentence. */
enum class AttachmentKind {
    IMAGE,
    DOCUMENT,
    TEXT,
}

/**
 * One file the user sent with a message: its [kind], its [mediaType], the [name] it had, its [bytes], and the [path]
 * of the file it was read from (null for what was pasted).
 *
 * The bytes, the name and the path are the user's own: they are sent or kept, and never logged or put in an exception.
 * [toString] says only the kind and the size, for that reason. Equality is by content, so a test can compare what was
 * passed on.
 */
class Attachment(
    val kind: AttachmentKind,
    val mediaType: String,
    val name: String,
    val bytes: ByteArray,
    val path: String? = null,
) {
    override fun equals(other: Any?): Boolean =
        other is Attachment &&
            kind == other.kind &&
            mediaType == other.mediaType &&
            name == other.name &&
            path == other.path &&
            bytes.contentEquals(other.bytes)

    override fun hashCode(): Int = (kind.hashCode() * HASH + mediaType.hashCode()) * HASH + bytes.contentHashCode()

    override fun toString(): String = "Attachment($kind, ${bytes.size} bytes)"

    private companion object {
        const val HASH = 31
    }
}
