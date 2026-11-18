package com.nuvio.app.core.auth

import kotlin.test.Test
import kotlin.test.assertEquals

class DeviceLinkCodeTest {
    @Test
    fun preservesCompleteBackendCode() {
        assertEquals("ABC-DEF-123-456", formatDeviceLinkCode("abcdef123456"))
    }

    @Test
    fun retainsLegacyAndPartialCodes() {
        assertEquals("ABC-DEF", formatDeviceLinkCode("abc-def"))
        assertEquals("AB", formatDeviceLinkCode("ab"))
    }
}
