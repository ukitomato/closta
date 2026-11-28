package dev.ukitomato.closta.presenter.view

/** How long a session's name in the sessions list may be. */
const val TITLE_MAX = 60

/**
 * A session's name: the one the user gave it, else the first line of the user's first request; null before either.
 * It is not cut: [sessionTitle] is the sessions list's.
 */
fun sessionName(transcript: Transcript): String? =
    transcript.customTitle?.takeIf { it.isNotBlank() }
        ?: transcript.messages.order
            .firstNotNullOfOrNull { key -> transcript.messages[key]?.takeIf { it.role == Role.USER } }
            ?.parts
            ?.values()
            ?.firstNotNullOfOrNull { part ->
                (part as? TextRecord)?.text?.lineSequence()?.firstOrNull { it.isNotBlank() }
            }?.trim()

/** A session's name in the sessions list: [sessionName] cut at [TITLE_MAX]. */
fun sessionTitle(transcript: Transcript): String? = sessionName(transcript)?.take(TITLE_MAX)
