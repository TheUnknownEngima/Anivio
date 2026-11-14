package com.nuvio.app.features.anivio

import com.nuvio.app.core.anivio.AnivioClient
import com.nuvio.app.core.anivio.posterUrl
import com.nuvio.app.features.anilist.isAniListId
import com.nuvio.app.features.anilist.parseAniListMediaId
import com.nuvio.app.features.home.MetaPreview
import com.nuvio.app.features.tracking.TrackingSettingsRepository
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope

/** Replaces card posters with Anivio artwork when it has a matching AniList record. */
suspend fun enrichPreviewPostersWithAnivio(items: List<MetaPreview>): List<MetaPreview> {
    TrackingSettingsRepository.ensureLoaded()
    if (!TrackingSettingsRepository.uiState.value.anivioAssetsEnabled) return items

    return coroutineScope {
        items.map { item ->
            async {
                if (!isAniListId(item.id)) return@async item
                val mediaId = parseAniListMediaId(item.id) ?: return@async item
                val media = AnivioClient.mediaByAniListIdOrNull(mediaId)
                item.copy(
                    poster = media?.posterUrl ?: item.poster,
                    countryOfOrigin = item.countryOfOrigin ?: media?.countryOfOrigin,
                    mediaFormat = item.mediaFormat ?: media?.format,
                    episodeDurationMinutes = item.episodeDurationMinutes ?: media?.duration?.takeIf { it > 0 },
                    artworkColor = item.artworkColor ?: media?.coverImage?.color,
                )
            }
        }.awaitAll()
    }
}
