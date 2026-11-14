package com.nuvio.app.features.home

import com.nuvio.app.features.anilist.seasonAwareHomePoster
import kotlin.test.Test
import kotlin.test.assertEquals

class HomeDiscoveryArtworkTest {
    @Test fun cachedArtworkCannotReplaceFreshTitleOrFilteringMetadata() {
        val fresh = MetaPreview("anilist:3", "series", "Season 3", poster = "current-poster",
            description = "Current synopsis", countryOfOrigin = "JP", mediaFormat = "TV", episodeDurationMinutes = 24)
        val stale = fresh.copy(name = "Old name", description = "Old synopsis", countryOfOrigin = "CN",
            episodeDurationMinutes = 5, poster = "sharp-poster", banner = "wide-backdrop", logo = "title-logo")
        val merged = fresh.withResolvedDiscoveryArtwork(stale)
        assertEquals(fresh.copy(poster = "sharp-poster", banner = "wide-backdrop", logo = "title-logo"), merged)
        assertEquals(fresh, fresh.withResolvedDiscoveryArtwork(stale.copy(id = "anilist:1")))
    }

    @Test fun aSequelWithoutSeasonArtworkKeepsItsOwnPoster() {
        assertEquals("season-three-original", seasonAwareHomePoster("season-three-original", false, 3,
            null, "tvdb-season-one", null, "tmdb-season-one"))
        assertEquals("season-specific", seasonAwareHomePoster("original", false, 3,
            "season-specific", "tvdb-season-one", null, "tmdb-season-one"))
    }

    @Test fun anUnmappedSeasonDoesNotTakeTheGenericFirstSeasonPoster() {
        assertEquals("original", seasonAwareHomePoster("original", false, null,
            null, "generic-tvdb", null, "generic-tmdb"))
        assertEquals("exact-anivio-title", seasonAwareHomePoster("original", false, null,
            null, "generic-tvdb", "exact-anivio-title", "generic-tmdb"))
    }

    @Test fun firstSeasonsAndMoviesCanUseTheHighResolutionPoster() {
        assertEquals("tvdb", seasonAwareHomePoster("original", false, 1, null, "tvdb", null, "tmdb"))
        assertEquals("tvdb", seasonAwareHomePoster("original", true, null, null, "tvdb", null, "tmdb"))
    }
}
