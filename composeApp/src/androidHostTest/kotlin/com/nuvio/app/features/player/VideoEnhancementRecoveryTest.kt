package com.nuvio.app.features.player

import android.app.Application
import android.content.Context
import com.nuvio.app.core.storage.ProfileScopedKey
import com.nuvio.app.features.player.enhancement.AndroidEnhancementController
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import kotlin.test.*

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], application = Application::class)
@androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
class VideoEnhancementRecoveryTest {
    private val context get() = RuntimeEnvironment.getApplication()
    @BeforeTest fun setup() {
        context.getSharedPreferences("nuvio_player_settings", Context.MODE_PRIVATE).edit().clear().commit()
        PlayerSettingsStorage.initialize(context)
        PlayerSettingsRepository.onProfileChanged()
        VideoEnhancementRuntime.report(EnhancementStatus.Off)
    }
    @AfterTest fun cleanup() {
        PlayerSettingsRepository.clearLocalState()
        VideoEnhancementRuntime.report(EnhancementStatus.Off)
    }

    @Test fun enhancementSelectionPersistsAndIsIncludedInSettingsSync() {
        PlayerSettingsRepository.setVideoEnhancement(VideoEnhancement.Fsrcnnx)
        PlayerSettingsRepository.onProfileChanged()
        assertEquals(VideoEnhancement.Fsrcnnx, PlayerSettingsRepository.uiState.value.videoEnhancement)
        assertTrue(PlayerSettingsStorage.exportToSyncPayload().toString().contains("Fsrcnnx"))
    }

    @Test fun anInterruptedPreviousProcessIsDisabledBeforeTheGlPathIsChosen() {
        PlayerSettingsRepository.setVideoEnhancement(VideoEnhancement.Anime4kGan)
        val guard = context.getSharedPreferences("nuvio_player_settings", Context.MODE_PRIVATE)
        guard.edit().putString(ProfileScopedKey.of("video_enhancement_pending"), "previous-process:previous-player").commit()
        AndroidEnhancementController.recoverInterruptedSession(context)
        assertEquals(VideoEnhancement.Off, PlayerSettingsRepository.uiState.value.videoEnhancement)
        assertEquals("Off", PlayerSettingsStorage.loadVideoEnhancement())
        assertEquals(EnhancementStatus.Recovered, VideoEnhancementRuntime.status.value)
        assertNull(guard.getString(ProfileScopedKey.of("video_enhancement_pending"), null))
        // Recovery is consumed once; it must not disable a new deliberate selection.
        PlayerSettingsRepository.setVideoEnhancement(VideoEnhancement.Light)
        AndroidEnhancementController.recoverInterruptedSession(context)
        assertEquals(VideoEnhancement.Light, PlayerSettingsRepository.uiState.value.videoEnhancement)
    }

    @Test fun aCleanSessionDoesNotChangeTheSavedSelection() {
        PlayerSettingsRepository.setVideoEnhancement(VideoEnhancement.Anime4kB)
        AndroidEnhancementController.recoverInterruptedSession(context)
        assertEquals(VideoEnhancement.Anime4kB, PlayerSettingsRepository.uiState.value.videoEnhancement)
    }
}
