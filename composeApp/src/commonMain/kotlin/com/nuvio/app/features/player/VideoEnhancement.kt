package com.nuvio.app.features.player

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import nuvio.composeapp.generated.resources.*
import org.jetbrains.compose.resources.StringResource

enum class VideoEnhancement(val label: StringResource, val description: StringResource, val shaders: List<String>) {
    Off(Res.string.enhancement_off, Res.string.enhancement_off_description, emptyList()),
    Light(Res.string.enhancement_light, Res.string.enhancement_light_description, listOf("Anime4K_Restore_CNN_S.glsl")),
    Anime4kA(Res.string.enhancement_a, Res.string.enhancement_a_description, listOf("Anime4K_Restore_CNN_S.glsl", "Anime4K_Upscale_CNN_x2_S.glsl")),
    Anime4kB(Res.string.enhancement_b, Res.string.enhancement_b_description, listOf("Anime4K_Restore_CNN_Soft_S.glsl", "Anime4K_Upscale_CNN_x2_S.glsl")),
    Anime4kC(Res.string.enhancement_c, Res.string.enhancement_c_description, listOf("Anime4K_Upscale_Denoise_CNN_x2_S.glsl")),
    Fsrcnnx(Res.string.enhancement_fsrcnnx, Res.string.enhancement_fsrcnnx_description, listOf("FSRCNNX_x2_8-0-4-1.glsl")),
    Anime4kGan(Res.string.enhancement_gan, Res.string.enhancement_gan_description, listOf("Anime4K_Upscale_GAN_x2_S.glsl"));

    companion object {
        fun fromStorage(value: String?): VideoEnhancement = entries.firstOrNull { it.name == value } ?: Off
    }
}

internal enum class EnhancementStatus(val message: StringResource) {
    Off(Res.string.enhancement_off_description), Preparing(Res.string.enhancement_preparing),
    Active(Res.string.enhancement_active), Unsupported(Res.string.enhancement_unsupported),
    Hdr(Res.string.enhancement_hdr), NotNeeded(Res.string.enhancement_not_needed),
    MemoryLimit(Res.string.enhancement_memory), Failed(Res.string.enhancement_failed),
    TooSlow(Res.string.enhancement_too_slow), Recovered(Res.string.enhancement_recovered),
    Unavailable(Res.string.enhancement_unavailable),
}

/** Status only. Selection is profile-scoped in PlayerSettingsRepository. */
internal object VideoEnhancementRuntime {
    private val state = MutableStateFlow(EnhancementStatus.Off)
    val status = state.asStateFlow()
    fun report(value: EnhancementStatus) { state.value = value }
}
