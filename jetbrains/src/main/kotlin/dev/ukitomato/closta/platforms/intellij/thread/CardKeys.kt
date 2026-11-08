package dev.ukitomato.closta.platforms.intellij.thread

import java.awt.KeyboardFocusManager
import java.awt.event.ActionEvent
import java.awt.event.InputEvent
import java.awt.event.KeyAdapter
import java.awt.event.KeyEvent
import javax.swing.AbstractAction
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

    /** Leaves a text line for the card (Esc there), the answer not given. */
    data object LeaveText : CardKey

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
 * The key table of the waiting cards. [inText] says the keyboard is in a line that takes text: there only Esc (leave
 * the line, [CardKey.LeaveText]), a question's Ctrl+Enter (Cmd+Enter) and [JUMP_KEY] count, so a digit typed there is a
 * digit. Elsewhere a permission or plan card picks with 1 to [choices] (the number row or the keypad, never with a
 * modifier held) and says no with Esc; Enter does nothing there, so a key meant for the composer never allows. A
 * question says no with Esc and answers with Ctrl+Enter (Cmd+Enter); its options take the keyboard the usual way. Tab
 * is left to the focus traversal. Null for any other key. Free of `com.intellij`, so the fast tests check it.
 */
fun cardKey(
    kind: CardKind,
    keyCode: Int,
    modifiersEx: Int,
    choices: Int,
    inText: Boolean,
): CardKey? {
    val held = modifiersEx and MODIFIERS
    val ctrlEnter =
        keyCode == KeyEvent.VK_ENTER && (held == InputEvent.CTRL_DOWN_MASK || held == InputEvent.META_DOWN_MASK)
    return when {
        jumps(keyCode, held) -> CardKey.ToComposer
        keyCode == KeyEvent.VK_ESCAPE && held == 0 -> if (inText) CardKey.LeaveText else CardKey.Deny
        kind == CardKind.QUESTION -> CardKey.Answer.takeIf { ctrlEnter }
        inText || held != 0 -> null
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
 * Gives [card] the keys of [kind] from [cardKey], in its input map for when the keyboard is anywhere in it (not only on
 * the card itself): 1 to 9 and Esc on a permission or plan card, Esc and Ctrl+Enter (Cmd+Enter) on a question. A key
 * [cardKey] has no use for (a digit typed in a text line) is left to the component the keyboard is in. [JUMP_KEY] is
 * here until its action owns it. The card is focusable so Tab reaches it; a question's options take the keyboard, not
 * its panel.
 */
internal fun cardKeys(
    card: JComponent,
    kind: CardKind,
    choices: () -> Int,
    act: (CardKey) -> Unit,
) {
    card.isFocusable = kind != CardKind.QUESTION
    val map = card.getInputMap(JComponent.WHEN_ANCESTOR_OF_FOCUSED_COMPONENT)
    val actions = card.actionMap
    val strokes = ArrayList<Pair<Int, Int>>()
    strokes += Pair(KeyEvent.VK_ESCAPE, 0)
    strokes += Pair(KeyEvent.VK_W, JUMP_MODIFIERS)
    if (kind == CardKind.QUESTION) {
        strokes += Pair(KeyEvent.VK_ENTER, InputEvent.CTRL_DOWN_MASK)
        strokes += Pair(KeyEvent.VK_ENTER, InputEvent.META_DOWN_MASK)
    } else {
        for (code in KeyEvent.VK_1..KeyEvent.VK_9) strokes += Pair(code, 0)
        for (code in KeyEvent.VK_NUMPAD1..KeyEvent.VK_NUMPAD9) strokes += Pair(code, 0)
    }
    strokes.forEach { (code, modifiers) ->
        val name = "closta.card.$code.$modifiers"
        map.put(KeyStroke.getKeyStroke(code, modifiers), name)
        actions.put(
            name,
            object : AbstractAction() {
                private fun key() = cardKey(kind, code, modifiers, choices(), inText())

                override fun isEnabled(): Boolean = key() != null

                override fun actionPerformed(e: ActionEvent) {
                    key()?.let(act)
                }
            },
        )
    }
}

private fun inText(): Boolean {
    val owner = KeyboardFocusManager.getCurrentKeyboardFocusManager().focusOwner
    return owner is JTextComponent && owner.isEditable
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
                if (cardKey(CardKind.PERMISSION, e.keyCode, e.modifiersEx, 0, inText = true) == CardKey.ToComposer) {
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
