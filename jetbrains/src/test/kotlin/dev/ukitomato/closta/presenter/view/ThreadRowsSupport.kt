package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.ConversationState

/** The rows of a transcript that holds no request for input, where core's state has nothing to add. */
fun ThreadRows.of(transcript: Transcript): List<ThreadRow> = of(transcript, ConversationState())
