package dev.ukitomato.closta.platforms.intellij.chat

import java.awt.Component
import javax.swing.SwingUtilities

// When the keyboard goes back to the composer, decided without the IDE. Free of `com.intellij`.

/**
 * Whether the keyboard went away with [lostFrom] (a card answered, a bar decided, a tab closed): it was in it, or it
 * is nowhere. A null [lostFrom] is an action that always gives it back (the composer's own Bypass bar).
 */
fun keyboardWentWith(
    owner: Component?,
    lostFrom: Component?,
): Boolean = lostFrom == null || owner == null || SwingUtilities.isDescendingFrom(owner, lostFrom)

/**
 * Whether the composer takes the keyboard back once focus has settled: it is shown (a subagent's tab hides it), and
 * the keyboard is nowhere or still in the conversation's [panel] — never from the editor or a list the user moved to.
 */
fun composerMayTakeBack(
    owner: Component?,
    panel: Component,
    composerShown: Boolean,
): Boolean = composerShown && (owner == null || SwingUtilities.isDescendingFrom(owner, panel))
