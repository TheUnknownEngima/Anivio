package com.nuvio.app.features.profiles

import com.nuvio.app.core.anilist.AniZipEpisode
import com.nuvio.app.core.anilist.AniZipImage
import com.nuvio.app.core.anilist.AniZipResponse
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlin.test.Test
import kotlin.test.assertEquals

class ProfileBannerCatalogTest {
    @Test
    fun sequelUsesItsOwnBannerAndEpisodeStills() {
        val sequel = BannerAnime(22, "Season 2", format = "TV", banner = image("sequel"), followsPrequel = true)
        val mapped = mapping(22, "TV").copy(episodes = linkedMapOf(
            "3" to AniZipEpisode(seasonNumber = 2, image = image("episode3")),
            "S1" to AniZipEpisode(seasonNumber = 0, image = image("special")),
            "2" to AniZipEpisode(seasonNumber = 2, image = image("episode2")),
            "1" to AniZipEpisode(seasonNumber = 1, image = image("prequel")),
        ))
        val banners = profileBannerChoices(sequel, mapped, listOf(image("series")))
        assertEquals(listOf(image("sequel"), image("episode2"), image("episode3")), banners.map { it.url })
        assertEquals(listOf(null, 2, 3), banners.map { it.episode })
    }

    @Test
    fun mismatchedMappingCannotReplaceExactTitleArt() {
        val anime = BannerAnime(22, "Sequel", format = "MOVIE", banner = image("own"))
        val banners = profileBannerChoices(anime, mapping(21, "MOVIE"), listOf(image("wrong")))
        assertEquals(listOf(ProfileBanner(image("own"), ProfileBannerSource.AniList)), banners)
    }

    @Test
    fun movieGalleryKeepsDistinctWideImagesFromItsMatchingProviders() {
        val movie = BannerAnime(22, "Movie", format = "MOVIE", banner = image("own"))
        val banners = profileBannerChoices(movie, mapping(22, "MOVIE"), listOf(
            image("own"), image("tmdb1"), image("tmdb2"), "http://example.test/insecure.jpg",
        ))
        assertEquals(listOf(image("own"), image("tmdb1"), image("tmdb2"), image("fanart")), banners.map { it.url })
    }

    private fun mapping(id: Int, type: String) = AniZipResponse(
        mappings = buildJsonObject { put("anilist_id", id); put("type", type) },
        images = listOf(AniZipImage("Fanart", image("fanart")), AniZipImage("Poster", image("poster"))),
    )

    private fun image(name: String) = "https://example.test/$name.jpg"
}
