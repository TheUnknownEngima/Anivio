package com.nuvio.app.features.anime

import com.nuvio.app.core.anilist.AniZipResponse
import com.nuvio.app.features.anilist.ANILIST_SEASON
import com.nuvio.app.features.anilist.isAniListId

private val numberedSeason = Regex("""\bseason\s+([1-9]\d?)\b""", RegexOption.IGNORE_CASE)
private val ordinalSeason = Regex("""\b([1-9]\d?)(?:st|nd|rd|th)\s+season\b""", RegexOption.IGNORE_CASE)
private val seasonOrdinals = listOf("first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth")
private val namedSeason = Regex(
    """\b(${seasonOrdinals.joinToString("|")})\s+season\b""",
    RegexOption.IGNORE_CASE,
)

internal fun animeDisplaySeason(title: String?, aniZip: AniZipResponse? = null): Int? {
    val name = title.orEmpty()
    val titleSeason = numberedSeason.find(name)?.groupValues?.get(1)?.toIntOrNull()
        ?: ordinalSeason.find(name)?.groupValues?.get(1)?.toIntOrNull()
        ?: namedSeason.find(name)?.groupValues?.get(1)?.lowercase()?.let { ordinal ->
            seasonOrdinals.indexOf(ordinal) + 1
        }

    // Some entries span several seasons in external databases. Only use an unambiguous mapping.
    return titleSeason ?: aniZip?.episodes
        ?.filterKeys { it.toIntOrNull() != null }
        ?.values
        ?.mapNotNull { episode -> episode.seasonNumber?.takeIf { it > 0 } }
        ?.distinct()
        ?.singleOrNull()
}

/** For displays that only have a title and the saved playback coordinates. */
internal fun animeEpisodeSeasonForDisplay(contentId: String, title: String, seasonNumber: Int?): Int? =
    if (seasonNumber == ANILIST_SEASON && (isAniListId(contentId) || contentId.startsWith("mal:", ignoreCase = true))) {
        animeDisplaySeason(title) ?: seasonNumber
    } else {
        seasonNumber
    }
