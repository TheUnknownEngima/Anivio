package com.nuvio.app.features.player.enhancement

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.media3.common.PlaybackException
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.analytics.AnalyticsListener
import com.nuvio.app.core.storage.ProfileScopedKey
import com.nuvio.app.features.player.EnhancementStatus
import com.nuvio.app.features.player.EnhancementResolution
import com.nuvio.app.features.player.PlayerSettingsRepository
import com.nuvio.app.features.player.VideoEnhancement
import com.nuvio.app.features.player.VideoEnhancementRuntime
import java.util.UUID

/** Main-thread controller. GL callbacks are marshalled back and scoped to the active selection. */
@androidx.annotation.OptIn(UnstableApi::class)
internal class AndroidEnhancementController(context: Context, private val pipelineEnabled: Boolean) : AnalyticsListener {
    private val appContext = context.applicationContext
    private val main = Handler(Looper.getMainLooper())
    private val prefs = appContext.getSharedPreferences("nuvio_player_settings", Context.MODE_PRIVATE)
    private val guardKey = ProfileScopedKey.of("video_enhancement_pending")
    private val owner = "$processToken:${UUID.randomUUID()}"
    private var player: ExoPlayer? = null
    private var generation = 0
    private var closed = false
    private var currentMode = VideoEnhancement.Off
    private var currentResolution = EnhancementResolution.Native2k
    private var hasSelection = false
    private var failure: EnhancementStatus? = VideoEnhancementRuntime.status.value.takeIf { it == EnhancementStatus.Recovered }
    private var droppedWindows = 0

    fun attach(exoPlayer: ExoPlayer) {
        player = exoPlayer
        exoPlayer.addAnalyticsListener(this)
        val pending = prefs.getString(guardKey, null)
        if (pending != null && pending.substringBefore(':') != processToken) {
            disableAndClearGuard()
            failure = EnhancementStatus.Recovered
            PlayerSettingsRepository.setVideoEnhancement(VideoEnhancement.Off)
            VideoEnhancementRuntime.report(EnhancementStatus.Recovered)
        }
        if (pipelineEnabled) {
            // Required before prepare(), including when the selected effect is changed later.
            try { exoPlayer.setVideoEffects(emptyList()) } catch (error: Exception) {
                Log.w(TAG, "Could not initialize the video effect path", error)
                fail(EnhancementStatus.Failed)
            }
        }
        select(PlayerSettingsRepository.uiState.value.videoEnhancement)
    }

    fun select(mode: VideoEnhancement, resolution: EnhancementResolution = PlayerSettingsRepository.uiState.value.enhancementResolution) {
        if (closed) return
        if (hasSelection && mode == currentMode && resolution == currentResolution) return
        val exoPlayer = player ?: return
        hasSelection = true
        generation++
        currentMode = mode
        currentResolution = resolution
        droppedWindows = 0
        if (mode == VideoEnhancement.Off) {
            if (pipelineEnabled) runCatching { exoPlayer.setVideoEffects(emptyList()) }
            clearGuard()
            VideoEnhancementRuntime.report(failure ?: EnhancementStatus.Off)
            return
        }
        if (!pipelineEnabled) return // The surface rebuilds once to establish the GL path before prepare.
        failure = null
        if (!prefs.edit().putString(guardKey, owner).commit()) { fail(EnhancementStatus.Failed); return }
        val request = generation
        val metrics = appContext.resources.displayMetrics
        val effect = AnimeShaderEffect(mode, ShaderSize(metrics.widthPixels.coerceAtLeast(1), metrics.heightPixels.coerceAtLeast(1)), resolution) { status, info ->
            main.post {
                if (!closed && request == generation && currentMode != VideoEnhancement.Off) {
                    if (status in terminalFailures) fail(status) else VideoEnhancementRuntime.report(status, info)
                }
            }
        }
        VideoEnhancementRuntime.report(EnhancementStatus.Preparing)
        try { exoPlayer.setVideoEffects(listOf(effect)) } catch (error: Exception) {
            Log.w(TAG, "Could not apply $mode", error)
            fail(EnhancementStatus.Failed)
        }
    }

    /** Media3 itself can fail outside our shader. Rebuild without the GL path once, preserving playback. */
    fun isEffectFailure(error: PlaybackException): Boolean = pipelineEnabled &&
        (error.errorCode == PlaybackException.ERROR_CODE_VIDEO_FRAME_PROCESSOR_INIT_FAILED ||
            error.errorCode == PlaybackException.ERROR_CODE_VIDEO_FRAME_PROCESSING_FAILED)

    fun fail(status: EnhancementStatus) {
        if (closed) return
        generation++
        failure = status
        currentMode = VideoEnhancement.Off
        player?.let { if (pipelineEnabled) runCatching { it.setVideoEffects(emptyList()) } }
        disableAndClearGuard()
        PlayerSettingsRepository.setVideoEnhancement(VideoEnhancement.Off)
        VideoEnhancementRuntime.report(status)
    }

    override fun onDroppedVideoFrames(eventTime: AnalyticsListener.EventTime, droppedFrames: Int, elapsedMs: Long) {
        if (currentMode == VideoEnhancement.Off || elapsedMs < 500) return
        droppedWindows = if (droppedFrames * 1000L / elapsedMs >= 8) droppedWindows + 1 else 0
        if (droppedWindows >= 2) fail(EnhancementStatus.TooSlow)
    }

    override fun onRenderedFirstFrame(eventTime: AnalyticsListener.EventTime, output: Any, renderTimeMs: Long) {
        val request = generation
        main.postDelayed({
            // Extension video renderers may ignore effects instead of reporting a Media3 error.
            if (!closed && request == generation && currentMode != VideoEnhancement.Off &&
                VideoEnhancementRuntime.status.value == EnhancementStatus.Preparing) fail(EnhancementStatus.Unsupported)
        }, 3_000L)
    }

    fun close() {
        closed = true
        generation++
        player?.removeAnalyticsListener(this)
        player = null
        clearGuard()
    }

    private fun clearGuard() {
        // An old player's dispose must not clear the replacement player's crash marker.
        if (prefs.getString(guardKey, null) == owner) prefs.edit().remove(guardKey).commit()
    }

    private fun disableAndClearGuard() {
        // Persist Off and consume the crash marker in one atomic file write.
        prefs.edit().putString(ProfileScopedKey.of("video_enhancement"), VideoEnhancement.Off.name)
            .remove(guardKey).commit()
    }

    companion object {
        private const val TAG = "AnivioEnhancement"
        private val processToken = UUID.randomUUID().toString()
        private val terminalFailures = setOf(EnhancementStatus.Unsupported, EnhancementStatus.MemoryLimit, EnhancementStatus.Failed, EnhancementStatus.TooSlow)

        /** Run before choosing the player's rendering path, so recovery never initializes GL. */
        fun recoverInterruptedSession(context: Context) {
            val prefs = context.applicationContext.getSharedPreferences("nuvio_player_settings", Context.MODE_PRIVATE)
            val key = ProfileScopedKey.of("video_enhancement_pending")
            val pending = prefs.getString(key, null) ?: return
            if (pending.substringBefore(':') == processToken) return
            prefs.edit().putString(ProfileScopedKey.of("video_enhancement"), VideoEnhancement.Off.name).remove(key).commit()
            PlayerSettingsRepository.setVideoEnhancement(VideoEnhancement.Off)
            VideoEnhancementRuntime.report(EnhancementStatus.Recovered)
        }
    }
}
