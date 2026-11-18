package com.nuvio.app.features.party

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class PartyChatSessionTest {
    @Test
    fun rejoiningSameRoomInvalidatesPreviousWorkAndCleanup() {
        val sessions = PartyChatSessionGuard()
        val first = sessions.start()
        val second = sessions.start()
        assertFalse(sessions.isCurrent(first))
        assertFalse(sessions.stop(first))
        assertTrue(sessions.isCurrent(second))
        assertTrue(sessions.stop(second))
        assertFalse(sessions.isCurrent(second))
    }

    @Test
    fun onlyMessagesFromTheCurrentJoinAreVisible() {
        val room = PartyChatRoom("same-room", "me", emptyList(), startedAtMs = 1_000)
        val old = PartyChatPayload(1, "other", body = "Old session", sentAt = 999)
        val boundary = old.copy(id = 2, sentAt = 1_000)
        val fresh = old.copy(id = 3, sentAt = 1_001)
        assertEquals(listOf(boundary, fresh), currentSessionChat(room, listOf(old, boundary, fresh, old.copy(sentAt = 0))))
    }

    @Test
    fun liveMemberIdentityReplacesStoredChatAvatarAndName() {
        val message = PartyChatMessage("1", 1, "user", "Old name", "https://old/avatar", "#000000", "Hello", 10, false)
        val updated = message.withCurrentPartyProfile(listOf(PartyMember("user", "New name", "https://new/avatar", "#ffffff")))
        assertEquals("New name", updated.name)
        assertEquals("https://new/avatar", updated.avatarUrl)
        assertEquals("#ffffff", updated.avatarColor)
        assertNull(message.withCurrentPartyProfile(listOf(PartyMember("user", "No avatar"))).avatarUrl)
        assertEquals(message, message.withCurrentPartyProfile(emptyList()))
    }

    @Test
    fun newJoinClearsDraftAndOldOwnerCannotStopIt() {
        val room = PartyChatRoom("same-room", "me", emptyList(), 1_000)
        val first = PartyChat.start(room)
        try {
            PartyChat.draft.value = "Unsent old message"
            val second = PartyChat.start(room.copy(startedAtMs = 2_000))
            assertEquals("", PartyChat.draft.value)
            assertEquals(emptyList(), PartyChat.messages.value)
            assertEquals(0, PartyChat.unread.value)
            PartyChat.stop(first)
            assertEquals(second, PartyChat.activeSession.value)
            PartyChat.stop(second)
            assertNull(PartyChat.activeSession.value)
        } finally {
            PartyChat.stop(PartyChat.activeSession.value)
        }
    }
}
