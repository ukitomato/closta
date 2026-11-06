package dev.ukitomato.closta.platforms.intellij.thread

import java.awt.Container
import java.awt.KeyboardFocusManager
import java.awt.event.InputEvent
import java.awt.event.KeyAdapter
import java.awt.event.KeyEvent
import javax.swing.JComponent
import javax.swing.KeyStroke
import javax.swing.text.JTextComponent

/** The kinds of waiting card, each with its own keys. */
enum class CardKind { PERMISSION, PLAN, QUESTION }

/** What a key pressed on a waiting card does. */
sealed interface CardKey {
    /** Picks the answer at [index] (the key 1 is 0). */
    data class Choose(
        val index: Int,
    ) : CardKey

    /** No: deny, keep planning, or leave a question unanswered. */
    data object Deny : CardKey

    /** Opens the line for a sentence to go with the answer. */
    data object OpenNote : CardKey

    /** Moves the keyboard out of the card, backwards. */
    data object LeaveBackward : CardKey

    /** Sends a question's answers. */
    data object Answer : CardKey

    /** Gives the keyboard back to the composer, the card left waiting ([JUMP_KEY]). */
    data object ToComposer : CardKey
}

private const val JUMP_MODIFIERS = InputEvent.ALT_DOWN_MASK or InputEvent.SHIFT_DOWN_MASK

/**
 * Alt+Shift+W: in the composer it moves the keyboard to the waiting card at the top, and in a card back to the
 * composer. No action of the IDE's own keymaps ($default, XWin, GNOME, KDE, the macOS ones, Eclipse, NetBeans, Visual
 * Studio) or of a bundled plugin has it.
 */
val JUMP_KEY: KeyStroke = KeyStroke.getKeyStroke(KeyEvent.VK_W, JUMP_MODIFIERS)

/** What a waiting card's keys say, and where: on the card itself, or on the composer's line. */
enum class CardHint { NONE, KEYS, JUMP }

/**
 * The card's keys ([CardHint.KEYS]) only while the keyboard is in it: they do nothing anywhere else. With the keyboard
 * outside and [waiting] cards, the key to go to them ([CardHint.JUMP], on the composer's line). Free of `com.intellij`.
 */
fun cardHint(
    focusInCard: Boolean,
    waiting: Int,
): CardHint =
    when {
        focusInCard -> CardHint.KEYS
        waiting > 0 -> CardHint.JUMP
        else -> CardHint.NONE
    }

private const val MODIFIERS =
    InputEvent.SHIFT_DOWN_MASK or InputEvent.CTRL_DOWN_MASK or InputEvent.ALT_DOWN_MASK or
        InputEvent.META_DOWN_MASK or InputEvent.ALT_GRAPH_DOWN_MASK

/**
 * The key table of the waiting cards. A permission or plan card picks with 1 to [choices] (the number row or the
 * keypad, never with a modifier held), says no with Esc, opens the sentence with Tab and lets go with Shift+Tab; Enter
 * does nothing there, so a key meant for the composer never allows. A question says no with Esc and answers with
 * Ctrl+Enter (Cmd+Enter); its options take the keyboard the usual way. Null for any other key. Free of `com.intellij`,
 * so the fast tests check it.
 */
fun cardKey(
    kind: CardKind,
    keyCode: Int,
    modifiersEx: Int,
    choices: Int,
): CardKey? {
    val held = modifiersEx and MODIFIERS
    return when {
        jumps(keyCode, held) -> CardKey.ToComposer
        keyCode == KeyEvent.VK_ESCAPE && held == 0 -> CardKey.Deny
        kind == CardKind.QUESTION ->
            CardKey.Answer.takeIf {
                keyCode == KeyEvent.VK_ENTER &&
                    (held == InputEvent.CTRL_DOWN_MASK || held == InputEvent.META_DOWN_MASK)
            }
        keyCode == KeyEvent.VK_TAB && held == 0 -> CardKey.OpenNote
        keyCode == KeyEvent.VK_TAB && held == InputEvent.SHIFT_DOWN_MASK -> CardKey.LeaveBackward
        held != 0 -> null
        else -> digit(keyCode)?.takeIf { it < choices }?.let { CardKey.Choose(it) }
    }
}

private fun jumps(
    keyCode: Int,
    held: Int,
): Boolean = keyCode == KeyEvent.VK_W && held == JUMP_MODIFIERS

private fun digit(keyCode: Int): Int? =
    when (keyCode) {
        in KeyEvent.VK_1..KeyEvent.VK_9 -> keyCode - KeyEvent.VK_1
        in KeyEvent.VK_NUMPAD1..KeyEvent.VK_NUMPAD9 -> keyCode - KeyEvent.VK_NUMPAD1
        else -> null
    }

/**
 * Gives [card] the keys of [kind] from [cardKey]. A permission or plan card takes the keyboard itself: Tab reaches it
 * (Ctrl+Tab still moves on) and Shift+Tab moves the keyboard out the usual way. A question listens on all its parts
 * but its text lines, where only Esc and Ctrl+Enter count, so a digit typed there is a digit.
 */
internal fun cardKeys(
    card: JComponent,
    kind: CardKind,
    choices: () -> Int,
    act: (CardKey) -> Unit,
) {
    val listener =
        object : KeyAdapter() {
            override fun keyPressed(e: KeyEvent) {
                val key = cardKey(kind, e.keyCode, e.modifiersEx, choices()).takeUnless { e.isConsumed }
                val inText =
                    e.component is JTextComponent &&
                        key !is CardKey.Deny &&
                        key !is CardKey.Answer &&
                        key !is CardKey.ToComposer
                if (key == null || inText) return
                if (key is CardKey.LeaveBackward) card.transferFocusBackward() else act(key)
                e.consume()
            }
        }
    if (kind == CardKind.QUESTION) {
        // Its options take the keyboard, not the card's own panel.
        card.isFocusable = false

        fun listen(component: java.awt.Component) {
            component.addKeyListener(listener)
            (component as? Container)?.components?.forEach(::listen)
        }
        listen(card)
    } else {
        card.isFocusable = true
        card.setFocusTraversalKeys(
            KeyboardFocusManager.FORWARD_TRAVERSAL_KEYS,
            setOf(KeyStroke.getKeyStroke(KeyEvent.VK_TAB, KeyEvent.CTRL_DOWN_MASK)),
        )
        card.addKeyListener(listener)
    }
}

/**
 * Esc in a card's sentence line [note] closes it ([close]) and gives the keyboard back to [card]; [JUMP_KEY] there
 * gives it to the composer ([leave]), as on the card.
 */
internal fun noteKeys(
    note: JTextComponent,
    card: JComponent,
    leave: () -> Unit,
    close: () -> Unit,
) {
    note.addKeyListener(
        object : KeyAdapter() {
            override fun keyPressed(e: KeyEvent) {
                if (cardKey(CardKind.PERMISSION, e.keyCode, e.modifiersEx, 0) == CardKey.ToComposer) {
                    leave()
                    e.consume()
                    return
                }
                if (e.keyCode != KeyEvent.VK_ESCAPE || e.modifiersEx != 0) return
                close()
                card.requestFocusInWindow()
                e.consume()
            }
        },
    )
}
