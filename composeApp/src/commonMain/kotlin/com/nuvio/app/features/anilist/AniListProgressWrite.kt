package com.nuvio.app.features.anilist

import com.nuvio.app.core.anilist.AniListMediaListEntry

internal data class AniListProgressWrite(val progress: Int, val status: String?)

/** A progress advance may promote Planning, but never undo progress or a deliberate list status. */
internal fun aniListProgressWrite(entry: AniListMediaListEntry?, requested: Int): AniListProgressWrite? {
    if (requested <= 0) return null
    val previous = entry?.progress ?: 0
    val progress = maxOf(previous, requested)
    val status = entry?.status?.uppercase()
    val promote = status == null || status == AniListListStatus.PLANNING
    if (requested <= previous && !promote) return null
    val total = entry?.media?.let { it.episodes ?: it.chapters }?.takeIf { it > 0 }
    val nextStatus = if (promote) {
        if (entry?.media?.status == "FINISHED" && total != null && progress >= total)
            AniListListStatus.COMPLETED else AniListListStatus.CURRENT
    } else null
    return AniListProgressWrite(progress, nextStatus)
}

/** Forward writes share a policy; raw setProgress remains available for explicit unwatch/rollback. */
internal suspend fun advanceAniListProgress(mediaId: Int, progress: Int, manga: Boolean = false): Boolean {
    AniListListRepository.ensureLoaded()
    fun entry() = (if (manga) AniListListRepository.snapshot().manga else AniListListRepository.snapshot().anime)
        .firstOrNull { it.media?.id == mediaId }
    if (entry() == null) AniListListRepository.refresh(forceRefresh = false)
    val write = aniListProgressWrite(entry(), progress) ?: return true
    return if (write.status == null) AniListMutations.setProgress(mediaId, write.progress)
        else AniListMutations.setStatusAndProgress(mediaId, write.status, write.progress)
}
