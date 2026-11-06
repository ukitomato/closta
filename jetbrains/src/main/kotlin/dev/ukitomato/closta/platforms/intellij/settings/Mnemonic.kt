package dev.ukitomato.closta.platforms.intellij.settings

import com.intellij.ui.components.JBLabel
import javax.swing.AbstractButton
import javax.swing.JComponent

/**
 * A label's [text] with its mnemonic underlined at [index]. The bundle's texts carry no `&`: the key is chosen where
 * the label is made, so a translation never shows one.
 */
data class Mnemonic(
    val text: String,
    val index: Int,
) {
    companion object {
        private const val COLONS = ":："

        /**
         * [key] in [text]: at its first letter in either case, or — when the text has none, as a Japanese one does —
         * written in brackets before the trailing colon, the way the IDE's Japanese UI writes mnemonics.
         */
        fun of(
            text: String,
            key: Char,
        ): Mnemonic {
            val upper = key.uppercaseChar()
            val found = text.indexOfFirst { it.uppercaseChar() == upper }
            if (found >= 0) return Mnemonic(text, found)
            val body = text.trimEnd { it in COLONS }
            return Mnemonic("$body($upper)${text.substring(body.length)}", body.length + 1)
        }
    }
}

/** A field's label for [target] with the mnemonic [key]: Alt and the key move to the field; a reader reads both. */
internal fun mnemonicLabel(
    text: String,
    key: Char,
    target: JComponent,
): JBLabel {
    val mnemonic = Mnemonic.of(text, key)
    return JBLabel(mnemonic.text).apply {
        labelFor = target
        displayedMnemonic = key.uppercaseChar().code
        displayedMnemonicIndex = mnemonic.index
    }
}

/** This button with the mnemonic [key] on its text. */
internal fun <B : AbstractButton> B.withMnemonic(key: Char): B =
    apply {
        val shown = Mnemonic.of(text, key)
        text = shown.text
        mnemonic = key.uppercaseChar().code
        displayedMnemonicIndex = shown.index
    }
