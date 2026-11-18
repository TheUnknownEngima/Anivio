package com.nuvio.app.features.profiles

import com.nuvio.app.core.anilist.AniListClient
import com.nuvio.app.core.anilist.AniZipClient
import com.nuvio.app.core.anilist.AniZipResponse
import com.nuvio.app.core.anilist.anilistId
import com.nuvio.app.core.anilist.mappedSeasonNumber
import com.nuvio.app.core.anilist.mappedType
import com.nuvio.app.core.anilist.tmdbId
import com.nuvio.app.features.tmdb.TmdbArtworkSource
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray

internal data class BannerAnimePage(val titles: List<BannerAnime>, val hasMore: Boolean)

internal data class BannerAnime(
    val id: Int,
    val title: String,
    val year: Int? = null,
    val format: String? = null,
    val banner: String? = null,
    val poster: String? = null,
    val followsPrequel: Boolean = false,
)

internal data class ProfileBanner(val url: String, val source: ProfileBannerSource, val episode: Int? = null)
internal enum class ProfileBannerSource { AniList, Tmdb, MappedArtwork, Episode }

internal object ProfileBannerCatalog {
    private val query = """
        query (${'$'}page: Int!, ${'$'}search: String, ${'$'}sort: [MediaSort!], ${'$'}country: CountryCode) {
          Page(page: ${'$'}page, perPage: 24) {
            pageInfo { hasNextPage }
            media(type: ANIME, isAdult: false, countryOfOrigin: ${'$'}country, search: ${'$'}search, sort: ${'$'}sort) {
              id title { english romaji } seasonYear format bannerImage coverImage { large }
              relations { edges { relationType } }
            }
          }
        }
    """.trimIndent()

    suspend fun titles(search: String, page: Int): BannerAnimePage {
        val data = AniListClient.query(query, buildJsonObject {
            put("page", page)
            putJsonArray("sort") { add(JsonPrimitive(if (search.isBlank()) "POPULARITY_DESC" else "SEARCH_MATCH")) }
            if (search.isBlank()) {
                put("country", "JP")
            } else {
                put("search", search)
            }
        })
        val result = AniListClient.json.decodeFromJsonElement<BannerPageResponse>(requireNotNull(data["Page"]))
        val titles = result.media.filterNotNull().mapNotNull { media ->
            val title = media.title.english?.takeIf(String::isNotBlank)
                ?: media.title.romaji?.takeIf(String::isNotBlank)
                ?: return@mapNotNull null
            BannerAnime(
                id = media.id,
                title = title,
                year = media.seasonYear,
                format = media.format,
                banner = bannerImageUrl(media.bannerImage),
                poster = bannerImageUrl(media.coverImage?.large),
                followsPrequel = media.relations?.edges.orEmpty().any { it?.relationType == "PREQUEL" },
            )
        }.distinctBy(BannerAnime::id)
        return BannerAnimePage(titles, result.pageInfo.hasNextPage)
    }

    suspend fun artwork(anime: BannerAnime): List<ProfileBanner> {
        val mapped = AniZipClient.mappings(anime.id)?.takeIf { it.anilistId()?.toIntOrNull() == anime.id }
        currentCoroutineContext().ensureActive()
        val tmdbImages = mapped?.tmdbId()?.takeIf { allowTitleBackdrops(anime, mapped) }?.let {
            TmdbArtworkSource.backdropUrls(it, isMovie = anime.format == "MOVIE")
        }.orEmpty()
        return profileBannerChoices(anime, mapped, tmdbImages)
    }
}

private fun allowTitleBackdrops(anime: BannerAnime, mapping: AniZipResponse): Boolean {
    if (anime.format == "MOVIE") return mapping.mappedType().equals("MOVIE", ignoreCase = true)
    // Series backdrops can depict the original season or a different cour with the same series ID.
    return anime.format == "TV" && !anime.followsPrequel && mapping.mappedSeasonNumber() == 1
}

internal fun profileBannerChoices(
    anime: BannerAnime,
    mapping: AniZipResponse?,
    tmdbImages: List<String>,
): List<ProfileBanner> = buildList {
    bannerImageUrl(anime.banner)?.let { add(ProfileBanner(it, ProfileBannerSource.AniList)) }
    val exact = mapping?.takeIf { it.anilistId()?.toIntOrNull() == anime.id } ?: return@buildList
    if (allowTitleBackdrops(anime, exact)) {
        tmdbImages.mapNotNull(::bannerImageUrl).forEach { add(ProfileBanner(it, ProfileBannerSource.Tmdb)) }
        exact.images.filter { it.coverType.equals("Fanart", ignoreCase = true) }
            .mapNotNull { bannerImageUrl(it.url) }
            .forEach { add(ProfileBanner(it, ProfileBannerSource.MappedArtwork)) }
    }
    val season = exact.mappedSeasonNumber()
    exact.episodes.entries.mapNotNull { (key, episode) ->
        val number = key.toIntOrNull()?.takeIf { it > 0 } ?: return@mapNotNull null
        if (season != null && episode.seasonNumber != season) return@mapNotNull null
        if (episode.seasonNumber == 0) return@mapNotNull null
        bannerImageUrl(episode.image)?.let { ProfileBanner(it, ProfileBannerSource.Episode, number) }
    }.sortedBy { it.episode }.forEach(::add)
}.distinctBy(ProfileBanner::url)

private fun bannerImageUrl(value: String?): String? =
    value?.trim()?.takeIf { it.startsWith("https://", ignoreCase = true) && it.isValidAvatarUrl() }

@Serializable
private data class BannerPageResponse(
    val pageInfo: BannerPageInfo,
    val media: List<BannerMedia?> = emptyList(),
)

@Serializable
private data class BannerPageInfo(val hasNextPage: Boolean = false)

@Serializable
private data class BannerMedia(
    val id: Int,
    val title: BannerTitle,
    val seasonYear: Int? = null,
    val format: String? = null,
    val bannerImage: String? = null,
    val coverImage: BannerCover? = null,
    val relations: BannerRelations? = null,
)

@Serializable
private data class BannerTitle(val english: String? = null, val romaji: String? = null)

@Serializable
private data class BannerCover(val large: String? = null)

@Serializable
private data class BannerRelations(val edges: List<BannerRelation?> = emptyList())

@Serializable
private data class BannerRelation(val relationType: String? = null)
