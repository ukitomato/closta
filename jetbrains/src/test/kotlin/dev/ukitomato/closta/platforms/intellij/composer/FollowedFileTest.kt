package dev.ukitomato.closta.platforms.intellij.composer

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class FollowedFileTest {
    @Test
    fun theChatsOwnTabIsNotFollowed() = assertFalse(followable(isChatFile = true, isLocal = true))

    @Test
    fun aNonLocalFileIsNotFollowed() = assertFalse(followable(isChatFile = false, isLocal = false))

    @Test
    fun aLocalFileIsFollowed() = assertTrue(followable(isChatFile = false, isLocal = true))
}
