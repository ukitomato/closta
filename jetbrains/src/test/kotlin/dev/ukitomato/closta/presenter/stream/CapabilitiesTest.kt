package dev.ukitomato.closta.presenter.stream

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

/** The names a host may give, and where each kind goes: a command's, a field of a command, a part of the IDE. */
class CapabilitiesTest {
    @Test
    fun `commands, fields and parts of the IDE are named once each, in that order`() {
        val names =
            Capabilities.of(
                listOf("send", "respond-approval"),
                listOf("files", "files"),
                listOf("accept-suggestions"),
            )
        assertEquals(listOf("send", "respond-approval", "accept-suggestions", "files"), names.names)
    }

    @Test
    fun `a name that is not in the vocabulary is refused`() {
        assertThrows(IllegalArgumentException::class.java) { Capabilities.of(listOf("nope"), emptyList()) }
    }

    @Test
    fun `a field is one of the fields, and a command's or the IDE's name is not one`() {
        for (notAField in listOf("send", "files", "nope")) {
            assertThrows(IllegalArgumentException::class.java, {
                Capabilities.of(emptyList(), emptyList(), listOf(notAField))
            }, notAField)
        }
    }
}
