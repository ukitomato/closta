package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AttachmentKind

/**
 * What the composer takes as attachments, the same rules as the original webview's (its `attachmentRules`): the
 * limits are conservative, the API's own are not recorded. A text file must also be UTF-8; that is read where the
 * bytes are.
 */
object AttachmentLimits {
    const val MAX_BYTES: Long = 5L * 1024 * 1024
    const val MAX_PER_SEND: Int = 10
    const val MAX_NAME_CHARS: Int = 255
    val MEDIA_TYPES: Set<String> =
        setOf("image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf", "application/json")
    const val TEXT_PREFIX = "text/"
    val TEXT_EXTENSIONS: List<String> =
        listOf(
            ".txt",
            ".md",
            ".csv",
            ".log",
            ".xml",
            ".yaml",
            ".yml",
            ".toml",
            ".ini",
            ".html",
            ".css",
            ".js",
            ".ts",
            ".tsx",
            ".jsx",
            ".kt",
            ".java",
            ".py",
            ".sh",
            ".sql",
        )
}

/** Why a file is not taken. */
enum class AttachmentFault {
    TOO_LARGE,
    TOO_MANY,
    NAME_TOO_LONG,
    UNSUPPORTED,
}

sealed interface AttachmentVerdict {
    data class Ok(
        val kind: AttachmentKind,
        val mediaType: String,
    ) : AttachmentVerdict

    data class Refused(
        val fault: AttachmentFault,
    ) : AttachmentVerdict
}

/**
 * Whether a file of [name], [mediaType] (null when nothing says what it is) and [size] bytes can go with a message that
 * already carries [alreadyAttached] files.
 */
fun checkAttachment(
    name: String,
    mediaType: String?,
    size: Long,
    alreadyAttached: Int,
): AttachmentVerdict {
    val type = mediaTypeOf(name, mediaType)
    return when {
        type == null -> AttachmentVerdict.Refused(AttachmentFault.UNSUPPORTED)
        name.codePointCount(0, name.length) > AttachmentLimits.MAX_NAME_CHARS ->
            AttachmentVerdict.Refused(AttachmentFault.NAME_TOO_LONG)
        size > AttachmentLimits.MAX_BYTES -> AttachmentVerdict.Refused(AttachmentFault.TOO_LARGE)
        alreadyAttached >= AttachmentLimits.MAX_PER_SEND -> AttachmentVerdict.Refused(AttachmentFault.TOO_MANY)
        else -> AttachmentVerdict.Ok(kindOf(type), type)
    }
}

private fun mediaTypeOf(
    name: String,
    given: String?,
): String? {
    val type =
        given
            ?.substringBefore(';')
            ?.trim()
            ?.lowercase()
            .orEmpty()
    if (type.isNotEmpty()) {
        return type.takeIf { it in AttachmentLimits.MEDIA_TYPES || it.startsWith(AttachmentLimits.TEXT_PREFIX) }
    }
    val lower = name.lowercase()
    return "text/plain".takeIf { AttachmentLimits.TEXT_EXTENSIONS.any(lower::endsWith) }
}

private fun kindOf(type: String): AttachmentKind =
    when {
        type.startsWith("image/") -> AttachmentKind.IMAGE
        type == "application/pdf" -> AttachmentKind.DOCUMENT
        else -> AttachmentKind.TEXT
    }
