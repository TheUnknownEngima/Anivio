package com.nuvio.app.features.details

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

class MangaReaderSettingsSyncTest {
    @Test
    fun webSettingsPayloadIsAppliedAndNativeEditsExportBack() {
        val previous = MangaReaderSettingsRepository.exportPayload()
        try {
            assertTrue(MangaReaderSettingsRepository.replacePayload(
                """{"readingMode":"RIGHT_TO_LEFT","imageScaleMode":"FIT_SCREEN","autoAdvanceChapters":true,"dataSaverEnabled":true}""",
            ))
            val state = MangaReaderSettingsRepository.uiState.value
            assertEquals(MangaReadingMode.RIGHT_TO_LEFT, state.readingMode)
            assertEquals(MangaImageScaleMode.FIT_SCREEN, state.imageScaleMode)
            assertTrue(state.autoAdvanceChapters)
            assertTrue(state.dataSaverEnabled)

            MangaReaderSettingsRepository.setReadingMode(MangaReadingMode.LEFT_TO_RIGHT)
            MangaReaderSettingsRepository.setDataSaverEnabled(false)
            val exported = Json.parseToJsonElement(MangaReaderSettingsRepository.exportPayload()).jsonObject
            assertEquals("LEFT_TO_RIGHT", exported.getValue("readingMode").jsonPrimitive.content)
            assertEquals("false", exported.getValue("dataSaverEnabled").jsonPrimitive.content)
            assertEquals("true", exported.getValue("autoAdvanceChapters").jsonPrimitive.content)
        } finally {
            MangaReaderSettingsRepository.replacePayload(previous)
        }
    }
}
