package dev.ukitomato.closta.presenter.view

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class TokenTextTest {
    @Test
    fun `under a thousand is written as it is`() {
        assertEquals("0", shortTokens(0))
        assertEquals("999", shortTokens(999))
    }

    @Test
    fun `thousands are written with one decimal and a k`() {
        assertEquals("1.0k", shortTokens(1000))
        assertEquals("21.8k", shortTokens(21819))
        assertEquals("3.4k", shortTokens(3447))
    }

    @Test
    fun `a figure that rounds to a thousand k is written in millions`() {
        assertEquals("1.0M", shortTokens(999_950))
        assertEquals("1.0M", shortTokens(1_000_000))
        assertEquals("12.3M", shortTokens(12_345_678))
    }
}
