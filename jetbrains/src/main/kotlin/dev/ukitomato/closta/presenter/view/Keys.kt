package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.presenter.tree.TreeRules

/** Turns ids the CLI chose into keys of the tree. */
object Keys {
    private const val ESCAPE = "id:"

    /**
     * The key for a CLI id: the id itself when it is a key ([TreeRules.isKey]), else the id behind an `id:`
     * prefix. An id that already starts with the prefix is prefixed again, so two different ids never get the
     * same key. Every id the captures hold is a key as it is; the escape is for a CLI that changes its ids.
     * The same function makes a tool call's key and its `toolCallId`, which the protocol requires to be equal.
     */
    fun ofCliId(id: String): String = if (TreeRules.isKey(id) && !id.startsWith(ESCAPE)) id else ESCAPE + id
}
