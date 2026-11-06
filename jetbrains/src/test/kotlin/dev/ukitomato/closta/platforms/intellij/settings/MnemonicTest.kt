package dev.ukitomato.closta.platforms.intellij.settings

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class MnemonicTest {
    @Test
    fun `the key is underlined where the text has it, whatever its case`() {
        assertEquals(Mnemonic("AWS region:", 4), Mnemonic.of("AWS region:", 'R'))
        assertEquals(Mnemonic("Name:", 0), Mnemonic.of("Name:", 'n'))
        assertEquals(Mnemonic("Access key ID:", 11), Mnemonic.of("Access key ID:", 'I'))
    }

    @Test
    fun `a text without the key gets it in brackets before its colon, as the IDE's Japanese UI writes it`() {
        assertEquals(Mnemonic("名前(N):", 3), Mnemonic.of("名前:", 'N'))
        assertEquals(Mnemonic("コード(C)：", 4), Mnemonic.of("コード：", 'c'))
        assertEquals(Mnemonic("保存したキーを削除(V)", 10), Mnemonic.of("保存したキーを削除", 'V'))
    }

    @Test
    fun `the text never shows an ampersand it did not have`() {
        listOf("Name:", "名前:", "Appearance & Behavior").forEach {
            assertEquals(it.count { c -> c == '&' }, Mnemonic.of(it, 'Z').text.count { c -> c == '&' }) { it }
        }
    }
}
