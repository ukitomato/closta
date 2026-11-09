package dev.ukitomato.closta.presenter.view

/** What a refusal says when the CLI's own error carried no sentence. */
internal const val NO_SENTENCE = "The request was refused."

/** The most characters of the CLI's error a refusal keeps. */
internal const val MAX_DETAIL_CHARS = 500

/** What a refusal says: the CLI's error, trimmed and cut to [MAX_DETAIL_CHARS], or [NO_SENTENCE] when it has none. */
internal fun plainSentenceOf(error: String?): String =
    error?.trim()?.takeIf { it.isNotEmpty() }?.take(MAX_DETAIL_CHARS) ?: NO_SENTENCE
