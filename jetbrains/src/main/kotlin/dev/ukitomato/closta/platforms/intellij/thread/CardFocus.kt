package dev.ukitomato.closta.platforms.intellij.thread

import java.awt.Component
import java.awt.Container
import javax.swing.AbstractButton
import javax.swing.SwingUtilities
import javax.swing.text.JTextComponent

/**
 * Whether a new card may take the keyboard from [owner]: only when the keyboard is already in the thread's own column
 * ([thread]). Never from the composer — a key typed to send (Enter, 1, 2, Esc) would answer the card instead — and
 * never from the editor. Free of `com.intellij`, so the fast tests check it.
 */
fun cardMayTakeFocus(
    owner: Component?,
    thread: Component,
): Boolean = owner != null && SwingUtilities.isDescendingFrom(owner, thread)

/**
 * What the part of [card] that has the keyboard ([owner]) is, so the card made again gives it to the same part: its
 * name, else a button's text, else its kind; "" for the card itself. Null when the keyboard is not in the card.
 */
fun focusRole(
    owner: Component?,
    card: Component,
): String? =
    when {
        owner == null || !SwingUtilities.isDescendingFrom(owner, card) -> null
        owner === card -> ""
        else -> roleOf(owner)
    }

/**
 * The part of [card] whose role ([focusRole]) is [role] and that can take the keyboard; else the card itself when it
 * takes the keyboard, else its first part that does.
 */
fun partFor(
    role: String,
    card: Container,
): Component? {
    val parts = parts(card).filter { takesKeys(it, card) }
    return parts.firstOrNull { role.isNotEmpty() && roleOf(it) == role }
        ?: card.takeIf { it.isFocusable && it.isVisible }
        ?: parts.firstOrNull()
}

private fun roleOf(part: Component): String = part.name ?: (part as? AbstractButton)?.text ?: part.javaClass.name

private fun parts(container: Container): Sequence<Component> =
    container.components.asSequence().flatMap { part ->
        sequenceOf(part) + ((part as? Container)?.let(::parts) ?: emptySequence())
    }

// A button or a text line that is focusable, enabled, and shown as far as the card goes (the card need not be on
// screen yet). The card's layout panels and labels are not parts that take the keyboard.
private fun takesKeys(
    part: Component,
    card: Component,
): Boolean =
    (part is AbstractButton || part is JTextComponent) &&
        part.isFocusable &&
        part.isEnabled &&
        generateSequence<Component>(part) { it.parent }.takeWhile { it !== card }.all { it.isVisible }
